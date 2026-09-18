import React, { useState, useEffect, useRef } from 'react';
import { Settings, X, KeyRound, Mic, Video, CheckCircle2 } from 'lucide-react';
import { getStoredSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from '../services/supabase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  onSelectAudioDevice: (deviceId: string) => void;
  onSelectVideoDevice: (deviceId: string) => void;
  onConfigSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  audioDevices,
  videoDevices,
  selectedAudioDeviceId,
  selectedVideoDeviceId,
  onSelectAudioDevice,
  onSelectVideoDevice,
  onConfigSaved,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    const config = getStoredSupabaseConfig();
    if (config) {
      setSupabaseUrl(config.url);
      setSupabaseAnonKey(config.anonKey);
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
    }
  }, [isOpen]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) return;

    saveSupabaseConfig({
      url: supabaseUrl.trim(),
      anonKey: supabaseAnonKey.trim(),
    });

    setSavedMessage(true);
    setTimeout(() => {
      setSavedMessage(false);
      onConfigSaved?.();
      onClose();
    }, 1200);
  };

  const handleClear = () => {
    clearSupabaseConfig();
    setSupabaseUrl('');
    setSupabaseAnonKey('');
    onConfigSaved?.();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-black/75 backdrop:backdrop-blur-sm bg-transparent p-0 rounded-2xl max-w-lg w-full outline-none shadow-2xl border border-slate-700/80"
    >
      <div className="bg-surface p-6 text-slate-100 rounded-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary-500/10 text-primary-400">
              <Settings className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold">Settings & Devices</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-6">
          {/* Device Selection */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Hardware Devices
            </h3>

            {/* Microphone */}
            <div>
              <label className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mb-1.5">
                <Mic className="w-4 h-4 text-primary-400" />
                Microphone
              </label>
              <select
                value={selectedAudioDeviceId}
                onChange={(e) => onSelectAudioDevice(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
              >
                {audioDevices.length === 0 ? (
                  <option value="">Default Microphone</option>
                ) : (
                  audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone (${device.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Camera */}
            <div>
              <label className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mb-1.5">
                <Video className="w-4 h-4 text-primary-400" />
                Camera
              </label>
              <select
                value={selectedVideoDeviceId}
                onChange={(e) => onSelectVideoDevice(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
              >
                {videoDevices.length === 0 ? (
                  <option value="">Default Camera</option>
                ) : (
                  videoDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera (${device.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Supabase Signaling Configuration */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-primary-400" />
                Supabase Realtime Signaling
              </h3>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-rose-400 hover:underline"
              >
                Reset
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Only used to exchange connection handshakes and track who is in the room. Zero video or
              audio data passes through Supabase.
            </p>

            <form onSubmit={handleSaveConfig} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Project URL</label>
                <input
                  type="url"
                  autoComplete="off"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Anon Public Key</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="eyJhbGciOi..."
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {savedMessage ? (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Config saved successfully!
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition"
                >
                  Save Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </dialog>
  );
};
