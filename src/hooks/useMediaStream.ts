import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseMediaStreamResult {
  localStream: MediaStream | null;
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
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>('');

  const originalCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Enumerate devices
  const updateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');

      setAudioInputDevices(audioInputs);
      setVideoInputDevices(videoInputs);

      if (audioInputs.length > 0 && !selectedAudioDeviceId) {
        setSelectedAudioDeviceId(audioInputs[0].deviceId);
      }
      if (videoInputs.length > 0 && !selectedVideoDeviceId) {
        setSelectedVideoDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, [selectedAudioDeviceId, selectedVideoDeviceId]);

  // Speaking level detector using Web Audio AnalyserNode
  const setupAudioMonitor = useCallback((stream: MediaStream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }

      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current || audioTrack.muted || !audioTrack.enabled) {
          setIsSpeaking(false);
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
        setIsSpeaking(average > 15);
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
      const constraints: MediaStreamConstraints = {
        audio: selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true,
        video: selectedVideoDeviceId
          ? {
              deviceId: { exact: selectedVideoDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        originalCameraTrackRef.current = videoTrack;
      }

      setupAudioMonitor(stream);
      await updateDevices();
      return stream;
    } catch (err: unknown) {
      console.error('Failed to get user media:', err);
      // Try audio-only if video fails
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

  const stopMedia = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [localStream]);

  const toggleAudio = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
    }
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  }, [localStream]);

  const toggleScreenShare = useCallback(async () => {
    if (!localStream) return;

    if (isScreenSharing) {
      // Revert to camera
      if (originalCameraTrackRef.current) {
        const screenTrack = localStream.getVideoTracks()[0];
        if (screenTrack) {
          screenTrack.stop();
          localStream.removeTrack(screenTrack);
        }
        localStream.addTrack(originalCameraTrackRef.current);
        setLocalStream(new MediaStream(localStream.getTracks()));
      }
      setIsScreenSharing(false);
    } else {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        const screenTrack = displayStream.getVideoTracks()[0];
        const oldVideoTrack = localStream.getVideoTracks()[0];

        if (oldVideoTrack) {
          originalCameraTrackRef.current = oldVideoTrack;
          localStream.removeTrack(oldVideoTrack);
        }

        localStream.addTrack(screenTrack);
        setLocalStream(new MediaStream(localStream.getTracks()));
        setIsScreenSharing(true);

        // Handle user stopping screen share via browser UI bar
        screenTrack.onended = () => {
          if (originalCameraTrackRef.current) {
            localStream.removeTrack(screenTrack);
            localStream.addTrack(originalCameraTrackRef.current);
            setLocalStream(new MediaStream(localStream.getTracks()));
          }
          setIsScreenSharing(false);
        };
      } catch (err) {
        console.warn('Screen share canceled or denied:', err);
      }
    }
  }, [isScreenSharing, localStream]);

  useEffect(() => {
    return () => {
      stopMedia();
    };
  }, [stopMedia]);

  return {
    localStream,
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
