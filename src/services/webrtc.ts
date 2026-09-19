import { ChatMessage, SignalMessage } from '../types/meeting';

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export interface PeerConnectionCallbacks {
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onConnectionStateChange: (peerId: string, state: RTCPeerConnectionState) => void;
  onChatMessage: (message: ChatMessage) => void;
  sendSignal: (signal: SignalMessage) => void;
}

export class PeerConnectionManager {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private remoteStreams = new Map<string, MediaStream>();
  private candidateQueues = new Map<string, RTCIceCandidateInit[]>();
  private makingOffers = new Map<string, boolean>();
  private ignoreOffers = new Map<string, boolean>();
  private isSettingRemoteAnswerPending = new Map<string, boolean>();

  private localPeerId: string;
  private localName: string;
  private localStream: MediaStream | null = null;
  private callbacks: PeerConnectionCallbacks;

  constructor(localPeerId: string, localName: string, callbacks: PeerConnectionCallbacks) {
    this.localPeerId = localPeerId;
    this.localName = localName;
    this.callbacks = callbacks;
  }

  public setLocalStream(stream: MediaStream | null) {
    const prevStream = this.localStream;
    this.localStream = stream;

    // Update all existing peer connections with the new stream tracks
    for (const [peerId, pc] of this.peerConnections.entries()) {
      if (pc.connectionState === 'closed') continue;

      if (stream) {
        stream.getTracks().forEach((track) => {
          // Find sender for this track's kind
          const senders = pc.getSenders();
          const sender = senders.find((s) => s.track && s.track.kind === track.kind);

          if (sender) {
            if (sender.track !== track) {
              sender.replaceTrack(track).catch((err) => {
                console.error(`Failed to replace track for peer ${peerId}:`, err);
              });
            }
          } else {
            // Check if there is a transceiver without a track of this kind
            const transceivers = pc.getTransceivers();
            const emptyTransceiver = transceivers.find(
              (t) =>
                (!t.sender.track || t.sender.track.kind === track.kind) &&
                t.direction !== 'recvonly'
            );
            if (emptyTransceiver && emptyTransceiver.sender) {
              emptyTransceiver.sender.replaceTrack(track).catch((err) => {
                console.error(`Failed to replace track on transceiver for peer ${peerId}:`, err);
              });
            } else {
              try {
                pc.addTrack(track, stream);
              } catch (e) {
                console.warn(`Could not add track for peer ${peerId}:`, e);
              }
            }
          }
        });
      } else if (prevStream) {
        // Stream stopped: replace track with null
        pc.getSenders().forEach((sender) => {
          if (sender.track) {
            sender.replaceTrack(null).catch(() => {});
          }
        });
      }
    }
  }

