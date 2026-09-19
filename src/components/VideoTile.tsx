import React, { useEffect, useRef, useState } from 'react';
import {
  MicOff,
  Monitor,
  User,
  Maximize,
  Minimize,
  PictureInPicture,
  Scan,
} from 'lucide-react';
import { Participant } from '../types/meeting';
import { getStoredUserSettings, UserSettings } from '../services/settings';

interface VideoTileProps {
  participant: Participant;
  isSelf?: boolean;
}

export const VideoTile: React.FC<VideoTileProps> = ({ participant, isSelf = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [trackRevision, setTrackRevision] = useState(0);
  const [userSettings, setUserSettings] = useState<UserSettings>(getStoredUserSettings);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>(
    participant.isScreenSharing ? 'contain' : 'cover'
  );

  useEffect(() => {
    const handleSettingsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<UserSettings>;
      if (customEvent.detail) {
        setUserSettings(customEvent.detail);
      }
    };
    window.addEventListener('p2p_settings_changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('p2p_settings_changed', handleSettingsChanged);
    };
  }, []);

  // Sync default fitMode if screen share state changes
  useEffect(() => {
    setFitMode(participant.isScreenSharing ? 'contain' : 'cover');
  }, [participant.isScreenSharing]);

  // Track Fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch (err) {
      console.warn('[VideoTile] Fullscreen toggle error:', err);
    }
  };

  const togglePiP = async () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoEl.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('[VideoTile] Picture-in-picture error:', err);
    }
  };

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (participant.stream) {
      if (videoEl.srcObject !== participant.stream) {
        videoEl.srcObject = participant.stream;
      }
      videoEl.play().catch((err) => {
        // Autoplay may be restricted until user interaction
        console.warn(`[VideoTile] Playback deferred for ${participant.name}:`, err);
      });
    } else {
      videoEl.srcObject = null;
    }
  }, [participant.stream, trackRevision, participant.name]);

  // Listen for track additions / removals on the MediaStream
  useEffect(() => {
    const stream = participant.stream;
    if (!stream) return;

    const handleTrackChange = () => {
      setTrackRevision((prev) => prev + 1);
    };

    stream.addEventListener('addtrack', handleTrackChange);
    stream.addEventListener('removetrack', handleTrackChange);

    return () => {
      stream.removeEventListener('addtrack', handleTrackChange);
      stream.removeEventListener('removetrack', handleTrackChange);
    };
  }, [participant.stream]);

  const videoTracks = participant.stream ? participant.stream.getVideoTracks() : [];
  const hasVideoTrack =
    videoTracks.length > 0 &&
    videoTracks[0].enabled &&
    !participant.isVideoOff;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-0 rounded-2xl overflow-hidden ${
        participant.isScreenSharing ? 'bg-slate-950' : 'bg-surface'
      } border transition-all duration-300 flex items-center justify-center select-none shadow-lg group ${
        participant.isSpeaking && userSettings.speakingIndicator
          ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf} // Crucial: Always mute local audio to avoid audio feedback loop
        className={`w-full h-full ${
          participant.isScreenSharing
            ? fitMode === 'contain'
              ? 'object-contain'
              : 'object-cover'
            : 'object-cover'
        } transition-opacity duration-300 ${
          isSelf && !participant.isScreenSharing && userSettings.mirrorSelfVideo ? 'scale-x-[-1]' : ''
        } ${hasVideoTrack ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Fallback Avatar when video is off */}
      {!hasVideoTrack && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-surface to-slate-950">
          <div
            className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-2xl md:text-3xl font-bold transition-transform duration-300 ${
              participant.isSpeaking
                ? 'bg-emerald-600 text-white scale-110 ring-4 ring-emerald-500/40'
                : 'bg-primary-600 text-white'
            }`}
          >
            {participant.name ? (
              participant.name.substring(0, 2).toUpperCase()
            ) : (
              <User className="w-10 h-10" />
            )}
          </div>
          <span className="mt-3 text-sm font-medium text-slate-300">
            {participant.name} {isSelf && '(You)'}
          </span>
        </div>
      )}

      {/* Connection State Badge */}
      {!isSelf && participant.connectionState && participant.connectionState !== 'connected' && (
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 backdrop-blur-md">
          {participant.connectionState === 'connecting'
            ? 'Connecting...'
            : participant.connectionState}
        </div>
      )}

      {/* Screen Sharing Interactive Controls Overlay */}
      {participant.isScreenSharing ? (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/25 text-indigo-200 border border-indigo-500/40 backdrop-blur-md flex items-center gap-1.5 shadow-sm">
            <Monitor className="w-3.5 h-3.5 text-indigo-300" />
            <span>{isSelf ? 'You are presenting' : 'Presenting'}</span>
          </div>

          {/* Fit / Fill Aspect Ratio Toggle */}
          <button
            onClick={() => setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'))}
            title={
              fitMode === 'contain'
                ? 'Fill Screen (may crop)'
                : 'Fit to Screen (Preserve entire screen / aspect ratio)'
            }
            className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md transition shadow"
          >
            <Scan className="w-3.5 h-3.5" />
          </button>

          {/* Picture-in-Picture Button */}
          {document.pictureInPictureEnabled && (
            <button
              onClick={togglePiP}
              title="Picture in Picture"
              className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md transition shadow"
            >
              <PictureInPicture className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md transition shadow"
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
        </div>
      ) : null}

      {/* Bottom Info Bar: Nameplate & Status Icons */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-xs font-medium text-slate-200">
          <span>{participant.name}</span>
          {isSelf && <span className="text-primary-400 font-semibold">(You)</span>}
        </div>

        <div className="flex items-center gap-1.5">
          {participant.isAudioMuted && (
            <div className="p-1.5 rounded-lg bg-rose-500/80 text-white backdrop-blur-md shadow">
              <MicOff className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

