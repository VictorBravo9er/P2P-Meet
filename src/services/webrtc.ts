import { ChatMessage, SignalMessage } from '../types/meeting';

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
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
          // Look for existing transceiver or sender for this track's kind
          const transceivers = pc.getTransceivers();
          const transceiver = transceivers.find(
            (t) =>
              (t.sender.track && t.sender.track.kind === track.kind) ||
              (t.receiver.track && t.receiver.track.kind === track.kind)
          );

          if (transceiver && transceiver.sender) {
            transceiver.sender.replaceTrack(track).catch((err) => {
              console.error(`Failed to replace track for peer ${peerId}:`, err);
            });
          } else {
            pc.addTrack(track, stream);
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
    this.candidateQueues.set(remotePeerId, []);

    // Deterministic politeness: peer with lexicographically lower ID is polite
    const isPolite = this.localPeerId < remotePeerId;

    // Attach local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc!.addTrack(track, this.localStream!);
      });
    }

    // Initialize remote stream container
    const remoteStream = new MediaStream();
    this.remoteStreams.set(remotePeerId, remoteStream);

    // Track handler
    pc.ontrack = (event) => {
      if (event.track) {
        remoteStream.addTrack(event.track);
        this.callbacks.onRemoteStream(remotePeerId, remoteStream);
      }
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

    const pc = this.getOrCreatePeerConnection(fromPeerId);
    const isPolite = this.localPeerId < fromPeerId;

    try {
      if (type === 'offer' || type === 'answer') {
        if (!sdp) return;

        const isMakingOffer = this.makingOffers.get(fromPeerId) || false;
        const offerCollision = type === 'offer' && (isMakingOffer || pc.signalingState !== 'stable');

        const ignore = !isPolite && offerCollision;
        this.ignoreOffers.set(fromPeerId, ignore);

        if (ignore) {
          console.warn(`[WebRTC] Glare collision: Impolite peer ${this.localPeerId} ignored offer from ${fromPeerId}`);
          return;
        }

        if (offerCollision && pc.signalingState !== 'stable') {
          // Polite peer rolls back its own offer
          await pc.setLocalDescription({ type: 'rollback' });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        if (type === 'offer') {
          await pc.setLocalDescription();
          this.callbacks.sendSignal({
            type: 'answer',
            fromPeerId: this.localPeerId,
            fromName: this.localName,
            targetPeerId: fromPeerId,
            sdp: pc.localDescription ?? undefined,
          });
        }

        // Flush queued candidates after remote description is set
        const queued = this.candidateQueues.get(fromPeerId) || [];
        this.candidateQueues.set(fromPeerId, []);
        for (const cand of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn('Failed to add queued ice candidate:', e);
          }
        }
      } else if (type === 'candidate') {
        if (!candidate) return;

        const isIgnored = this.ignoreOffers.get(fromPeerId);
        if (isIgnored) return;

        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn('Failed to add incoming ice candidate:', e);
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
  }

  public destroy() {
    for (const remotePeerId of this.peerConnections.keys()) {
      this.removePeer(remotePeerId);
    }
  }
}
