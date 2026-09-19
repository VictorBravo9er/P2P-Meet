import { useState, useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../services/supabase';
import { PeerConnectionManager } from '../services/webrtc';
import { Participant, SignalMessage, ChatMessage } from '../types/meeting';
import { getStoredUserSettings, playNotificationChime } from '../services/settings';

interface UseMeetingRoomOptions {
  roomId: string;
  userName: string;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
}

export function useMeetingRoom({
  roomId,
  userName,
  localStream,
  localScreenStream,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
}: UseMeetingRoomOptions) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generate a persistent unique local peer ID for this session
  const localPeerIdRef = useRef<string>(
    `peer_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`
  );
  const localPeerId = localPeerIdRef.current;

  const channelRef = useRef<RealtimeChannel | null>(null);
  const rtcManagerRef = useRef<PeerConnectionManager | null>(null);

  // Send signaling message via Supabase Realtime broadcast
  const sendSignal = useCallback((signal: SignalMessage) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: signal,
      });
    }
  }, []);

  // Update remote stream in state (handles both camera and screen streams independently)
  const handleRemoteStream = useCallback(
    (peerId: string, stream: MediaStream, isScreen = false) => {
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.id === peerId) {
            if (isScreen) {
              return {
                ...p,
                screenStream: stream,
                isScreenSharing: stream.getTracks().length > 0,
              };
            }
            return { ...p, stream };
          }
          return p;
        })
      );
    },
    []
  );

  // Update connection state
  const handleConnectionStateChange = useCallback((peerId: string, state: RTCPeerConnectionState) => {
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.id === peerId) {
          return { ...p, connectionState: state };
        }
        return p;
      })
    );
  }, []);

  // Incoming chat message
  const handleChatMessage = useCallback(
    (message: ChatMessage) => {
      const userSettings = getStoredUserSettings();
      if (userSettings.chatSoundNotification && message.senderId !== localPeerId) {
        playNotificationChime();
      }

      setChatMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    },
    [localPeerId]
  );

  // Send a chat message (tries WebRTC DataChannel first, mirrors with broadcast)
  const sendChat = useCallback(
    (text: string) => {
      const msg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        senderId: localPeerId,
        senderName: userName,
        text,
        timestamp: Date.now(),
      };

      // Add to local chat list
      setChatMessages((prev) => [...prev, msg]);

      // 1. Send via WebRTC DataChannel (direct peer-to-peer)
      const dataChannelCount = rtcManagerRef.current?.sendChatMessage(msg) || 0;

      // 2. Also send via broadcast as a reliable fallback
      if (channelRef.current && dataChannelCount === 0) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'chat',
          payload: msg,
        });
      }
    },
    [localPeerId, userName]
  );

  // Initialize WebRTC and Supabase channel
  useEffect(() => {
    if (!roomId) return;

    const supabase = getSupabaseClient();
    if (!supabase) {
      setConnectionStatus('error');
      setErrorMessage('Supabase is not configured. Please enter your project URL and Anon key.');
      return;
    }

    setConnectionStatus('connecting');
    setErrorMessage(null);

    // 1. Initialize WebRTC Manager
    const rtcManager = new PeerConnectionManager(localPeerId, userName, {
      onRemoteStream: handleRemoteStream,
      onConnectionStateChange: handleConnectionStateChange,
      onChatMessage: handleChatMessage,
      sendSignal,
    });
    rtcManagerRef.current = rtcManager;

    // Attach initial streams
    if (localStream) {
      rtcManager.setLocalStream(localStream);
    }
    if (localScreenStream) {
      rtcManager.setLocalScreenStream(localScreenStream);
    }

    // 2. Initialize Supabase Realtime Channel
    const channelName = `meeting-room:${roomId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: localPeerId },
        broadcast: { self: false },
      },
    });
    channelRef.current = channel;

    // Handle incoming WebRTC signals
    channel.on('broadcast', { event: 'signal' }, ({ payload }: { payload: SignalMessage }) => {
      if (payload.targetPeerId && payload.targetPeerId !== localPeerId) {
        return; // Signal intended for someone else
      }

      if (payload.type === 'state-sync' && payload.state) {
        // Participant state update (mute/unmute, video on/off, screen share)
        setParticipants((prev) =>
          prev.map((p) => {
            if (p.id === payload.fromPeerId) {
              const updated = { ...p, ...payload.state };
              if (payload.state?.isScreenSharing === false) {
                updated.screenStream = undefined;
              }
              return updated;
            }
            return p;
          })
        );
        return;
      }

      rtcManager.handleSignal(payload);
    });

    // Handle fallback broadcast chat
    channel.on('broadcast', { event: 'chat' }, ({ payload }: { payload: ChatMessage }) => {
      if (payload.senderId !== localPeerId) {
        handleChatMessage(payload);
      }
    });

    // Handle Presence state changes (Peer Discovery)
    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();

      const activePeers: Participant[] = [];
      for (const [id, presences] of Object.entries(presenceState)) {
        if (id === localPeerId) continue;

        const info = (presences[0] as unknown as {
          name: string;
          isAudioMuted?: boolean;
          isVideoOff?: boolean;
          isScreenSharing?: boolean;
        }) || { name: 'Guest' };

        activePeers.push({
          id,
          name: info.name || 'Participant',
          isAudioMuted: info.isAudioMuted ?? false,
          isVideoOff: info.isVideoOff ?? false,
          isScreenSharing: info.isScreenSharing ?? false,
          isLocal: false,
        });

        // Trigger WebRTC connection
        rtcManager.getOrCreatePeerConnection(id);
      }

      setParticipants((prev) => {
        // Retain existing streams and active mute/video states if peer was already connected
        return activePeers.map((newP) => {
          const existing = prev.find((p) => p.id === newP.id);
          return existing
            ? {
                ...newP,
                isAudioMuted: existing.isAudioMuted,
                isVideoOff: existing.isVideoOff,
                isScreenSharing: existing.isScreenSharing,
                stream: existing.stream,
                screenStream: existing.screenStream,
                connectionState: existing.connectionState,
              }
            : newP;
        });
      });
    });

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (key === localPeerId) return;

      const info = (newPresences[0] as unknown as {
        name: string;
        isAudioMuted?: boolean;
        isVideoOff?: boolean;
        isScreenSharing?: boolean;
      }) || { name: 'Guest' };

      setParticipants((prev) => {
        const existing = prev.find((p) => p.id === key);
        if (existing) return prev;
        return [
          ...prev,
          {
            id: key,
            name: info.name || 'Participant',
            isAudioMuted: info.isAudioMuted ?? false,
            isVideoOff: info.isVideoOff ?? false,
            isScreenSharing: info.isScreenSharing ?? false,
            isLocal: false,
          },
        ];
      });

      // Initiate WebRTC peer connection
      rtcManager.getOrCreatePeerConnection(key);

      // Announce our current state to the newly joined peer
      sendSignal({
        type: 'state-sync',
        fromPeerId: localPeerId,
        fromName: userName,
        targetPeerId: key,
        state: { isAudioMuted, isVideoOff, isScreenSharing },
      });
    });

    channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (key === localPeerId) return;

      // Only remove if this peer is actually gone from presence state
      const presenceState = channel.presenceState();
      const stillPresent = presenceState[key] && presenceState[key].length > 0;
      if (stillPresent) {
        return;
      }

      rtcManager.removePeer(key);
      setParticipants((prev) => prev.filter((p) => p.id !== key));
    });

    // Subscribe to channel and track presence
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setConnectionStatus('connected');
        await channel.track({
          name: userName,
          isAudioMuted,
          isVideoOff,
          isScreenSharing,
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setConnectionStatus('error');
        setErrorMessage('Failed to connect to signaling room.');
      }
    });

    return () => {
      channel.unsubscribe();
      rtcManager.destroy();
      channelRef.current = null;
      rtcManagerRef.current = null;
    };
  }, [roomId, localPeerId, userName]);

  // Keep WebRTC manager synced with updated local media stream (microphone + camera)
  useEffect(() => {
    if (rtcManagerRef.current) {
      rtcManagerRef.current.setLocalStream(localStream);
    }
  }, [localStream]);

  // Keep WebRTC manager synced with updated screen capture stream
  useEffect(() => {
    if (rtcManagerRef.current) {
      rtcManagerRef.current.setLocalScreenStream(localScreenStream);
    }
  }, [localScreenStream]);

  // Sync state changes (mute, video, screen share) to peers via lightweight broadcast
  useEffect(() => {
    if (channelRef.current && connectionStatus === 'connected') {
      sendSignal({
        type: 'state-sync',
        fromPeerId: localPeerId,
        fromName: userName,
        state: { isAudioMuted, isVideoOff, isScreenSharing },
      });
    }
  }, [isAudioMuted, isVideoOff, isScreenSharing, userName, connectionStatus, localPeerId, sendSignal]);

  return {
    localPeerId,
    participants,
    chatMessages,
    connectionStatus,
    errorMessage,
    sendChat,
  };
}
