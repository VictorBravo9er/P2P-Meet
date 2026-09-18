import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Sparkles,
  Settings,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { getStoredSupabaseConfig } from '../services/supabase';

interface LobbyProps {
  localStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isSpeaking: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onJoinMeeting: (roomId: string, userName: string) => void;
  onOpenSettings: () => void;
  initialRoomId?: string;
}

export const Lobby: React.FC<LobbyProps> = ({
  localStream,
  isAudioMuted,
  isVideoOff,
  isSpeaking,
  onToggleAudio,
  onToggleVideo,
  onJoinMeeting,
  onOpenSettings,
  initialRoomId = '',
}) => {
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('p2p_meeting_username') || `User_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [roomId, setRoomId] = useState(initialRoomId);
  const [isConfigured, setIsConfigured] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (initialRoomId) {
      setRoomId(initialRoomId);
    }
  }, [initialRoomId]);

  useEffect(() => {
    if (previewVideoRef.current && localStream) {
      previewVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    const config = getStoredSupabaseConfig();
    setIsConfigured(!!config);
  }, []);

  const handleCreateRandomRoom = () => {
    const randomId = Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 6);
    setRoomId(randomId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return;

    localStorage.setItem('p2p_meeting_username', userName.trim());
    onJoinMeeting(roomId.trim(), userName.trim());
  };

  const hasVideoTrack =
    localStream &&
    localStream.getVideoTracks().length > 0 &&
    localStream.getVideoTracks()[0].enabled &&
    !isVideoOff;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 md:p-8">
      {/* Top Brand Bar */}
      <header className="w-full max-w-5xl flex items-center justify-between py-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-500 shadow-lg shadow-primary-500/20 text-white">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              P2P Meeting
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300 border border-primary-500/30">
                Peer-to-Peer
              </span>
            </h1>
            <p className="text-xs text-slate-400">Zero middleman media server • Encrypted WebRTC</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isConfigured ? (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Signaling Ready</span>
            </div>
          ) : (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs hover:bg-amber-500/20 transition"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Configure Supabase</span>
            </button>
          )}

          <button
            onClick={onOpenSettings}
            className="p-2.5 rounded-xl bg-surface border border-slate-800 text-slate-300 hover:text-white hover:bg-surface-hover transition"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Lobby Container */}
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Camera/Mic Preview Box */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div
            className={`relative w-full aspect-video rounded-3xl overflow-hidden bg-surface border shadow-2xl flex items-center justify-center transition-all duration-300 ${
              isSpeaking
                ? 'border-emerald-500 ring-4 ring-emerald-500/30'
                : 'border-slate-800'
            }`}
          >
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted // Always mute self preview
              className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
                hasVideoTrack ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {!hasVideoTrack && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 text-slate-400">
                <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                  <VideoOff className="w-8 h-8 text-slate-500" />
                </div>
                <p className="text-sm font-medium">Your camera is turned off</p>
              </div>
            )}

            {/* Speaking Activity Indicator */}
            {isSpeaking && (
              <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                Speaking
              </div>
            )}

            {/* In-Preview Media Controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10">
              <button
                type="button"
                onClick={onToggleAudio}
                className={`p-3 rounded-xl transition ${
                  isAudioMuted
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200'
                }`}
                title={isAudioMuted ? 'Unmute' : 'Mute'}
              >
                {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={onToggleVideo}
                className={`p-3 rounded-xl transition ${
                  isVideoOff
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200'
                }`}
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Check your audio and video before entering the meeting
          </p>
        </div>

        {/* Right: Join / Create Form */}
        <div className="lg:col-span-5 bg-surface/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-xl">
          <h2 className="text-xl font-bold text-slate-100">Ready to join?</h2>
          <p className="text-sm text-slate-400 mt-1 mb-5">
            Enter your name and confirm the room code to get started.
          </p>

          {initialRoomId && (
            <div className="mb-5 p-3.5 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary-600/20 text-primary-300">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <span className="text-slate-400 block">Invited to Room:</span>
                <span className="font-mono font-bold text-primary-300 text-sm">{initialRoomId}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 uppercase tracking-wide">
                Your Display Name
              </label>
              <input
                type="text"
                required
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Victor"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary-500 transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 block uppercase tracking-wide">
                  Meeting Room Code
                </label>
                <button
                  type="button"
                  onClick={handleCreateRandomRoom}
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Code
                </button>
              </div>
              <input
                type="text"
                required
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="e.g. team-standup"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary-500 transition font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={!userName.trim() || !roomId.trim()}
              className="w-full mt-2 py-3.5 px-6 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:hover:bg-primary-600 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25 transition duration-200"
            >
              <span>Enter Meeting</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Privacy Note */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>
              Audio and video streams travel <strong>directly peer-to-peer</strong> between participants. No media is recorded or saved on any server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
