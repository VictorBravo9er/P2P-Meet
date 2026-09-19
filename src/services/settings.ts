export interface UserSettings {
  // Audio processing preferences
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;

  // Video preferences
  mirrorSelfVideo: boolean;
  videoResolution: '480p' | '720p' | '1080p';

  // Meeting & Notification preferences
  chatSoundNotification: boolean;
  speakingIndicator: boolean;
  bandwidthSaver: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  mirrorSelfVideo: true,
  videoResolution: '720p',
  chatSoundNotification: true,
  speakingIndicator: true,
  bandwidthSaver: false,
};

const SETTINGS_STORAGE_KEY = 'p2p_meeting_user_settings';

export function getStoredUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to read user settings from storage:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveStoredUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('p2p_settings_changed', { detail: settings }));
  } catch (e) {
    console.error('Failed to save user settings:', e);
  }
}

/**
 * Generates a pleasant two-tone audio chime using native Web Audio API.
 * Requires zero external audio assets.
 */
export function playNotificationChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // First tone (D5 - 587Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.1, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // Second tone (A5 - 880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.09);
    gain2.gain.setValueAtTime(0.12, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.2);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.35);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 450);
  } catch {
    // Non-critical audio chime error
  }
}
