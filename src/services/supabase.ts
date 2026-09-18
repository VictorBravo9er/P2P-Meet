import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConfig } from '../types/meeting';

const STORAGE_KEY = 'p2p_meeting_supabase_config';

export function getStoredSupabaseConfig(): SupabaseConfig | null {
  // Check env first
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envAnonKey && !envUrl.includes('your-project-id')) {
    return {
      url: envUrl,
      anonKey: envAnonKey,
    };
  }

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.url && parsed.anonKey) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read Supabase config from localStorage', err);
  }

  return null;
}

export function saveSupabaseConfig(config: SupabaseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

let cachedClient: { client: SupabaseClient; config: SupabaseConfig } | null = null;

export function getSupabaseClient(overrideConfig?: SupabaseConfig): SupabaseClient | null {
  const config = overrideConfig || getStoredSupabaseConfig();
  if (!config || !config.url || !config.anonKey) {
    return null;
  }

  if (
    cachedClient &&
    cachedClient.config.url === config.url &&
    cachedClient.config.anonKey === config.anonKey
  ) {
    return cachedClient.client;
  }

  try {
    const client = createClient(config.url, config.anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    });

    cachedClient = { client, config };
    return client;
  } catch (err) {
    console.error('Error creating Supabase client:', err);
    return null;
  }
}
