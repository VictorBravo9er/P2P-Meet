# 01 - Architecture Overview

## 1. Executive Summary
**P2P Peer Meeting** is a serverless, browser-native video conferencing application built with **React, TypeScript, Vite, and WebRTC**. The core architectural tenet of the application is the **Zero-Server Media Paradigm**: all video frames, audio samples, screen shares, and in-meeting chat messages are transmitted **directly between participant browsers** over encrypted peer-to-peer connections.

No central media server (such as an SFU or MCU) ever touches, inspects, decodes, or records user communications. An external backend service (**Supabase Realtime**) is utilized exclusively as an out-of-band **signaling channel** to facilitate connection handshakes (exchanging SDP session descriptions and ICE candidate addresses).

---

## 2. Network Topology: Full Mesh P2P

The application operates as a decentralized **full mesh network** among all participants in a meeting room:

```
        ┌────────────────┐
        │  Participant A │
        └───┬────────┬───┘
            │        │
      Direct│        │Direct
       Media│        │Media
            │        │
   ┌────────┴───┐  ┌─┴──────────┐
   │Participant │  │Participant │
   │     B      ├──┤     C      │
   └────────────┘  └────────────┘
         Direct Media
```

### Topology Characteristics
- **Direct Link per Peer Pair**: For a room with $N$ participants, each client maintains $N-1$ separate `RTCPeerConnection` instances.
- **Total Connections in Room**: $\frac{N(N-1)}{2}$ peer links.
- **Bandwidth Consumption**:
  - Each participant transmits their local media streams $N-1$ times (one upload per connected peer).
  - Each participant receives streams from $N-1$ peers.
  - **Optimization**: This mesh architecture is optimized for intimate, high-privacy meetings (2 to 6 participants), avoiding expensive server infrastructure while ensuring complete user privacy.

---

## 3. Separation of Concerns: Signaling vs. Media Paths

A fundamental concept of the architecture is the strict separation between the **Signaling Plane** and the **Media Plane**:

```
                       ┌─────────────────────────┐
                       │    Supabase Realtime    │
                       │    Signaling Service    │
                       └───────────┬─────────────┘
                                   │
              WebSocket Broadcasts │ (SDP Offers, Answers,
              & Presence Tracking  │  ICE Candidates, State Sync)
                                   │
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
      ┌──────────────────┐                  ┌──────────────────┐
      │  Peer Client A   │                  │  Peer Client B   │
      │  (e.g., Alice)   │                  │   (e.g., Bob)    │
      └─────────┬────────┘                  └─────────┬────────┘
                │                                     │
                │        Direct Encrypted WebRTC      │
                └─────────────────────────────────────┘
                 • Audio Tracks (Opus, SRTP)
                 • Video Tracks (VP8/H.264, SRTP)
                 • Chat DataChannel (SCTP/DTLS)
```

### 3.1 The Signaling Plane (Supabase Realtime)
- **Transport**: Secure WebSockets (`wss://`).
- **Channel**: A topic-scoped channel per meeting room: `meeting-room:<roomId>`.
- **Responsibilities**:
  1. **Presence Tracking**: Announcing when a user enters or leaves a room (`channel.presenceState()`).
  2. **Session Description Exchange**: Relaying `offer` and `answer` SDPs between peer pairs.
  3. **Interactive Connectivity Establishment (ICE)**: Relaying candidate network addresses (host, srflx, relay) between peers.
  4. **Ephemeral State Synchronization**: Broadcasting live microphone mute, camera off, and screen share states (`state-sync`) without triggering presence diffs.
- **Data Stored on Server**: **Zero**. Realtime messages are ephemeral broadcast packets. Supabase databases and tables are not even required.

### 3.2 The Media Plane (WebRTC)
- **Transport**: Direct UDP (with TCP fallback via ICE).
- **Security**: DTLS 1.2 (Datagram Transport Layer Security) with SRTP (Secure Real-time Transport Protocol).
- **Payloads**:
  - **Audio**: Compressed using the Opus codec, negotiated via SDP.
  - **Video**: Compressed using VP8 or H.264, dynamically adapted based on network bandwidth and resolution constraints.
  - **Chat**: P2P text payloads transferred over WebRTC `RTCDataChannel` using SCTP.

---

## 4. Security, Privacy, and Encryption Model

1. **End-to-End Encryption (E2EE) by Design**:
   - WebRTC mandates DTLS key negotiation for all media and data connections.
   - Keys are negotiated directly between the two browser endpoints during the DTLS handshake; no intermediate proxy, signaling server, or third party possesses the cryptographic keys.
2. **Zero Media Storage / Zero Logs**:
   - Because no server acts as a media relay, eavesdropping or surveillance by infrastructure providers is mathematically prohibited.
   - Text chat messages are transferred via SCTP data channels directly into the browser's React state and discarded upon page exit.
3. **NAT Traversal & Public STUN**:
   - The app uses Google's public STUN servers (`stun:stun.l.google.com:19302`) strictly to discover client public IP and port mappings (Server Reflexive candidates). STUN servers only inspect packet headers for address reflection and never relay media content.
