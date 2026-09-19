export interface Participant {
  id: string;
  name: string;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isLocal: boolean;
  stream?: MediaStream;
  screenStream?: MediaStream;
  connectionState?: RTCPeerConnectionState;
  isSpeaking?: boolean;
}

export type SignalType = 'offer' | 'answer' | 'candidate' | 'state-sync' | 'chat';

export interface SignalMessage {
  type: SignalType;
  fromPeerId: string;
  fromName: string;
  targetPeerId?: string; // If omitted, broadcast to all
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  state?: {
    isAudioMuted: boolean;
    isVideoOff: boolean;
    isScreenSharing: boolean;
  };
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}
