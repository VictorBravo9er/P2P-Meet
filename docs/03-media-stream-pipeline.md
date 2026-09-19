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

## 4. Screen Sharing Architecture

Screen sharing is activated through `toggleScreenShare()`:

```typescript
const displayStream = await navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: false,
});
```

### Track Swapping & Optimization:
1. **Acquisition & Content Hinting**:
   - When acquired via `getDisplayMedia`, the display track's `contentHint` is set to `'detail'` (`screenTrack.contentHint = 'detail'`).
   - This signals the WebRTC video encoder to prioritize fine spatial detail, text legibility, and high resolution over aggressive motion smoothing.
2. **Activation**:
   - The current camera video track is removed from the local `MediaStream` and saved in `originalCameraTrackRef.current`.
   - The new `screenTrack` is appended to the stream.
   - `setLocalStream(updatedStream)` is triggered, which invokes `sender.replaceTrack(screenTrack)` across all active peer connections.
3. **Native "Stop Sharing" Integration**:
   - Browsers display a native floating bar with a "Stop sharing" button.
   - When clicked by the user, the track fires `screenTrack.onended`.
   - The handler stops the screen track, restores `originalCameraTrackRef.current`, swaps the sender track back to camera, and toggles `isScreenSharing = false`.
4. **Manual Reversion**:
   - If the user clicks the in-app "Stop Sharing" button, the screen track is stopped, and the camera track is re-instated or re-acquired.

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
