import { ChatMessage, SignalMessage } from '../types/meeting';

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export type StreamQoSType = 'audio' | 'screen' | 'camera';

/**
 * Configures network QoS priority (RFC 8835 / RFC 8837), DiffServ/DSCP packet marking,
 * congestion pacer scheduling, degradation preferences, and dynamic bitrates.
 *
 * Priority Matrix:
 * 1. Audio: Top Priority ('high') -> DSCP Expedited Forwarding (EF / CS5)
 * 2. Screen Share: 2nd Priority ('medium') -> DSCP Assured Forwarding (AF), maintain-resolution
 * 3. Camera Video: Least Priority ('low') -> DSCP Best Effort (DF), balanced degradation, throttled bitrate
 */
export async function applyStreamQoS(
  sender: RTCRtpSender,
  type: StreamQoSType,
  isScreenSharingActive = false
): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    if (type === 'audio') {
      // Top Priority: Voice / Audio (DSCP EF / Expedited Forwarding, CS5)
      params.encodings.forEach((enc) => {
        enc.priority = 'high';
        (enc as unknown as { networkPriority: string }).networkPriority = 'high';
      });
    } else if (type === 'screen') {
      // 2nd Priority: Screen capture (DSCP AF / Assured Forwarding)
      params.encodings.forEach((enc) => {
        enc.priority = 'medium';
        (enc as unknown as { networkPriority: string }).networkPriority = 'medium';
      });
      // Maintain crisp typography and window lines, dropping framerate before resolution
      params.degradationPreference = 'maintain-resolution';
    } else if (type === 'camera') {
      // Least Priority: Camera video (Best Effort / Default DF)
      params.encodings.forEach((enc) => {
        enc.priority = 'low';
        (enc as unknown as { networkPriority: string }).networkPriority = 'low';
        if (isScreenSharingActive) {
          // Cap camera bitrate while presenting to conserve upstream bandwidth for the presentation
          enc.maxBitrate = 350000; // 350 kbps
        } else {
          delete enc.maxBitrate;
        }
      });
      params.degradationPreference = 'balanced';
    }

    await sender.setParameters(params);
  } catch (err) {
    // Non-critical if browser does not support setParameters or specific networkPriority fields
    console.warn(`[WebRTC QoS] Could not apply QoS for ${type}:`, err);
  }
}

export interface PeerConnectionCallbacks {
  onRemoteStream: (peerId: string, stream: MediaStream, isScreen?: boolean) => void;
  onConnectionStateChange: (peerId: string, state: RTCPeerConnectionState) => void;
  onChatMessage: (message: ChatMessage) => void;
  sendSignal: (signal: SignalMessage) => void;
}

export class PeerConnectionManager {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private remoteStreams = new Map<string, MediaStream>();
  private remoteScreenStreams = new Map<string, MediaStream>();
  private screenSenders = new Map<string, RTCRtpSender[]>();
  private candidateQueues = new Map<string, RTCIceCandidateInit[]>();
  private makingOffers = new Map<string, boolean>();
  private ignoreOffers = new Map<string, boolean>();
  private isSettingRemoteAnswerPending = new Map<string, boolean>();

  private localPeerId: string;
  private localName: string;
  private localStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private callbacks: PeerConnectionCallbacks;

  constructor(localPeerId: string, localName: string, callbacks: PeerConnectionCallbacks) {
    this.localPeerId = localPeerId;
    this.localName = localName;
    this.callbacks = callbacks;
  }

  private isScreenSender(peerId: string, sender: RTCRtpSender): boolean {
    const list = this.screenSenders.get(peerId);
    return !!list && list.includes(sender);
  }

  public setLocalStream(stream: MediaStream | null) {
    const prevStream = this.localStream;
    this.localStream = stream;
    const isScreenActive = !!this.localScreenStream;

    // Update all existing peer connections with the new stream tracks
    for (const [peerId, pc] of this.peerConnections.entries()) {
      if (pc.connectionState === 'closed') continue;

      if (stream) {
        stream.getTracks().forEach((track) => {
          // Find sender for this track's kind that is NOT dedicated to screen sharing
          const senders = pc.getSenders();
          const sender = senders.find(
            (s) => s.track && s.track.kind === track.kind && !this.isScreenSender(peerId, s)
          );

          if (sender) {
            if (sender.track !== track) {
              sender
                .replaceTrack(track)
                .then(() => {
                  applyStreamQoS(sender, track.kind === 'audio' ? 'audio' : 'camera', isScreenActive);
                })
                .catch((err) => {
                  console.error(`Failed to replace track for peer ${peerId}:`, err);
                });
            } else {
              applyStreamQoS(sender, track.kind === 'audio' ? 'audio' : 'camera', isScreenActive);
            }
          } else {
            // Check if there is an available transceiver of this kind
            const transceivers = pc.getTransceivers();
            const emptyTransceiver = transceivers.find(
              (t) =>
                (!t.sender.track || t.sender.track.kind === track.kind) &&
                t.direction !== 'recvonly' &&
                !this.isScreenSender(peerId, t.sender)
            );
            if (emptyTransceiver && emptyTransceiver.sender) {
              emptyTransceiver.sender
                .replaceTrack(track)
                .then(() => {
                  applyStreamQoS(
                    emptyTransceiver.sender,
                    track.kind === 'audio' ? 'audio' : 'camera',
                    isScreenActive
                  );
                })
                .catch((err) => {
                  console.error(`Failed to replace track on transceiver for peer ${peerId}:`, err);
                });
            } else {
              try {
                const newSender = pc.addTrack(track, stream);
                applyStreamQoS(newSender, track.kind === 'audio' ? 'audio' : 'camera', isScreenActive);
              } catch (e) {
                console.warn(`Could not add track for peer ${peerId}:`, e);
              }
            }
          }
        });
      } else if (prevStream) {
        pc.getSenders().forEach((sender) => {
          if (sender.track && !this.isScreenSender(peerId, sender)) {
            sender.replaceTrack(null).catch(() => {});
          }
        });
      }
    }
  }

