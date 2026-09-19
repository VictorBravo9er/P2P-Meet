import React, { useState } from 'react';
import { ShieldCheck, Copy, Check, Users, Sparkles, Eye, EyeOff } from 'lucide-react';
import { Participant, ChatMessage } from '../types/meeting';
import { VideoTile } from './VideoTile';
import { ControlBar } from './ControlBar';
import { ChatPanel } from './ChatPanel';
import { ParticipantsPanel } from './ParticipantsPanel';
import { SettingsModal } from './SettingsModal';

interface MeetingRoomProps {
  roomId: string;
  userName: string;
  localPeerId: string;
  localStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  participants: Participant[];
  chatMessages: ChatMessage[];
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error';
  errorMessage: string | null;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onSelectAudioDevice: (deviceId: string) => void;
  onSelectVideoDevice: (deviceId: string) => void;
  onSendMessage: (text: string) => void;
  onLeaveMeeting: () => void;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({
  roomId,
  userName,
  localPeerId,
  localStream,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  isSpeaking,
  participants,
  chatMessages,
  connectionStatus,
  errorMessage,
  audioDevices,
  videoDevices,
  selectedAudioDeviceId,
  selectedVideoDeviceId,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onSelectAudioDevice,
  onSelectVideoDevice,
  onSendMessage,
  onLeaveMeeting,
}) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isParticipantStripVisible, setIsParticipantStripVisible] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [lastReadMessageCount, setLastReadMessageCount] = useState(0);

  const handleToggleChat = () => {
    setIsChatOpen((prev) => !prev);
    if (!isChatOpen) {
      setLastReadMessageCount(chatMessages.length);
    }
  };

  const handleToggleParticipants = () => {
    setIsParticipantsOpen((prev) => !prev);
  };

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const unreadChatCount = isChatOpen
    ? 0
    : Math.max(0, chatMessages.length - lastReadMessageCount);

  // Combine self as participant with remote participants
  const selfParticipant: Participant = {
    id: localPeerId,
    name: userName,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isLocal: true,
    stream: localStream ?? undefined,
    isSpeaking,
    connectionState: 'connected',
  };

  const allParticipants = [selfParticipant, ...participants];
  const screenSharer = allParticipants.find((p) => p.isScreenSharing);

  // Dynamic grid column sizing based on peer count
  const getGridClass = () => {
    const count = allParticipants.length;
    if (count <= 1) return 'grid-cols-1 max-w-3xl';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 max-w-5xl';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-5xl';
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl';
  };

  return (
    <div className="relative min-h-screen bg-background flex flex-col overflow-hidden select-none">
      {/* Top Meeting Header */}
      <header className="h-16 px-4 md:px-8 border-b border-slate-800/80 bg-surface/50 backdrop-blur-md flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs font-medium text-slate-200">
            <span className="text-slate-400">Room:</span>
            <span className="font-mono font-semibold text-primary-300">{roomId}</span>
          </div>

          <button
            onClick={handleCopyLink}
            title="Copy invite link"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 text-xs flex items-center gap-1.5 transition"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? 'Copied' : 'Share Link'}</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Peer-to-Peer Encryption Tag */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Direct P2P Encrypted</span>
          </div>

          {/* Interactive Participants Badge */}
          <button
            onClick={handleToggleParticipants}
            title={isParticipantsOpen ? 'Close participants panel' : 'Open participants panel'}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition ${
              isParticipantsOpen
                ? 'bg-primary-600/30 text-primary-300 border-primary-500/50'
                : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border-slate-700/60'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-primary-400" />
            <span>{allParticipants.length}</span>
          </button>
        </div>
      </header>

      {/* Presenter Alert Banner if Local User is Sharing Screen */}
      {screenSharer?.isLocal && (
        <div className="w-full bg-indigo-950/70 border-b border-indigo-800/60 px-4 py-2 flex items-center justify-between z-10 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs text-indigo-200">
            <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
            <span className="font-semibold">You are presenting your screen</span>
            <span className="hidden sm:inline text-indigo-300/70">
              — All peers in this room can see your screen
            </span>
          </div>
          <button
            onClick={onToggleScreenShare}
            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition shadow-sm"
          >
            Stop Presenting
          </button>
        </div>
      )}

      {/* Main Grid View */}
      <main className="flex-1 p-4 md:p-6 pb-28 flex items-center justify-center overflow-y-auto">
        {errorMessage ? (
          <div className="max-w-md p-6 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-center">
            <h3 className="text-base font-semibold text-rose-300 mb-2">Signaling Connection Error</h3>
            <p className="text-xs text-rose-200/80 mb-4">{errorMessage}</p>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
            >
              Open Settings
            </button>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            {screenSharer ? (
              /* Screen share layout: Featured presenter + Hidable side strip */
              <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                {/* Screen Share Sub-Header: Focus Mode & Hidable Video Strip Toggle */}
                <div className="w-full max-w-7xl flex items-center justify-between px-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-300">
                      {screenSharer.isLocal ? 'Your Presentation' : `${screenSharer.name}'s Presentation`}
                    </span>
                    {isParticipantStripVisible && allParticipants.length > 1 ? (
                      <span className="hidden sm:inline text-slate-500">
                        • Showing participant video tiles
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                        • Focus Mode (Only screen cast visible)
                      </span>
                    )}
                  </div>

                  {/* Toggle button to hide/show participant strip */}
                  {allParticipants.length > 1 && (
                    <button
                      onClick={() => setIsParticipantStripVisible((prev) => !prev)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition ${
                        !isParticipantStripVisible
                          ? 'bg-primary-600/30 text-primary-300 border-primary-500/50 hover:bg-primary-600/40'
                          : 'bg-slate-800/80 text-slate-300 hover:text-white border-slate-700/60 hover:bg-slate-700'
                      }`}
                      title={
                        isParticipantStripVisible
                          ? 'Hide participant tiles so only screen cast is visible'
                          : 'Show participant tiles'
                      }
                    >
                      {isParticipantStripVisible ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hide Participants</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-primary-400" />
                          <span>Show Participants ({allParticipants.length - 1})</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Stage + Strip Container */}
                <div className="w-full h-full max-w-7xl flex flex-col lg:flex-row gap-4 items-center justify-center flex-1 min-h-0">
                  {/* Screen Cast Video Stage */}
                  <div
                    className={`transition-all duration-300 flex items-center justify-center w-full ${
                      isParticipantStripVisible && allParticipants.length > 1
                        ? 'lg:flex-1 h-[55vh] sm:h-[65vh] lg:h-[75vh]'
                        : 'w-full h-[65vh] sm:h-[75vh] lg:h-[80vh]'
                    }`}
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoTile participant={screenSharer} isSelf={screenSharer.isLocal} />
                    </div>
                  </div>

                  {/* Participant Side Strip (Hidable) */}
                  {isParticipantStripVisible && allParticipants.length > 1 && (
                    <div className="w-full lg:w-72 xl:w-80 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto max-h-[22vh] lg:max-h-[75vh] flex-shrink-0 p-1">
                      {allParticipants
                        .filter((p) => p.id !== screenSharer.id)
                        .map((p) => (
                          <div
                            key={p.id}
                            className="w-48 lg:w-full aspect-video flex-shrink-0"
                          >
                            <VideoTile participant={p} isSelf={p.isLocal} />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Standard mesh grid */
              <div className={`w-full grid gap-4 items-center justify-center mx-auto ${getGridClass()}`}>
                {allParticipants.map((p) => (
                  <div key={p.id} className="aspect-video w-full">
                    <VideoTile participant={p} isSelf={p.isLocal} />
                  </div>
                ))}
              </div>
            )}

            {/* Waiting for peers helper banner when alone in room */}
            {participants.length === 0 && connectionStatus === 'connected' && (
              <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-2xl bg-surface/80 border border-slate-800 text-xs text-slate-400 backdrop-blur-md shadow-lg">
                <Sparkles className="w-4 h-4 text-primary-400" />
                <span>You are the only one here. Share the link or room code with others to start talking!</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Bottom Control Bar */}
      <ControlBar
        roomId={roomId}
        isAudioMuted={isAudioMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        isChatOpen={isChatOpen}
        unreadChatCount={unreadChatCount}
        isParticipantsOpen={isParticipantsOpen}
        participantCount={allParticipants.length}
        onToggleAudio={onToggleAudio}
        onToggleVideo={onToggleVideo}
        onToggleScreenShare={onToggleScreenShare}
        onToggleChat={handleToggleChat}
        onToggleParticipants={handleToggleParticipants}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLeaveCall={onLeaveMeeting}
      />

      {/* In-Call P2P Chat Drawer */}
      <ChatPanel
        isOpen={isChatOpen}
        messages={chatMessages}
        currentUserId={localPeerId}
        onClose={() => setIsChatOpen(false)}
        onSendMessage={onSendMessage}
      />

      {/* In-Call P2P Participants Drawer */}
      <ParticipantsPanel
        isOpen={isParticipantsOpen}
        participants={allParticipants}
        currentUserId={localPeerId}
        roomId={roomId}
        onClose={() => setIsParticipantsOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        audioDevices={audioDevices}
        videoDevices={videoDevices}
        selectedAudioDeviceId={selectedAudioDeviceId}
        selectedVideoDeviceId={selectedVideoDeviceId}
        onSelectAudioDevice={onSelectAudioDevice}
        onSelectVideoDevice={onSelectVideoDevice}
      />
    </div>
  );
};
