import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  MessageSquare,
  Link,
  Check,
  Settings,
  PhoneOff,
} from 'lucide-react';

interface ControlBarProps {
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  unreadChatCount: number;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onOpenSettings: () => void;
  onLeaveCall: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  isChatOpen,
  unreadChatCount,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onOpenSettings,
  onLeaveCall,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-center gap-2 md:gap-3 px-4 py-3 rounded-2xl bg-surface/90 backdrop-blur-xl border border-slate-700/60 shadow-2xl shadow-black/50">
        {/* Mic toggle */}
        <button
          onClick={onToggleAudio}
          title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          className={`p-3 rounded-xl transition-all duration-200 ${
            isAudioMuted
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white'
          }`}
        >
          {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Camera toggle */}
        <button
          onClick={onToggleVideo}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
          className={`p-3 rounded-xl transition-all duration-200 ${
            isVideoOff
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white'
          }`}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Screen share toggle */}
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Stop presenting' : 'Share your screen'}
          className={`p-3 rounded-xl transition-all duration-200 ${
            isScreenSharing
              ? 'bg-primary-600 hover:bg-primary-500 text-white ring-2 ring-primary-400'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white'
          }`}
        >
          {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-slate-700/80 mx-1" />

        {/* In-call Chat toggle */}
        <button
          onClick={onToggleChat}
          title="Direct Peer-to-Peer Chat"
          className={`relative p-3 rounded-xl transition-all duration-200 ${
            isChatOpen
              ? 'bg-primary-600 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          {!isChatOpen && unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white shadow-md animate-pulse">
              {unreadChatCount > 9 ? '9+' : unreadChatCount}
            </span>
          )}
        </button>

        {/* Copy Invite Link */}
        <button
          onClick={handleCopyLink}
          title="Copy meeting invite link"
          className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-all duration-200 relative"
        >
          {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Link className="w-5 h-5" />}
          {copied && (
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-emerald-300 text-xs rounded shadow whitespace-nowrap">
              Link Copied!
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title="Audio & Video Settings"
          className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-all duration-200"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-slate-700/80 mx-1" />

        {/* End / Leave call */}
        <button
          onClick={onLeaveCall}
          title="Leave meeting"
          className="px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center gap-2 transition-all duration-200 shadow-lg shadow-rose-900/30"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="hidden sm:inline text-sm font-semibold">Leave</span>
        </button>
      </div>
    </div>
  );
};