  public setLocalScreenStream(screenStream: MediaStream | null) {
    this.localScreenStream = screenStream;
    const isScreenActive = !!screenStream;

    // Adjust camera senders QoS dynamically (capping camera bitrate during screen share)
    for (const [peerId, pc] of this.peerConnections.entries()) {
      if (pc.connectionState === 'closed') continue;
      const cameraSender = pc
        .getSenders()
        .find((s) => s.track?.kind === 'video' && !this.isScreenSender(peerId, s));
      if (cameraSender) {
        applyStreamQoS(cameraSender, 'camera', isScreenActive);
      }
    }

    // Manage screen share transceivers across active peer connections
    for (const [peerId, pc] of this.peerConnections.entries()) {
      if (pc.connectionState === 'closed') continue;

      const currentScreenSenders = this.screenSenders.get(peerId) || [];

      if (screenStream) {
        const tracks = screenStream.getTracks();
        const updatedSenders: RTCRtpSender[] = [];

        tracks.forEach((track) => {
          const existingSender = currentScreenSenders.find((s) => s.track?.kind === track.kind);
          if (existingSender) {
            existingSender
              .replaceTrack(track)
              .then(() => {
                applyStreamQoS(existingSender, track.kind === 'audio' ? 'audio' : 'screen', true);
              })
              .catch((e) => console.error(`Replace screen track failed:`, e));
            updatedSenders.push(existingSender);
          } else {
            try {
              const newSender = pc.addTrack(track, screenStream);
              applyStreamQoS(newSender, track.kind === 'audio' ? 'audio' : 'screen', true);
              updatedSenders.push(newSender);
            } catch (e) {
              console.warn(`Could not add screen track for peer ${peerId}:`, e);
            }
          }
        });

        this.screenSenders.set(peerId, updatedSenders);
      } else {
        // Screen share ended: remove screen senders to trigger renegotiation
        currentScreenSenders.forEach((sender) => {
          try {
            pc.removeTrack(sender);
          } catch {
            sender.replaceTrack(null).catch(() => {});
          }
        });
        this.screenSenders.delete(peerId);
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

    // Attach local stream tracks (microphone + webcam)
    if (this.localStream) {
      const isScreenActive = !!this.localScreenStream;
      this.localStream.getTracks().forEach((track) => {
        try {
          const sender = pc!.addTrack(track, this.localStream!);
          applyStreamQoS(sender, track.kind === 'audio' ? 'audio' : 'camera', isScreenActive);
        } catch (e) {
          console.warn('Error adding initial track to peer connection:', e);
        }
      });
    }

    // Attach local screen share tracks if actively presenting
    if (this.localScreenStream) {
      const screenSenders: RTCRtpSender[] = [];
      this.localScreenStream.getTracks().forEach((track) => {
        try {
          const sender = pc!.addTrack(track, this.localScreenStream!);
          applyStreamQoS(sender, track.kind === 'audio' ? 'audio' : 'screen', true);
          screenSenders.push(sender);
        } catch (e) {
          console.warn('Error adding initial screen track to peer connection:', e);
        }
      });
      this.screenSenders.set(remotePeerId, screenSenders);
    }

    // Initialize or reuse remote stream container
    let remoteStream = this.remoteStreams.get(remotePeerId);
    if (!remoteStream) {
      remoteStream = new MediaStream();
      this.remoteStreams.set(remotePeerId, remoteStream);
    }

    // Track handler: distinguishes between camera/mic and screen capture tracks
    pc.ontrack = (event) => {
      const track = event.track;
      const stream = event.streams && event.streams[0];
      const streamId = stream ? stream.id : '';
      const isScreen = streamId.startsWith('screen_') || track.contentHint === 'detail';

      if (isScreen) {
        let screenStream = this.remoteScreenStreams.get(remotePeerId);
        if (!screenStream) {
          screenStream = new MediaStream();
          this.remoteScreenStreams.set(remotePeerId, screenStream);
        }
        if (!screenStream.getTracks().some((t) => t.id === track.id)) {
          screenStream.addTrack(track);
        }
        track.onended = () => {
          screenStream?.removeTrack(track);
          if (screenStream?.getTracks().length === 0) {
            this.remoteScreenStreams.delete(remotePeerId);
          }
          this.callbacks.onRemoteStream(remotePeerId, screenStream!, true);
        };
        this.callbacks.onRemoteStream(remotePeerId, screenStream, true);
      } else {
        let mainStream = this.remoteStreams.get(remotePeerId);
        if (!mainStream) {
          mainStream = new MediaStream();
          this.remoteStreams.set(remotePeerId, mainStream);
        }
        if (!mainStream.getTracks().some((t) => t.id === track.id)) {
          mainStream.addTrack(track);
        }
        track.onended = () => {
          mainStream?.removeTrack(track);
          this.callbacks.onRemoteStream(remotePeerId, mainStream!, false);
        };
        this.callbacks.onRemoteStream(remotePeerId, mainStream, false);
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
    this.remoteScreenStreams.delete(remotePeerId);
    this.screenSenders.delete(remotePeerId);
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
