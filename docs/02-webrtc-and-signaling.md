# 02 - WebRTC & Signaling Protocol

## 1. Overview
The WebRTC communication layer is managed entirely by the `PeerConnectionManager` class in [`src/services/webrtc.ts`](../src/services/webrtc.ts). This class encapsulates peer connection creation, ICE candidate negotiation, SDP offer/answer exchanges, media track routing, and P2P data channels.

To eliminate signaling race conditions and offer collisions, the application strictly adheres to the **W3C WebRTC Perfect Negotiation** pattern, augmented by an automated **self-healing SDP recovery mechanism**.

---

## 2. Deterministic Politeness & Glare Resolution

When multiple peers discover each other simultaneously in a room, both may attempt to initiate negotiation at the exact same millisecond. This scenario is known as **Glare** (or an offer collision).

```
    Peer A (Polite: "peer_100")              Peer B (Impolite: "peer_200")
         │                                                │
         ├─── Simultaneous Offer (onnegotiationneeded) ───┤
         │                                                │
         │◄── Receive Offer from B                        │
         │    • Collision detected!                       │
         │    • Polite peer rolls back its local offer    │
         │    • Applies B's offer as remote description   │
         │                                                │
         │                               Receive Offer ──►│
         │                               from A           │
         │                               • Collision!     │
         │                               • Impolite peer  │
         │                                 ignores A's    │
         │                                 offer.         │
         │                                                │
         ├─── Sends Answer to B ─────────────────────────►│
         │                                                │
         │    Connection Established & Stable             │
```

### Deterministic Politeness Rule
Every client generates a random, unique alphanumeric ID upon session initialization:
```typescript
const localPeerId = `peer_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
```
For any given pair of peers $(A, B)$, the peer whose ID is lexicographically lower is designated as the **Polite Peer**:
```typescript
const isPolite = this.localPeerId < remotePeerId;
```

### The Three State Flags
`PeerConnectionManager` maintains three tracking maps per remote peer:
1. `makingOffers: Map<string, boolean>`: Set to `true` while `pc.setLocalDescription()` is being prepared and executed inside `onnegotiationneeded`.
2. `ignoreOffers: Map<string, boolean>`: Set to `true` on the impolite peer when an incoming offer collides with its own pending offer.
3. `isSettingRemoteAnswerPending: Map<string, boolean>`: Set to `true` during `pc.setRemoteDescription(answer)` to protect against race conditions when applying remote answers.

---

## 3. Signal Types & Message Formats

Signaling messages are transmitted as JSON payloads through the Supabase Realtime broadcast channel:

```typescript
export type SignalType = 'offer' | 'answer' | 'candidate' | 'state-sync' | 'chat';

export interface SignalMessage {
  type: SignalType;
  fromPeerId: string;
  fromName: string;
  targetPeerId?: string; // If omitted, broadcast to all peers
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  state?: {
    isAudioMuted: boolean;
    isVideoOff: boolean;
    isScreenSharing: boolean;
  };
}
```

### Signal Handling Workflow (`handleSignal`)

```
                      Incoming SignalMessage
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     type === 'offer'   type === 'answer'  type === 'candidate'
            │                  │                  │
    Check Collision?     Check State?       Remote Description
    • Impolite: Ignore   Must be            Set?
    • Polite: Rollback   'have-local-offer'   ├── Yes: addIceCandidate()
            │                  │              └── No:  Queue candidate
     Apply Remote SDP    Apply Remote SDP                 │
     & Create Answer     & Flush Queues                   ▼
            │                                    Flush after SRD
            ▼
       Send Answer
