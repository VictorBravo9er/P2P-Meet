import { useState, useEffect, useCallback } from 'react';
import { useMediaStream } from './hooks/useMediaStream';
import { useMeetingRoom } from './hooks/useMeetingRoom';
import { Lobby } from './components/Lobby';
import { MeetingRoom } from './components/MeetingRoom';
import { SettingsModal } from './components/SettingsModal';

export function App() {
  const [roomId, setRoomId] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryRoom = params.get('room');
      if (queryRoom) return queryRoom;

      // Also support hash #room=xyz
      const hash = window.location.hash.replace(/^#\/?/, '');
      const hashParams = new URLSearchParams(hash);
      return hashParams.get('room') || '';
    } catch {
      return '';
    }
  });
  const [userName, setUserName] = useState<string>('');
  const [inMeeting, setInMeeting] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Media streams hook
  const {
    localStream,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isSpeaking,
    audioInputDevices,
    videoInputDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    setSelectedAudioDeviceId,
    setSelectedVideoDeviceId,
    startMedia,
  } = useMediaStream();

  // Start media stream on initial load for the preview lobby
  useEffect(() => {
    startMedia();
  }, [startMedia]);

  // WebRTC and Supabase Room coordination
  const {
    localPeerId,
    participants,
    chatMessages,
    connectionStatus,
    errorMessage,
    sendChat,
  } = useMeetingRoom({
    roomId: inMeeting ? roomId : '',
    userName,
    localStream,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
  });

  const handleJoinMeeting = useCallback(
    (joinedRoomId: string, joinedUserName: string) => {
      setRoomId(joinedRoomId);
      setUserName(joinedUserName);
      setInMeeting(true);

      // Update URL query param so user can copy/share the current link
      const newUrl = `${window.location.pathname}?room=${encodeURIComponent(joinedRoomId)}`;
      window.history.pushState({ path: newUrl }, '', newUrl);
    },
    []
  );

  const handleLeaveMeeting = useCallback(() => {
    setInMeeting(false);

    // Remove room param from URL
    window.history.pushState({}, '', window.location.pathname);
  }, []);

  return (
    <div className="min-h-screen bg-background text-slate-100">
      {!inMeeting ? (
        <>
          <Lobby
            localStream={localStream}
            isAudioMuted={isAudioMuted}
            isVideoOff={isVideoOff}
            isSpeaking={isSpeaking}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onJoinMeeting={handleJoinMeeting}
            onOpenSettings={() => setIsSettingsOpen(true)}
            initialRoomId={roomId}
          />
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            audioDevices={audioInputDevices}
            videoDevices={videoInputDevices}
            selectedAudioDeviceId={selectedAudioDeviceId}
            selectedVideoDeviceId={selectedVideoDeviceId}
            onSelectAudioDevice={setSelectedAudioDeviceId}
            onSelectVideoDevice={setSelectedVideoDeviceId}
          />
        </>
      ) : (
        <MeetingRoom
          roomId={roomId}
          userName={userName}
          localPeerId={localPeerId}
          localStream={localStream}
          isAudioMuted={isAudioMuted}
          isVideoOff={isVideoOff}
          isScreenSharing={isScreenSharing}
          isSpeaking={isSpeaking}
          participants={participants}
          chatMessages={chatMessages}
          connectionStatus={connectionStatus}
          errorMessage={errorMessage}
          audioDevices={audioInputDevices}
          videoDevices={videoInputDevices}
          selectedAudioDeviceId={selectedAudioDeviceId}
          selectedVideoDeviceId={selectedVideoDeviceId}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onSelectAudioDevice={setSelectedAudioDeviceId}
          onSelectVideoDevice={setSelectedVideoDeviceId}
          onSendMessage={sendChat}
          onLeaveMeeting={handleLeaveMeeting}
        />
      )}
    </div>
  );
}

export default App;
