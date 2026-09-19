# 04 - Room Lifecycle & State Management

## 1. Overview
The coordination of meeting rooms, peer presence, state propagation, and in-call messaging is implemented in `useMeetingRoom` ([`src/hooks/useMeetingRoom.ts`](../src/hooks/useMeetingRoom.ts)).

This hook acts as the bridge connecting:
- **Supabase Realtime**: For room discovery, presence tracking, and signaling broadcast.
- **WebRTC `PeerConnectionManager`**: For media stream management and direct peer connections.
- **React UI State**: For rendering participants, connection indicators, and chat logs.

---

## 2. Participant State Model

Each participant in a room is represented by the `Participant` interface:

```typescript
export interface Participant {
  id: string;                      // Unique session peer ID
  name: string;                    // User display name
  isAudioMuted: boolean;           // Microphone muted state
  isVideoOff: boolean;             // Camera disabled state
  isScreenSharing: boolean;        // Active screen presentation state
  isLocal: boolean;                // True if representing the local user
  stream?: MediaStream;            // MediaStream object (local or remote)
  connectionState?: RTCPeerConnectionState; // 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'
  isSpeaking?: boolean;            // Active speaking activity
}
```

The local user is dynamically integrated into the participant list inside `MeetingRoom.tsx` as `selfParticipant` (`isLocal: true`), providing a unified interface for rendering both local and remote video tiles.

---

## 3. Presence vs. Ephemeral State Sync

A crucial architectural breakthrough in this application is the strict separation between **Room Membership (Presence)** and **Ephemeral Device State (Broadcast)**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Supabase Realtime                             │
├───────────────────────────────────┬────────────────────────────────────┤
│         Presence Tracking         │         Broadcast Channel          │
│        (Channel Lifecycle)        │        (Ephemeral Signals)         │
├───────────────────────────────────┼────────────────────────────────────┤
│ • "Alice entered room test-room"  │ • SDP Offer & Answer payloads      │
│ • "Bob left room test-room"       │ • ICE Candidate payloads           │
│                                   │ • Live Mic Mute / Unmute toggles   │
│                                   │ • Live Camera On / Off toggles     │
│                                   │ • Screen presentation toggles      │
│                                   │ • Fallback chat messages           │
└───────────────────────────────────┴────────────────────────────────────┘
```

### Why `channel.track()` Must NOT Be Called on Mute/Unmute:
In Supabase Realtime (v2.x), updating a client's presence state via `channel.track()` causes the presence engine to emit a **presence diff**:
- A `leave` event for the previous payload.
- A `join` event for the updated payload.

If an application listens for `presence: leave` and unconditionally tears down peer connections, toggling a microphone or camera off will immediately **kill the WebRTC connection** and remove the user from other participants' views!

### The Solution:
1. **Track Presence Once**: `channel.track()` is executed **only once** upon successful subscription (`status === 'SUBSCRIBED'`).
2. **Broadcast State Sync**: When a user mutes their mic, turns off their camera, or toggles screen sharing, the app sends a lightweight broadcast signal:
   ```typescript
   sendSignal({
     type: 'state-sync',
     fromPeerId: localPeerId,
     fromName: userName,
     state: { isAudioMuted, isVideoOff, isScreenSharing },
   });
   ```
   Peers update their UI state in memory instantly without any presence diffs or connection teardowns.
3. **Safe Leave Verification**:
   When `channel.on('presence', { event: 'leave' })` is received:
   ```typescript
   const presenceState = channel.presenceState();
   const stillPresent = presenceState[key] && presenceState[key].length > 0;
   if (stillPresent) {
     return; // Not a true room exit! Just an update diff.
   }
   // True exit: Clean up WebRTC peer and update participant list
   rtcManager.removePeer(key);
   setParticipants((prev) => prev.filter((p) => p.id !== key));
   ```

---

## 4. Room Entry & Peer Discovery Workflow

When a user joins a meeting room:

```
[ User Joins Room ]
        │
        ▼
Subscribe to `meeting-room:<roomId>`
        │
        ├── status === 'SUBSCRIBED'
        ▼
1. Track presence once: { name: userName }
        │
        ▼
2. Receive `presence: sync` (List of existing room participants)
        │
        ├── For each remote peer ID:
        │     • rtcManager.getOrCreatePeerConnection(peerId)
        │     • Retain existing media streams if already connected
        ▼
3. When another peer joins (`presence: join`):
        │
        ├── rtcManager.getOrCreatePeerConnection(newPeerId)
        ├── Broadcast current `state-sync` directly to target new peer
        ▼
4. WebRTC negotiation establishes direct media and data links
```

---

## 5. In-Meeting Chat Pipeline

The chat system employs a **dual-transport strategy** for maximum speed and reliability:

1. **Primary Transport: WebRTC `RTCDataChannel`**:
   - Transmitted directly between peer browsers via `rtcManager.sendChatMessage(msg)`.
   - Bypasses any cloud servers, offering near-zero latency and total privacy.
2. **Reliable Fallback: Supabase Broadcast**:
   - If data channels are still connecting or have not opened, the message is mirrored over the signaling broadcast channel (`event: 'chat'`).
3. **Audio Chime Notification**:
   - When an incoming chat message arrives from another participant, `handleChatMessage` checks `getStoredUserSettings().chatSoundNotification`.
   - If enabled, it invokes `playNotificationChime()`, synthesizing a gentle two-tone alert via the Web Audio API.