  public getOrCreatePeerConnection(remotePeerId: string): RTCPeerConnection {
    let pc = this.peerConnections.get(remotePeerId);
    if (pc && pc.connectionState !== 'closed') {
      return pc;
    }

    pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(remotePeerId, pc);
    this.makingOffers.set(remotePeerId, false);
    this.ignoreOffers.set(remotePeerId, false);
    this.isSettingRemoteAnswerPending.set(remotePeerId, false);
    this.candidateQueues.set(remotePeerId, []);

    // Deterministic politeness: peer with lexicographically lower ID is polite
    const isPolite = this.localPeerId < remotePeerId;

    // Attach local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          pc!.addTrack(track, this.localStream!);
        } catch (e) {
          console.warn('Error adding initial track to peer connection:', e);
        }
      });
    }

    // Initialize or reuse remote stream container
    let remoteStream = this.remoteStreams.get(remotePeerId);
    if (!remoteStream) {
      remoteStream = new MediaStream();
      this.remoteStreams.set(remotePeerId, remoteStream);
    }

    // Track handler: handles audio & video tracks arriving from peer
    pc.ontrack = (event) => {
      let stream = event.streams && event.streams[0];
      if (!stream) {
        let existing = this.remoteStreams.get(remotePeerId);
        if (!existing) {
          existing = new MediaStream();
          this.remoteStreams.set(remotePeerId, existing);
        }
        if (!existing.getTracks().some((t) => t.id === event.track.id)) {
          existing.addTrack(event.track);
        }
        stream = existing;
      } else {
        this.remoteStreams.set(remotePeerId, stream);
      }
      this.callbacks.onRemoteStream(remotePeerId, stream);
    };

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.sendSignal({
          type: 'candidate',
          fromPeerId: this.localPeerId,
          fromName: this.localName,
          targetPeerId: remotePeerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Connection state monitor
    pc.onconnectionstatechange = () => {
      this.callbacks.onConnectionStateChange(remotePeerId, pc!.connectionState);
      if (pc!.connectionState === 'failed') {
        // Attempt ICE restart
        try {
          pc!.restartIce();
        } catch (e) {
          console.warn('ICE restart attempt failed:', e);
        }
      }
    };

    // Data channel setup
    if (isPolite) {
      const dataChannel = pc.createDataChannel('meeting-chat', {
        ordered: true,
      });
      this.setupDataChannel(remotePeerId, dataChannel);
    } else {
      pc.ondatachannel = (event) => {
        this.setupDataChannel(remotePeerId, event.channel);
      };
    }

    // Perfect negotiation: onnegotiationneeded
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffers.set(remotePeerId, true);
        await pc!.setLocalDescription();
        this.callbacks.sendSignal({
          type: 'offer',
          fromPeerId: this.localPeerId,
          fromName: this.localName,
          targetPeerId: remotePeerId,
          sdp: pc!.localDescription ?? undefined,
        });
      } catch (err) {
        console.error(`Negotiation failed for ${remotePeerId}:`, err);
      } finally {
        this.makingOffers.set(remotePeerId, false);
      }
    };

    return pc;
  }

  private setupDataChannel(remotePeerId: string, channel: RTCDataChannel) {
    this.dataChannels.set(remotePeerId, channel);

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ChatMessage;
        this.callbacks.onChatMessage(msg);
      } catch (err) {
        console.error('Failed to parse chat message:', err);
      }
    };

    channel.onclose = () => {
      this.dataChannels.delete(remotePeerId);
    };
  }

  public async handleSignal(signal: SignalMessage) {
    const { fromPeerId, type, sdp, candidate } = signal;
    if (fromPeerId === this.localPeerId) return;

    let pc = this.getOrCreatePeerConnection(fromPeerId);
    const isPolite = this.localPeerId < fromPeerId;

    try {
      if (type === 'offer') {
        if (!sdp) return;

        const isMakingOffer = this.makingOffers.get(fromPeerId) || false;
        const isSettingRemoteAnswer = this.isSettingRemoteAnswerPending.get(fromPeerId) || false;
        const readyForOffer = !isMakingOffer && (pc.signalingState === 'stable' || isSettingRemoteAnswer);
        const offerCollision = !readyForOffer;

        const ignoreOffer = !isPolite && offerCollision;
        this.ignoreOffers.set(fromPeerId, ignoreOffer);

        if (ignoreOffer) {
          console.warn(`[WebRTC] Glare collision: Impolite peer ${this.localPeerId} ignored offer from ${fromPeerId}`);
          return;
        }

        if (offerCollision && pc.signalingState === 'have-local-offer') {
          // Polite peer rolls back if needed
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (e) {
            console.warn('Rollback warning:', e);
          }
        }

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (srdErr: unknown) {
          const errMsg = srdErr instanceof Error ? srdErr.message : String(srdErr);
          // Self-healing: if remote description failed due to m-sections or ICE restart mismatch (e.g. peer recreated PC)
          if (errMsg.includes('m-sections') || errMsg.includes('ICE restart') || pc.connectionState === 'failed') {
            console.warn(`[WebRTC] Incompatible offer received from ${fromPeerId}. Resetting connection:`, errMsg);
            this.removePeer(fromPeerId);
            pc = this.getOrCreatePeerConnection(fromPeerId);
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          } else {
            throw srdErr;
          }
        }

        await pc.setLocalDescription();
        this.callbacks.sendSignal({
          type: 'answer',
          fromPeerId: this.localPeerId,
          fromName: this.localName,
          targetPeerId: fromPeerId,
          sdp: pc.localDescription ?? undefined,
        });

        // Flush queued candidates after remote description is set
        await this.flushCandidateQueue(fromPeerId, pc);
      } else if (type === 'answer') {
        if (!sdp) return;

        this.isSettingRemoteAnswerPending.set(fromPeerId, true);
        try {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            // Flush queued candidates after remote description is set
            await this.flushCandidateQueue(fromPeerId, pc);
          } else {
            console.warn(`[WebRTC] Ignoring answer from ${fromPeerId} in signaling state: ${pc.signalingState}`);
          }
        } catch (srdErr: unknown) {
          const errMsg = srdErr instanceof Error ? srdErr.message : String(srdErr);
          if (errMsg.includes('m-sections') || errMsg.includes('ICE restart') || pc.connectionState === 'failed') {
            console.warn(`[WebRTC] Incompatible answer from ${fromPeerId}. Resetting connection:`, errMsg);
            this.removePeer(fromPeerId);
          } else {
            throw srdErr;
          }
        } finally {
          this.isSettingRemoteAnswerPending.set(fromPeerId, false);
          this.ignoreOffers.set(fromPeerId, false);
        }
      } else if (type === 'candidate') {
        if (!candidate) return;

        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            if (!this.ignoreOffers.get(fromPeerId)) {
              console.warn('Failed to add incoming ice candidate:', e);
            }
          }
        } else {
          // Queue candidate until remote description arrives
          const queue = this.candidateQueues.get(fromPeerId) || [];
          queue.push(candidate);
          this.candidateQueues.set(fromPeerId, queue);
        }
      }
    } catch (err) {
      console.error(`Error handling signal ${type} from ${fromPeerId}:`, err);
    }
  }

  private async flushCandidateQueue(fromPeerId: string, pc: RTCPeerConnection) {
    const queued = this.candidateQueues.get(fromPeerId) || [];
    this.candidateQueues.set(fromPeerId, []);
    for (const cand of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        if (!this.ignoreOffers.get(fromPeerId)) {
          console.warn('Failed to add queued ice candidate:', e);
        }
      }
    }
  }

  public sendChatMessage(message: ChatMessage) {
    const payload = JSON.stringify(message);
    let sentCount = 0;

    for (const channel of this.dataChannels.values()) {
      if (channel.readyState === 'open') {
        try {
          channel.send(payload);
          sentCount++;
        } catch (e) {
          console.error('Failed to send data channel message:', e);
        }
      }
    }

    return sentCount;
  }

  public removePeer(remotePeerId: string) {
    const pc = this.peerConnections.get(remotePeerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(remotePeerId);
    }

    const channel = this.dataChannels.get(remotePeerId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(remotePeerId);
    }

    this.remoteStreams.delete(remotePeerId);
    this.candidateQueues.delete(remotePeerId);
    this.makingOffers.delete(remotePeerId);
    this.ignoreOffers.delete(remotePeerId);
    this.isSettingRemoteAnswerPending.delete(remotePeerId);
  }

  public destroy() {
    for (const remotePeerId of Array.from(this.peerConnections.keys())) {
      this.removePeer(remotePeerId);
    }
  }
}
