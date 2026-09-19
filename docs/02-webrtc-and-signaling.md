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

## 6. Track Routing & Clean Replacement

When local media streams are toggled (e.g., switching between webcam and screen presentation):
- The application invokes `setLocalStream(newStream)`.
- Rather than calling `pc.addTrack()` indiscriminately (which creates redundant transceivers and triggers renegotiation loops), the manager inspects existing senders matching the track kind (`audio` or `video`):
```typescript
const senders = pc.getSenders();
const sender = senders.find((s) => s.track && s.track.kind === track.kind);

if (sender) {
  if (sender.track !== track) {
    sender.replaceTrack(track).catch((err) => {
      console.error(`Failed to replace track:`, err);
    });
  }
} else {
  // Transceiver / initial addTrack fallback
  pc.addTrack(track, stream);
}
```
Because `sender.replaceTrack()` seamlessly swaps the active media source without changing the SDP m-line count, **no renegotiation is required** when switching camera to screen or swapping devices.

---

## 7. Data Channels: `meeting-chat`

- **Channel Label**: `meeting-chat`
- **Creation Rule**: To prevent duplicate data channels, only the **Polite Peer** (`localPeerId < remotePeerId`) calls `pc.createDataChannel('meeting-chat', { ordered: true })`.
- The impolite peer listens via `pc.ondatachannel = (event) => setupDataChannel(remotePeerId, event.channel)`.
- Chat messages are sent as serialized JSON strings.
- **Delivery**: Direct, reliable, and in-order via SCTP over DTLS.
