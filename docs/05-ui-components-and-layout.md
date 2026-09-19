# 05 - UI Components & Responsive Layout

## 1. Component Hierarchy Overview

The UI architecture is modular, separating pre-call preparation from in-call interactions:

```
                              App.tsx
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
      [ In Lobby ]                               [ In Meeting ]
       Lobby.tsx                                MeetingRoom.tsx
           │                                           │
           └── SettingsModal.tsx                       ├─ VideoTile.tsx (Grid)
                                                       ├─ ControlBar.tsx (Bottom dock)
                                                       ├─ ChatPanel.tsx (Drawer)
                                                       └─ SettingsModal.tsx (Dialog)
```

---

## 2. Component Specifications

### 2.1 `App.tsx` (Root Orchestrator)
- **URL Parameter Parsing**: Inspects `?room=<id>` query parameter or `#room=<id>` hash to automatically pre-populate room codes when following invite links.
- **Session State**: Manages `inMeeting: boolean`, `userName`, and `roomId`.
- **Media Initializer**: Triggers `useMediaStream.startMedia()` upon page mount to ensure camera and mic are available for preview.

---

### 2.2 `Lobby.tsx` (Pre-Meeting Preview & Onboarding)
- **Camera/Mic Pre-Check**: Displays live local video preview before joining the room.
- **Self-Preview Mirroring**: Respects the `mirrorSelfVideo` user preference (`scale-x-[-1]`).
- **Speaking Indicator**: Real-time visual feedback confirming microphone capture works before entering the call.
- **Room Code Generator**: Allows generating random human-friendly room IDs or joining an existing room via invite link.
- **Persistent User Display Name**: Remembers the user's name across visits via `localStorage`.

---

### 2.3 `MeetingRoom.tsx` (Meeting Orchestrator & Grid Manager)
- **Room Header**: Displays room code, copyable share link with tooltip feedback, encryption badge, and live participant count.
- **Dual Layout Engine**:
  1. **Standard Mesh Layout**: Dynamically selects CSS grid classes based on participant count:
     - 1 participant: Single centered tile (`max-w-3xl`)
     - 2 participants: 2-column side-by-side (`md:grid-cols-2 max-w-5xl`)
     - 3 to 4 participants: 2x2 grid (`sm:grid-cols-2 max-w-5xl`)
     - 5+ participants: 3-column grid (`lg:grid-cols-3 max-w-7xl`)
  2. **Screen Share / Presenter Spotlight Layout**:
     - When any participant sets `isScreenSharing: true`, the layout switches automatically to a 4-column responsive grid:
     - **Main Stage (3 cols)**: Expanded view of the presenting screen (`h-[60vh] lg:h-[75vh]`).
     - **Sidebar Strip (1 col)**: Vertical scrollable strip containing video tiles of all other participants.

---

### 2.4 `VideoTile.tsx` (Media Renderer)
- **Video Element**: Renders `participant.stream` with `autoPlay` and `playsInline`.
- **Audio Feedback Safeguard**: Always mutes local audio (`muted={isSelf}`) to prevent acoustic feedback loops, while keeping remote audio unmuted.
- **Avatar Fallback**: When `isVideoOff: true` or no video tracks are active, renders a modern circular avatar using the participant's initials or user icon.
- **Active Speaker Glow**: When `participant.isSpeaking` is true and `speakingIndicator` is enabled in settings, wraps the tile with an animated emerald ring (`ring-4 ring-emerald-500/40`).
- **Status Badges**:
  - `Presenting`: Indicates active screen share.
  - `Connecting...`: Displays WebRTC connection state when not yet stable.
  - Nameplate with `(You)` tag and microphone muted icon.

---

### 2.5 `ControlBar.tsx` (Floating Action Bar)
- Positioned as a floating glassmorphic dock at the bottom of the screen.
- Controls:
  - **Mic Toggle**: Toggles audio mute/unmute with visual red alert state when muted.
  - **Camera Toggle**: Toggles video on/off.
  - **Screen Share Toggle**: Starts or stops display presentation.
  - **Chat Drawer Button**: Displays unread badge counter when new messages arrive.
  - **Settings Button**: Opens `SettingsModal`.
  - **Leave Button**: Safely exits the meeting and returns to the lobby.

---

### 2.6 `ChatPanel.tsx` (In-Call P2P Messaging Drawer)
- Slides in from the right edge without obscuring video tiles on wide screens.
- Displays sender name, formatted timestamp, and message bubble.
- Messages sent by the local user are visually differentiated (primary color, right-aligned) from remote messages.
