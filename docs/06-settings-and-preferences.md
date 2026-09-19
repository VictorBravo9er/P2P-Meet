# 06 - User Settings & Preferences

## 1. Overview
The application settings system is designed to provide granular control over audio filtering, camera resolution, mirroring, and in-call notifications without exposing confusing infrastructure credentials to participants.

The settings engine is managed by [`src/services/settings.ts`](../src/services/settings.ts) and configured via the dialog component [`src/components/SettingsModal.tsx`](../src/components/SettingsModal.tsx).

---

## 2. Settings Schema & Defaults

The user configuration is strictly typed by the `UserSettings` interface:

```typescript
export interface UserSettings {
  // Audio processing preferences
  noiseSuppression: boolean;       // Ambient/fan/typing noise filtering
  echoCancellation: boolean;       // Speaker feedback suppression
  autoGainControl: boolean;        // Voice volume normalization

  // Video preferences
  mirrorSelfVideo: boolean;        // Horizontal flip for local preview
  videoResolution: '480p' | '720p' | '1080p'; // Target capture quality

  // Meeting & Notification preferences
  chatSoundNotification: boolean;  // Audio chime on incoming chat
  speakingIndicator: boolean;      // Green border glow when speaking
  bandwidthSaver: boolean;         // Prioritizes voice on low-speed links
}
```

### Defaults:
```typescript
export const DEFAULT_SETTINGS: UserSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  mirrorSelfVideo: true,
  videoResolution: '720p',
  chatSoundNotification: true,
  speakingIndicator: true,
  bandwidthSaver: false,
};
```

---

## 3. Storage & Event-Driven Propagation

Settings are persisted in the browser's `localStorage` under the key `p2p_meeting_user_settings`.

### Seamless Dynamic Updates:
When any setting is modified in `SettingsModal`, the service saves the new state and dispatches a window event:
```typescript
export function saveStoredUserSettings(settings: UserSettings): void {
  localStorage.setItem('p2p_meeting_user_settings', JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('p2p_settings_changed', { detail: settings }));
}
```

Components and hooks listen for `p2p_settings_changed` and update their runtime behavior **without restarting the call**:
- **`useMediaStream`**: Calls `track.applyConstraints()` on live audio and video tracks to adjust noise suppression, AGC, or resolution on the fly.
- **`VideoTile`**: Immediately updates `scale-x-[-1]` (mirroring) and active speaking border states.
- **`Lobby`**: Immediately mirrors or unmirrors the pre-call camera preview.

---

## 4. Feature Breakdown

### 4.1 Live Interactive Microphone Test
Inside the **Audio & Voice** tab, users can test their microphone before or during a meeting:
1. Clicking **Test Mic** acquires an isolated audio stream from the selected microphone.
2. An `AudioContext` and `AnalyserNode` measure instantaneous volume frequency data.
3. A visual level bar updates smoothly via `requestAnimationFrame`, showing a green-to-teal gradient bar (0% to 100%).
4. Closing the modal or clicking **Stop Test** cleanly releases the audio stream and closes the `AudioContext`.

### 4.2 Web Audio Synthesized Notification Chime
Rather than depending on external `.mp3` or `.wav` files (which can fail to load or be blocked by CORS/CDN policies), incoming chat sound alerts are **synthesized mathematically** via the native Web Audio API in `playNotificationChime()`:
- **Tone 1**: Sine wave at $587.33\text{ Hz}$ (D5) with an exponential gain decay of $0.18\text{ s}$.
- **Tone 2**: Sine wave at $880.00\text{ Hz}$ (A5) starting $0.09\text{ s}$ later with an exponential gain decay of $0.32\text{ s}$.
- Produces a crisp, friendly two-tone chime with zero asset footprint.

### 4.3 Target Resolution Selector
Users can choose between:
- **720p HD (1280x720)**: Default recommended balance of visual clarity and bandwidth.
- **1080p Full HD (1920x1080)**: Maximum clarity for detailed presentations.
- **480p SD (640x480)**: Bandwidth saver mode for cellular or constrained networks.

### 4.4 Security & P2P Diagnostics Tab
Provides non-technical users with clear visibility into their call security:
- **Direct WebRTC Mesh**: Confirms zero intermediate media servers.
- **Encryption**: Verifies DTLS 1.2 / SRTP 256-bit AES encryption.
- **NAT Traversal**: Displays active Google Public STUN servers (`stun.l.google.com:19302`).
- **Data Channels**: Explains SCTP encrypted data routing for text chat.
