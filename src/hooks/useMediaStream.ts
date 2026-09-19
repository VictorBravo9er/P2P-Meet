import { useState, useEffect, useRef, useCallback } from 'react';
import { getStoredUserSettings, UserSettings } from '../services/settings';

export interface UseMediaStreamResult {
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  audioInputDevices: MediaDeviceInfo[];
  videoInputDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  error: string | null;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<void>;
  setSelectedAudioDeviceId: (deviceId: string) => void;
  setSelectedVideoDeviceId: (deviceId: string) => void;
  startMedia: () => Promise<MediaStream | null>;
  stopMedia: () => void;
}

export function useMediaStream(): UseMediaStreamResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>('');

  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const originalCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isSpeakingRef = useRef<boolean>(false);

  // Keep localStreamRef and localScreenStreamRef always synced with latest state
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    localScreenStreamRef.current = localScreenStream;
  }, [localScreenStream]);

  // Enumerate devices helper
  const updateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');

      setAudioInputDevices(audioInputs);
      setVideoInputDevices(videoInputs);
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, []);

  // Speaking level detector using Web Audio AnalyserNode (throttled)
  const setupAudioMonitor = useCallback((stream: MediaStream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }

      const audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;

      const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      source.connect(analyser);

      // Store source in ref to prevent V8/SpiderMonkey garbage collection from terminating audio
      audioSourceRef.current = source;
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      if (audioCtx.state === 'suspended') {
        const resumeAudio = () => {
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
          window.removeEventListener('click', resumeAudio);
          window.removeEventListener('keydown', resumeAudio);
        };
        window.addEventListener('click', resumeAudio);
        window.addEventListener('keydown', resumeAudio);
      }

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current || audioTrack.muted || !audioTrack.enabled) {
          if (isSpeakingRef.current) {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
          }
          animFrameRef.current = requestAnimationFrame(checkVolume);
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // Threshold for speaking detection
        const nowSpeaking = average > 14;
        if (nowSpeaking !== isSpeakingRef.current) {
          isSpeakingRef.current = nowSpeaking;
          setIsSpeaking(nowSpeaking);
        }

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.warn('Could not initialize audio meter:', err);
    }
  }, []);

  const startMedia = useCallback(async (): Promise<MediaStream | null> => {
    try {
      setError(null);

      const userSettings = getStoredUserSettings();
      const resolutionMap = {
        '480p': { width: { ideal: 640 }, height: { ideal: 480 } },
        '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
        '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
      };
      const resConstraint = resolutionMap[userSettings.videoResolution] || resolutionMap['720p'];

      const audioConstraint: boolean | MediaTrackConstraints = selectedAudioDeviceId
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

      const videoConstraint: boolean | MediaTrackConstraints = selectedVideoDeviceId
        ? { deviceId: selectedVideoDeviceId, ...resConstraint }
        : resConstraint;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraint,
        video: videoConstraint,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        originalCameraTrackRef.current = videoTrack;
      }

      setupAudioMonitor(stream);
      await updateDevices();
      return stream;
    } catch (err: unknown) {
      console.error('Failed to get camera/mic stream:', err);
      // Fallback: try audio only if video fails
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setIsVideoOff(true);
        setupAudioMonitor(audioStream);
        await updateDevices();
        return audioStream;
      } catch (audioErr) {
        const message = err instanceof Error ? err.message : 'Failed to access camera/mic';
        setError(message);
        return null;
      }
    }
  }, [selectedAudioDeviceId, selectedVideoDeviceId, setupAudioMonitor, updateDevices]);

  // Stop media on explicit user request
  const stopMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
      setLocalScreenStream(null);
      setIsScreenSharing(false);
    }
    if (originalCameraTrackRef.current) {
      originalCameraTrackRef.current.stop();
      originalCameraTrackRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  // ONLY cleanup tracks on unmount of the entire app
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (originalCameraTrackRef.current) {
        originalCameraTrackRef.current.stop();
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Dynamically update media track constraints when user settings change
  useEffect(() => {
    const handleSettingsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<UserSettings>;
      const newSettings = customEvent.detail;
      if (!newSettings) return;

      const stream = localStreamRef.current;
      if (!stream) return;

      // Update audio constraints on live track if supported
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && audioTrack.applyConstraints) {
        audioTrack
          .applyConstraints({
            echoCancellation: newSettings.echoCancellation,
            noiseSuppression: newSettings.noiseSuppression,
            autoGainControl: newSettings.autoGainControl,
          })
          .catch(() => {});
      }

      // Update video constraints on live track if supported
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoTrack.applyConstraints && !isScreenSharing) {
        const resolutionMap = {
          '480p': { width: { ideal: 640 }, height: { ideal: 480 } },
          '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
          '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
        };
        const resConstraint = resolutionMap[newSettings.videoResolution] || resolutionMap['720p'];
        videoTrack.applyConstraints(resConstraint).catch(() => {});
      }
    };

    window.addEventListener('p2p_settings_changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('p2p_settings_changed', handleSettingsChanged);
    };
  }, [isScreenSharing]);

  // Toggle Microphone
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const nextState = !audioTrack.enabled;
      audioTrack.enabled = nextState;
      setIsAudioMuted(!nextState);
    }
  }, []);

  // Toggle Camera
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const nextState = !videoTrack.enabled;
      videoTrack.enabled = nextState;
      setIsVideoOff(!nextState);
    }
  }, []);

  // Toggle Screen Sharing (Decoupled from camera and localStream)
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen share
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
        localScreenStreamRef.current = null;
      }
      setLocalScreenStream(null);
      setIsScreenSharing(false);
    } else {
      // Start screen share
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          alert('Screen sharing is not supported by your browser.');
          return;
        }

        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true, // Allow capturing system/tab audio if supported and user opts in
        });

        const screenTrack = displayStream.getVideoTracks()[0];
        if (!screenTrack) return;

        // Hint to WebRTC encoder to prioritize spatial detail and sharp text over motion
        try {
          if ('contentHint' in screenTrack) {
            screenTrack.contentHint = 'detail';
          }
        } catch {
          // Non-critical if unsupported by browser
        }

        localScreenStreamRef.current = displayStream;
        setLocalScreenStream(displayStream);
        setIsScreenSharing(true);

        // Handle user clicking native browser "Stop sharing" bar
        screenTrack.onended = () => {
          displayStream.getTracks().forEach((track) => track.stop());
          localScreenStreamRef.current = null;
          setLocalScreenStream(null);
          setIsScreenSharing(false);
        };
      } catch (err) {
        console.warn('Screen share canceled or denied:', err);
      }
    }
  }, [isScreenSharing]);

  return {
    localStream,
    localScreenStream,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isSpeaking,
    audioInputDevices,
    videoInputDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    error,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    setSelectedAudioDeviceId,
    setSelectedVideoDeviceId,
    startMedia,
    stopMedia,
  };
}
