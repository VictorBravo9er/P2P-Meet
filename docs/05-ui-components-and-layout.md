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
           └── SettingsModal.tsx                       ├─ VideoTile.tsx (Grid & Presenter)
                                                       ├─ ControlBar.tsx (Bottom dock)
                                                       ├─ ChatPanel.tsx (Drawer)
                                                       ├─ ParticipantsPanel.tsx (Drawer)
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
- **Room Header**: Displays room code, copyable share link with tooltip feedback, encryption badge, and an interactive participant count button that opens `ParticipantsPanel`.
- **Local Presenter Banner**: When the local user is presenting, renders a prominent alert banner at the top: *"You are presenting your screen — All peers in this room can see your screen"* with a direct *"Stop Presenting"* button.
- **Dual Layout Engine**:
  1. **Standard Mesh Layout**: Dynamically selects CSS grid classes based on participant count:
     - 1 participant: Single centered tile (`max-w-3xl`)
     - 2 participants: 2-column side-by-side (`md:grid-cols-2 max-w-5xl`)
     - 3 to 4 participants: 2x2 grid (`sm:grid-cols-2 max-w-5xl`)
     - 5+ participants: 3-column grid (`lg:grid-cols-3 max-w-7xl`)
  2. **Screen Share / Presenter Spotlight Layout with Focus Mode & Dual Video**:
     - **Main Stage**: Centered presentation container for the shared screen rendered with `isScreenShareTile={true}`.
     - **Dual Video Display for Presenter**: The presenter's screen cast is spotlighted on the main stage, while their camera feed simultaneously continues rendering in the participant filmstrip (`isScreenShareTile={false}`). Attendees can view the presenter's face and screen share concurrently.
     - **Hidable Participant Strip**: Attendees' and presenter's webcam tiles are rendered in a responsive strip (`w-48 lg:w-full aspect-video flex-shrink-0`) keeping perfect 16:9 proportions.
     - **Focus Mode Toggle**: Users can toggle between showing participant video tiles and **Focus Mode** (`isParticipantStripVisible: false`). In Focus Mode, the participant strip is collapsed completely and the screen cast expands to full available width and height (`w-full h-[80vh]`), rendering exclusively the presentation with zero distractions.
     - **Restore Pill**: When hidden, a subtle button shows *"Show Participants (N)"* to unhide the video strip at any time.

---

### 2.4 `VideoTile.tsx` (Media Renderer)
- **Decoupled Screen vs. Camera Rendering (`isScreenShareTile`)**:
  - `isScreenShareTile={true}` (Stage Tile): Renders `participant.screenStream` (or fallback `participant.stream`). Completely ignores `isVideoOff` so presenter camera toggles never hide the screen cast. Renders the interactive presentation toolbar (Fit/Fill, PiP, Fullscreen).
  - `isScreenShareTile={false}` (Participant / Strip Tile): Renders `participant.stream` (webcam). Respects `isVideoOff` and falls back to avatar placeholder when camera is muted.
- **Aspect Ratio Preservation**:
  - Eliminates rigid minimum height (`min-h-0`) so containers conform strictly to aspect-ratio wrappers without distortion.
  - **Screen Cast Containment**: Automatically switches `<video>` styling to `object-contain` against a deep black backdrop (`bg-slate-950`) when `isScreenShareTile` is true. This guarantees slides, code, spreadsheets, and windows of any aspect ratio (16:9, 16:10, 4:3, 21:9) are displayed without any cropped edges or clipped content.
  - **Camera Feeds**: Default to `object-cover` within 16:9 tiles for clean edge-to-edge webcam presentation.
- **Interactive Presentation Toolbar**: When viewing a screen share, provides an integrated overlay:
  - **Fit / Fill Toggle (`Scan`)**: Switch between `object-contain` (Fit to screen, no clipping) and `object-cover` (Fill screen).
  - **Picture-in-Picture (`PictureInPicture`)**: Pop out the video stream into native OS floating window.
  - **Fullscreen (`Maximize` / `Minimize`)**: Enters native monitor fullscreen using the Fullscreen API.
- **Audio Feedback Safeguard**: Always mutes local audio (`muted={isSelf}`) to prevent acoustic feedback loops, while keeping remote audio unmuted.
- **Avatar Fallback**: When `isVideoOff: true` or no video tracks are active on a camera tile, renders a modern circular avatar using the participant's initials or user icon.
- **Active Speaker Glow**: When `participant.isSpeaking` is true and `speakingIndicator` is enabled in settings, wraps the tile with an animated emerald ring (`ring-4 ring-emerald-500/40`).
- **Status Badges**:
  - `Presenting` / `You are presenting`: Indicates active screen share.
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
  - **Participants Drawer Button**: Displays live attendee count badge; toggles `ParticipantsPanel`.
  - **Copy Invite Link**: Copies room URL with visual tooltip confirmation.
  - **Settings Button**: Opens `SettingsModal`.
  - **Leave Button**: Safely exits the meeting and returns to the lobby.

---

### 2.6 `ChatPanel.tsx` (In-Call P2P Messaging Drawer)
- Slides in from the right edge without obscuring video tiles on wide screens.
- Displays sender name, formatted timestamp, and message bubble.
- Messages sent by the local user are visually differentiated (primary color, right-aligned) from remote messages.

---

### 2.7 `ParticipantsPanel.tsx` (In-Call Attendee Drawer)
- Slides in from the right edge with a polished glassmorphic interface.
- Displays live total count of participants in the room.
- Search filter for quickly locating attendees by name.
- Participant Cards:
  - Avatar with initials and live pulsing emerald ring when speaking.
  - Name with `(You)` tag for the local user.
  - `Presenting` badge when sharing screen.
  - Real-time microphone status (green unmuted / red muted).
  - Real-time camera status (green active / slate disabled).
  - WebRTC connection state alerts when reconnecting.
- Bottom action bar with direct "Share Link" button and room code.
