import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings,
  X,
  Mic,
  Video,
  ShieldCheck,
  Volume2,
  Bell,
  Sparkles,
  RotateCcw,
  Play,
  Sliders,
  Eye,
  Wifi,
  CheckCircle2,
} from 'lucide-react';
import {
  UserSettings,
  getStoredUserSettings,
  saveStoredUserSettings,
  playNotificationChime,
  DEFAULT_SETTINGS,
} from '../services/settings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  onSelectAudioDevice: (deviceId: string) => void;
  onSelectVideoDevice: (deviceId: string) => void;
  onSettingsChange?: (settings: UserSettings) => void;
}

type SettingsTab = 'audio' | 'video' | 'general' | 'diagnostics';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  audioDevices,
  videoDevices,
  selectedAudioDeviceId,
  selectedVideoDeviceId,
  onSelectAudioDevice,
  onSelectVideoDevice,
  onSettingsChange,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio');
  const [settings, setSettings] = useState<UserSettings>(getStoredUserSettings);
  const [micTestLevel, setMicTestLevel] = useState<number>(0);
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [savedBadge, setSavedBadge] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSettings(getStoredUserSettings());
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
      stopMicTest();
    }
  }, [isOpen]);

  // Clean up mic test on unmount or tab change
  const stopMicTest = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    setMicTestLevel(0);
    setIsTestingMic(false);
  }, []);

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, [stopMicTest]);

  // Live microphone level tester
  const startMicTest = async () => {
    try {
      stopMicTest();
      setIsTestingMic(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedAudioDeviceId
          ? { deviceId: selectedAudioDeviceId }
          : true,
      });
      micStreamRef.current = stream;

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Normalize roughly between 0 and 100
        const normalized = Math.min(100, Math.round((avg / 128) * 100 * 1.5));
        setMicTestLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (err) {
      console.warn('Failed to start microphone test:', err);
      stopMicTest();
    }
  };

  const handleToggleMicTest = () => {
    if (isTestingMic) {
      stopMicTest();
    } else {
      startMicTest();
    }
  };

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    saveStoredUserSettings(nextSettings);
    onSettingsChange?.(nextSettings);

    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 1500);
  };

  const handleResetDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    saveStoredUserSettings(DEFAULT_SETTINGS);
    onSettingsChange?.(DEFAULT_SETTINGS);

    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 1500);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-black/80 backdrop:backdrop-blur-sm bg-transparent p-0 rounded-2xl max-w-2xl w-full outline-none shadow-2xl border border-slate-700/80"
    >
      <div className="bg-surface p-6 text-slate-100 rounded-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary-500/15 text-primary-400 border border-primary-500/20">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Meeting Settings</h2>
              <p className="text-xs text-slate-400">Audio, video, and user preferences</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedBadge && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 pt-4 pb-2 border-b border-slate-800/80 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('audio')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition ${
              activeTab === 'audio'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Audio & Voice</span>
          </button>

          <button
            onClick={() => setActiveTab('video')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition ${
              activeTab === 'video'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Video & Camera</span>
          </button>

          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition ${
              activeTab === 'general'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Preferences</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition ${
              activeTab === 'diagnostics'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Security & P2P</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="py-4 space-y-5 overflow-y-auto flex-1 pr-1">
          {/* TAB 1: AUDIO & VOICE */}
          {activeTab === 'audio' && (
            <div className="space-y-5">
              {/* Microphone Hardware Selection */}
              <div>
                <label className="text-xs text-slate-300 font-medium flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-primary-400" />
                    Microphone Input
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {audioDevices.length} available
                  </span>
                </label>
                <select
                  value={selectedAudioDeviceId}
                  onChange={(e) => onSelectAudioDevice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                >
                  {audioDevices.length === 0 ? (
                    <option value="">Default System Microphone</option>
                  ) : (
                    audioDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone (${device.deviceId.slice(0, 5)}...)`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Mic Test & Input Meter */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <span>Microphone Test</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleMicTest}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      isTestingMic
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-primary-600 hover:bg-primary-500 text-white'
                    }`}
                  >
                    {isTestingMic ? 'Stop Test' : 'Test Mic'}
                  </button>
                </div>

                {/* Level Meter Bar */}
                <div className="space-y-1">
                  <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-primary-400 transition-all duration-75 rounded-full"
                      style={{ width: `${isTestingMic ? micTestLevel : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{isTestingMic ? 'Speak to test level' : 'Click "Test Mic" to check volume'}</span>
                    {isTestingMic && <span>{micTestLevel}%</span>}
                  </div>
                </div>
              </div>

              {/* Audio Processing Toggles */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-primary-400" />
                  Audio Processing Filters
                </h4>

                {/* Noise Suppression */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">Noise Suppression</div>
                    <div className="text-[11px] text-slate-400">
                      Reduces background fan, keyboard, and ambient noise
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting('noiseSuppression', !settings.noiseSuppression)}
                    className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                      settings.noiseSuppression ? 'bg-primary-600' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${
                        settings.noiseSuppression ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Echo Cancellation */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">Acoustic Echo Cancellation</div>
                    <div className="text-[11px] text-slate-400">
                      Eliminates speaker echo feedback into the microphone
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting('echoCancellation', !settings.echoCancellation)}
                    className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                      settings.echoCancellation ? 'bg-primary-600' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${
                        settings.echoCancellation ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Auto Gain Control */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">Auto Gain Control</div>
                    <div className="text-[11px] text-slate-400">
                      Automatically balances quiet and loud voice levels
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting('autoGainControl', !settings.autoGainControl)}
                    className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                      settings.autoGainControl ? 'bg-primary-600' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${
                        settings.autoGainControl ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VIDEO & CAMERA */}
          {activeTab === 'video' && (
            <div className="space-y-5">
              {/* Camera Selection */}
              <div>
                <label className="text-xs text-slate-300 font-medium flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-primary-400" />
                    Camera Device
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {videoDevices.length} available
                  </span>
                </label>
                <select
                  value={selectedVideoDeviceId}
                  onChange={(e) => onSelectVideoDevice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                >
                  {videoDevices.length === 0 ? (
                    <option value="">Default System Camera</option>
                  ) : (
                    videoDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera (${device.deviceId.slice(0, 5)}...)`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Video Resolution Option */}
              <div className="space-y-2">
                <label className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-primary-400" />
                  Target Camera Resolution
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: '480p', label: '480p SD', desc: 'Bandwidth Saver' },
                    { id: '720p', label: '720p HD', desc: 'Recommended' },
                    { id: '1080p', label: '1080p Full HD', desc: 'High Definition' },
                  ].map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => updateSetting('videoResolution', res.id as '480p' | '720p' | '1080p')}
                      className={`p-3 rounded-xl border text-left flex flex-col transition ${
                        settings.videoResolution === res.id
                          ? 'bg-primary-600/20 border-primary-500 text-primary-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-semibold text-slate-200">{res.label}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">{res.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mirror Video Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Mirror Self Preview</div>
                  <div className="text-[11px] text-slate-400">
                    Flipping your camera preview horizontally like looking into a mirror
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('mirrorSelfVideo', !settings.mirrorSelfVideo)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                    settings.mirrorSelfVideo ? 'bg-primary-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${
                      settings.mirrorSelfVideo ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Bandwidth Saver Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Data & Bandwidth Saver</div>
                  <div className="text-[11px] text-slate-400">
                    Prioritizes speech audio and adapts video bitrates on weaker connections
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('bandwidthSaver', !settings.bandwidthSaver)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                    settings.bandwidthSaver ? 'bg-primary-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${
                      settings.bandwidthSaver ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: MEETING PREFERENCES */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Chat Notification Sound */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-primary-400" />
                    Incoming Chat Sound
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Plays a gentle chime when a peer sends a chat message
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={playNotificationChime}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1 transition"
                    title="Test chime"
                  >
                    <Play className="w-3 h-3 text-emerald-400" />
                    <span className="text-[11px]">Test</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('chatSoundNotification', !settings.chatSoundNotification)}
                    className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                      settings.chatSoundNotification ? 'bg-primary-600' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${
                        settings.chatSoundNotification ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Speaking Indicator Glow */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Active Speaker Visual Glow
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Highlights the video tile with a green border when someone is talking
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('speakingIndicator', !settings.speakingIndicator)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                    settings.speakingIndicator ? 'bg-primary-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${
                      settings.speakingIndicator ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Reset to Defaults button */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-xs text-slate-500">Restore default audio & video configurations</span>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Defaults
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: SECURITY & DIAGNOSTICS */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/50 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-emerald-300">
                    End-to-End Direct P2P Encryption
                  </h4>
                  <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                    Media streams flow directly between peer browsers over encrypted WebRTC channels (DTLS-SRTP). No media server records, stores, or processes your audio or video data.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Wifi className="w-3.5 h-3.5 text-primary-400" />
                    <span>Media Channel</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200">Direct WebRTC Mesh</div>
                  <div className="text-[10px] text-slate-500">Zero Middleman Server</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Encryption</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200">DTLS 1.2 / SRTP</div>
                  <div className="text-[10px] text-slate-500">256-bit AES P2P</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <span>NAT Traversal</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200">Google Public STUN</div>
                  <div className="text-[10px] text-slate-500">stun.l.google.com:19302</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Data Channel</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200">SCTP P2P Data</div>
                  <div className="text-[10px] text-slate-500">Encrypted Chat & Signaling</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Settings auto-save to your browser profile
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
};
