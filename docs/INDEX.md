# Application Technical Dossier: P2P Peer Meeting

Welcome to the comprehensive, self-contained technical documentation dossier for the **P2P Peer Meeting** application.

This dossier provides an exhaustive description of the application's architecture, protocols, data flows, state machines, component hierarchies, and user settings. It is designed to be **completely self-contained**, enabling any engineer, architect, or AI agent to understand, reason about, and maintain the system without reading the raw source code.

---

## Dossier Navigation

| Module | Document | Description |
| :--- | :--- | :--- |
| **01** | [**Architecture Overview**](./01-architecture-overview.md) | High-level system architecture, P2P mesh topology, zero-server media paradigm, and end-to-end security model. |
| **02** | [**WebRTC & Signaling Protocol**](./02-webrtc-and-signaling.md) | Deep dive into `PeerConnectionManager`, W3C Perfect Negotiation state machine, glare resolution, candidate queueing, self-healing recovery, and SCTP DataChannels. |
| **03** | [**Media Stream Pipeline**](./03-media-stream-pipeline.md) | Camera/microphone acquisition, WebRTC audio constraints, Web Audio API analyzer with GC protection, screen sharing track swaps, and playback synchronization. |
| **04** | [**Room Lifecycle & State Management**](./04-room-lifecycle-and-state.md) | Room coordination via `useMeetingRoom`, Supabase Presence vs. broadcast ephemeral `state-sync`, safe leave detection, and P2P chat handling. |
| **05** | [**UI Components & Responsive Layout**](./05-ui-components-and-layout.md) | Component breakdown (`App`, `Lobby`, `MeetingRoom`, `VideoTile`, `ControlBar`, `ChatPanel`, `SettingsModal`), layout modes, and presenter spotlighting. |
| **06** | [**User Settings & Preferences**](./06-settings-and-preferences.md) | Preference store (`services/settings.ts`), localStorage schema, interactive live mic test meter, dynamic track constraint updates, and native Web Audio chime generator. |
| **07** | [**Deployment & Environment**](./07-deployment-and-environment.md) | Environment variables, build pipeline (`tsc && vite build`), Vercel deployment branch rules, and common WebRTC troubleshooting. |

---

## Maintenance Invariant
As defined in [GEMINI.md](../GEMINI.md), **any significant edit to the codebase (features, bug fixes, protocol alterations, or settings adjustments) must be reflected by updating the corresponding document in this dossier**.
