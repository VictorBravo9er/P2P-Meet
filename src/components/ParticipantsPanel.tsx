import React, { useState } from 'react';
import {
  X,
  Users,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Search,
  Copy,
  Check,
  User,
} from 'lucide-react';
import { Participant } from '../types/meeting';

interface ParticipantsPanelProps {
  isOpen: boolean;
  participants: Participant[];
  currentUserId: string;
  roomId: string;
  onClose: () => void;
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  isOpen,
  participants,
  currentUserId,
  roomId,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Sort participants: Local user first, then presenter, then alphabetical
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    if (a.isScreenSharing && !b.isScreenSharing) return -1;
    if (!a.isScreenSharing && b.isScreenSharing) return 1;
    return a.name.localeCompare(b.name);
  });

  const filteredParticipants = sortedParticipants.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="fixed right-4 top-4 bottom-24 w-80 md:w-96 rounded-2xl bg-surface/95 backdrop-blur-xl border border-slate-700/60 shadow-2xl z-30 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary-500/10 text-primary-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-100 text-sm">Participants</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-primary-400 border border-slate-700/60">
                {participants.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">In this peer-to-peer call</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Close participants list"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search Bar */}
      {participants.length > 2 && (
        <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-900/40">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search participants..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700/60 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>
      )}

      {/* Participant List */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2">
        {filteredParticipants.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs px-4">
            <p>No participants match your search.</p>
          </div>
        ) : (
          filteredParticipants.map((p) => {
            const isSelf = p.id === currentUserId;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition"
              >
                {/* Left: Avatar and Name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all flex-shrink-0 ${
                      p.isSpeaking
                        ? 'bg-emerald-600 ring-2 ring-emerald-500/80'
                        : 'bg-primary-600'
                    }`}
                  >
                    {p.name ? (
                      p.name.substring(0, 2).toUpperCase()
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                    {p.isSpeaking && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-surface animate-pulse" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {p.name}
                      </span>
                      {isSelf && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary-500/20 text-primary-300 font-medium">
                          You
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {p.isScreenSharing && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          <Monitor className="w-2.5 h-2.5" />
                          Presenting
                        </span>
                      )}
                      {!isSelf &&
                        p.connectionState &&
                        p.connectionState !== 'connected' && (
                          <span className="text-[10px] text-amber-400 font-medium">
                            {p.connectionState}
                          </span>
                        )}
                    </div>
                  </div>
                </div>

                {/* Right: Media Status Icons */}
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  {/* Microphone Status */}
                  <div
                    title={p.isAudioMuted ? 'Microphone muted' : 'Microphone on'}
                    className={`p-1.5 rounded-lg text-xs ${
                      p.isAudioMuted
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                        : 'bg-slate-800 text-emerald-400'
                    }`}
                  >
                    {p.isAudioMuted ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                  </div>

                  {/* Video Status */}
                  <div
                    title={p.isVideoOff ? 'Camera off' : 'Camera on'}
                    className={`p-1.5 rounded-lg text-xs ${
                      p.isVideoOff
                        ? 'bg-slate-800/80 text-slate-400'
                        : 'bg-slate-800 text-emerald-400'
                    }`}
                  >
                    {p.isVideoOff ? (
                      <VideoOff className="w-3.5 h-3.5" />
                    ) : (
                      <Video className="w-3.5 h-3.5" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Quick Share Invite */}
      <div className="p-3 border-t border-slate-800 bg-surface flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-400 truncate">
          Room: <span className="font-mono text-primary-300">{roomId}</span>
        </div>
        <button
          onClick={handleCopyLink}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 text-xs font-medium flex items-center gap-1.5 transition"
        >
          {copiedLink ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Share Link</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