```

---

## 4. Candidate Queueing & Flushing

A classic WebRTC hazard is the arrival of ICE candidates before the remote session description (`setRemoteDescription`) has been applied to the `RTCPeerConnection`. Attempting to call `pc.addIceCandidate()` prior to remote description results in an immediate `DOMException: InvalidStateError`.

### Implementation:
1. When `candidate` arrives:
   ```typescript
   if (pc.remoteDescription && pc.remoteDescription.type) {
     try {
       await pc.addIceCandidate(new RTCIceCandidate(candidate));
     } catch (e) {
       if (!this.ignoreOffers.get(fromPeerId)) {
         console.warn('Failed to add incoming ice candidate:', e);
       }
     }
   } else {
     // Queue candidate until remote description is applied
     const queue = this.candidateQueues.get(fromPeerId) || [];
     queue.push(candidate);
     this.candidateQueues.set(fromPeerId, queue);
   }
   ```
2. As soon as `pc.setRemoteDescription()` resolves (for either an `offer` or `answer`), `flushCandidateQueue(fromPeerId, pc)` drains and adds all queued candidates sequentially.

---

## 5. Self-Healing SDP Recovery

If a remote peer reloads their browser, crashes and rejoins, or experiences an abrupt network change, the remote client generates a brand-new `RTCPeerConnection` with fresh ICE credentials (`ice-ufrag` and `ice-pwd`) and initial m-sections.

If the local peer is still holding onto the previous connection, the incoming offer would trigger:
- `DOMException: Remote description indicates ICE restart but offer did not request ICE restart (new remote description changes either the ice-ufrag or ice-pwd)`
- `DOMException: New remote description has fewer m-sections than the previous remote description.`

### Self-Healing Guard:
`PeerConnectionManager` intercepts these specific WebRTC engine errors:
```typescript
try {
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
} catch (srdErr: unknown) {
  const errMsg = srdErr instanceof Error ? srdErr.message : String(srdErr);
  if (errMsg.includes('m-sections') || errMsg.includes('ICE restart') || pc.connectionState === 'failed') {
    console.warn(`[WebRTC] Incompatible offer received from ${fromPeerId}. Resetting connection:`, errMsg);
    this.removePeer(fromPeerId);
    pc = this.getOrCreatePeerConnection(fromPeerId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  } else {
    throw srdErr;
  }
}
```
This guarantees that stale or desynchronized connections automatically self-heal without manual user intervention.

---

## 6. Multi-Stream Architecture & Track Routing

Rather than swapping camera and screen tracks within a single transceiver (which creates state bleed and forces a mutual exclusion between camera and screen), the application implements a **fully decoupled multi-stream architecture**:

```
                              PeerConnectionManager
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           ▼                                                         ▼
    Base Stream (Camera & Mic)                                Screen Stream
    • Stream ID: cam_<localPeerId>                            • Stream ID: screen_<localPeerId>
    • Audio Track: Microphone                                 • Video Track: Screen Presentation (contentHint: 'detail')
    • Video Track: Webcam                                     • Audio Track: System/Tab Audio (optional)
    • Senders: pc.getSenders() (audio/video)                  • Senders: screenSenders.get(peerId)
```

### Track Separation and Stream Identification
1. **Local Stream Tagging**:
   - Camera/Mic streams are labeled with the prefix `cam_${localPeerId}`.
   - Screen streams are labeled with the prefix `screen_${localPeerId}`.
   - Screen capture video tracks are tagged with `screenTrack.contentHint = 'detail'` to instruct the video encoder to prioritize spatial sharpness and readability over framerate.
2. **Dedicated Sender Lifecycle**:
   - Camera/mic tracks are managed through primary senders.
   - Screen tracks are added via `pc.addTrack(track, screenStream)` and cataloged in a dedicated map: `screenSenders: Map<string, RTCRtpSender[]>`.
   - When screen sharing stops, all screen senders are removed via `pc.removeTrack(sender)`, and `screenSenders` is cleared.
3. **Receiver-Side Disambiguation (`ontrack`)**:
   - When remote media arrives, the receiver inspects the inbound track and stream:
     ```typescript
     const isScreen =
       stream.id.startsWith('screen_') ||
       event.track.contentHint === 'detail' ||
       event.track.label.toLowerCase().includes('screen');
     ```
   - If `isScreen` is true, the track is assembled into a dedicated `remoteScreenStreams.get(peerId)` and dispatched to `onRemoteStream(peerId, stream, true)`.
   - If false, it is dispatched to the primary camera/mic handler `onRemoteStream(peerId, stream, false)`.

---

## 7. Network Quality of Service (QoS) & DSCP Priorities

To guarantee flawless audio intelligibility and crisp presentation fidelity over constrained home and enterprise networks, `PeerConnectionManager` configures real-time **Quality of Service (QoS)** and **DSCP (Differentiated Services Code Point)** packet prioritization via the WebRTC `RTCRtpSender.setParameters()` API.

### 7.1 QoS Priority Matrix

| Media Stream Type | Track Kind | `priority` | `networkPriority` | Target DSCP Marking | Degradation Preference | Bandwidth Pacing Policy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Microphone & Screen Audio** | `audio` | `'high'` | `'high'` | **Expedited Forwarding (EF / DSCP 46)** | N/A (Loss-tolerant low bitrate) | Always unconstrained; prioritized by socket queue and congestion pacer |
| **Screen Share Presentation** | `video` | `'medium'` | `'medium'` | **Assured Forwarding (AF41 / DSCP 34)** | `'maintain-resolution'` | Uncapped; preserves native resolution and slide text sharpness |
| **Webcam Video (Idle Screen)** | `video` | `'low'` | `'low'` | **Best Effort (DF / DSCP 0)** | `'balanced'` | Dynamic adaptation based on WebRTC bandwidth estimation |
| **Webcam Video (During Screen Share)** | `video` | `'low'` | `'low'` | **Best Effort (DF / DSCP 0)** | `'balanced'` | **Hard-capped at 350 kbps** (`maxBitrate: 350000`) to guarantee screen share headroom |

### 7.2 Implementation (`applyStreamQoS`)
Every sender is dynamically configured upon addition and re-tuned when screen sharing begins or terminates:

```typescript
private async applyStreamQoS(
  sender: RTCRtpSender,
  type: 'audio' | 'video' | 'screen',
  isScreenSharingActive = false
) {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    const encoding = params.encodings[0];

    if (type === 'audio') {
      // Tier 1: Highest priority (DSCP Expedited Forwarding)
      encoding.priority = 'high';
      encoding.networkPriority = 'high';
    } else if (type === 'screen') {
      // Tier 2: Medium priority (DSCP Assured Forwarding, maintain slide sharpness)
      encoding.priority = 'medium';
      encoding.networkPriority = 'medium';
      params.degradationPreference = 'maintain-resolution';
    } else if (type === 'video') {
      // Tier 3: Low priority (Best Effort)
      encoding.priority = 'low';
      encoding.networkPriority = 'low';
      params.degradationPreference = 'balanced';

      // Congestion protection: cap camera bitrate when sharing screen in mesh topology
      if (isScreenSharingActive) {
        encoding.maxBitrate = 350_000; // 350 kbps
      } else {
        delete encoding.maxBitrate;
      }
    }

    await sender.setParameters(params);
  } catch (err) {
    // Graceful fallback on browsers without DSCP/priority support
    console.debug('[WebRTC QoS] Could not apply sender QoS parameters:', err);
  }
}
```

### 7.3 Congestion Headroom Protection in Full Mesh
In a decentralized full mesh topology with $N$ peers, transmitting both 1080p screen sharing and 720p/1080p webcam feeds concurrently requires substantial upstream throughput:
- Without throttling, unconstrained video streams quickly saturate consumer residential uplink buffers, introducing packet drop and audio stutter.
- By capping webcam video to 350 kbps during screen sharing and instructing the browser congestion controller to prioritize audio (EF) and screen details (AF41), the application guarantees that voice and presentation remain perfectly fluid even under severe link contention.

---

## 8. Data Channels: `meeting-chat`

- **Channel Label**: `meeting-chat`
- **Creation Rule**: To prevent duplicate data channels, only the **Polite Peer** (`localPeerId < remotePeerId`) calls `pc.createDataChannel('meeting-chat', { ordered: true })`.
- The impolite peer listens via `pc.ondatachannel = (event) => setupDataChannel(remotePeerId, event.channel)`.
- Chat messages are sent as serialized JSON strings.
- **Delivery**: Direct, reliable, and in-order via SCTP over DTLS.
