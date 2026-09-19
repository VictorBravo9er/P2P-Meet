# 03 - Media Stream Pipeline

## 1. Overview
The media capture, processing, and monitoring pipeline is managed by the custom React hook `useMediaStream` in [`src/hooks/useMediaStream.ts`](../src/hooks/useMediaStream.ts) and consumed by preview elements in `Lobby` and media tiles in `VideoTile`.

The pipeline handles:
1. Hardware device discovery and acquisition (`getUserMedia`).
2. WebRTC audio filtering constraints to prevent acoustic loops.
3. Live speaking detection via the Web Audio API with **Garbage Collection (GC) protection**.
4. Display capture for screen presentation (`getDisplayMedia`).
5. Browser autoplay policy handling and dynamic track event listeners.

---

## 2. Hardware Acquisition & Constraints

When `startMedia()` is executed, the hook reads the user's active preferences from `getStoredUserSettings()` and constructs exact constraints:

```typescript
const userSettings = getStoredUserSettings();

// Dynamic resolution mapping
const resolutionMap = {
  '480p': { width: { ideal: 640 }, height: { ideal: 480 } },
  '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
  '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
};
const resConstraint = resolutionMap[userSettings.videoResolution] || resolutionMap['720p'];

// Audio constraints with explicit echo/noise suppression
const audioConstraint = selectedAudioDeviceId
  ? {
      deviceId: selectedAudioDeviceId,
      echoCancellation: userSettings.echoCancellation,
      noiseSuppression: userSettings.noiseSuppression,
      autoGainControl: userSettings.autoGainControl,
    }
  : {
      echoCancellation: userSettings.echoCancellation,
      noiseSuppression: userSettings.noiseSuppression,
      autoGainControl: userSettings.autoGainControl,
    };

const videoConstraint = selectedVideoDeviceId
  ? { deviceId: selectedVideoDeviceId, ...resConstraint }
  : resConstraint;
```

### Fallback Mechanism:
If video capture fails (e.g., camera already claimed by another OS application or permission denied), `startMedia()` automatically executes an audio-only fallback:
```typescript
const audioStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});
```

---

## 3. Speaking Detection & Garbage Collection Protection

The application detects when a user is actively speaking to highlight their video tile and signal their status to the room.

```
       [ Local MediaStream (Audio Track) ]
                       │
                       ▼
       ┌───────────────────────────────┐
       │ MediaStreamAudioSourceNode    │ ◄── Stored in audioSourceRef.current
       └───────────────┬───────────────┘     (Prevents V8 GC disconnect!)
                       │
                       ▼
       ┌───────────────────────────────┐
       │         AnalyserNode          │
       │       (fftSize = 256)         │
       └───────────────┬───────────────┘
                       │
                       ▼
             requestAnimationFrame
             • Average Frequency Calculation
             • Threshold Check (average > 14)
                       │
                       ▼
           setIsSpeaking(true / false)
```

### The Garbage Collection Pitfall:
In modern JavaScript engines (V8 in Chrome/Edge, SpiderMonkey in Firefox):
- If `audioCtx.createMediaStreamSource(stream)` is created as a local variable inside a function without an active root reference, **the engine will garbage-collect the node after a few seconds**.
- Once garbage-collected, the audio graph terminates, and speaking detection (or in some browser versions, the microphone input itself) goes permanently silent.
- **Solution**: `useMediaStream` holds a persistent reference:
  ```typescript
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  ...
  audioSourceRef.current = source;
  ```

### Autoplay & Suspended AudioContext Handling:
Modern browsers disallow `AudioContext` from running without an initial user gesture. If initialized before user interaction, `audioCtx.state` starts as `'suspended'`.
The hook installs temporary click/keypress listeners to resume the audio context seamlessly:
```typescript
if (audioCtx.state === 'suspended') {
  const resumeAudio = () => {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    window.removeEventListener('click', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
  };
  window.addEventListener('click', resumeAudio);
  window.addEventListener('keydown', resumeAudio);
}
```

---

## 4. Screen Sharing Architecture (Decoupled Multi-Stream)

Rather than swapping screen video into the existing webcam track (which causes mutual exclusion and ties camera mute buttons to the screen cast), the application implements an independent, parallel **`localScreenStream` pipeline**:

```
                          User Action (toggleScreenShare)
                                        │
                                        ▼
                        getDisplayMedia({ video: true, audio: true })
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
                 Screen Video Track           Screen Audio Track
             (contentHint = 'detail')       (System / Tab Audio)
                         │                             │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                          localScreenStream (MediaStream)
                                        │
              ┌─────────────────────────┴─────────────────────────┐
              ▼                                                   ▼
       Local UI Spotlight                             PeerConnectionManager
  (VideoTile isScreenShareTile)                    (setLocalScreenStream)
                                                                  │
                                                                  ▼
                                                      Dedicated Screen Senders
                                                    (QoS Priority: Medium / AF41)
```

### Decoupled Lifecycle:
1. **Independent Acquisition**:
   - Captured via `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`.
   - Captures both presentation video and optional system/browser tab audio.
   - Screen video track is immediately configured with `screenTrack.contentHint = 'detail'` to instruct WebRTC to preserve 1080p/4K fine text and lines.
2. **True Camera & Screen Decoupling**:
   - `localStream` (webcam and microphone) remains completely untouched and active.
   - Presenters can share their screen while simultaneously displaying their camera feed in the participant strip.
   - Turning off the camera via `toggleVideo()` sets `cameraTrack.enabled = false` on `localStream` only; the screen share remains 100% active and unimpacted.
3. **Native & Manual Tear Down**:
   - **Native OS / Browser Bar**: Clicking the browser's floating "Stop sharing" button triggers `screenTrack.onended`.
   - **In-App Controls**: Clicking "Stop Sharing" on the presentation banner, control bar, or presentation toolbar invokes `toggleScreenShare()`.
   - In both cases, all screen tracks are stopped, `localScreenStream` is set to `null`, `rtcManager.setLocalScreenStream(null)` cleans up screen transceivers/senders, and `isScreenSharing = false` is broadcast to peers.

---

## 5. Media Playback in `VideoTile`

Rendering remote media streams reliably in modern browsers requires handling asynchronous track arrival and autoplay restrictions:

### 1. Autoplay Policy (`videoEl.play().catch(...)`):
Browsers frequently block or suspend video elements with unmuted audio unless explicitly played after user engagement:
```typescript
useEffect(() => {
  const videoEl = videoRef.current;
  if (!videoEl) return;

  if (participant.stream) {
    if (videoEl.srcObject !== participant.stream) {
      videoEl.srcObject = participant.stream;
    }
    videoEl.play().catch((err) => {
      console.warn(`[VideoTile] Playback deferred for ${participant.name}:`, err);
    });
  } else {
    videoEl.srcObject = null;
  }
}, [participant.stream, trackRevision, participant.name]);
```

### 2. Asynchronous Track Listeners:
Often an audio track arrives first, followed by a video track hundreds of milliseconds later. `VideoTile` listens for `addtrack` and `removetrack` directly on the `MediaStream`:
```typescript
useEffect(() => {
  const stream = participant.stream;
  if (!stream) return;

  const handleTrackChange = () => setTrackRevision((prev) => prev + 1);
  stream.addEventListener('addtrack', handleTrackChange);
  stream.addEventListener('removetrack', handleTrackChange);

  return () => {
    stream.removeEventListener('addtrack', handleTrackChange);
    stream.removeEventListener('removetrack', handleTrackChange);
  };
}, [participant.stream]);
```
This forces an immediate re-render and initiates video playback the instant the remote video track arrives.
