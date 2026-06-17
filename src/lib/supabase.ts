import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const getProjectRef = (url?: string) => {
  try {
    const host = new URL(url || '').hostname;
    return host.endsWith('.supabase.co') ?host.split('.')[0] : 'local';
  } catch {
    return 'local';
  }
};

const projectRef = getProjectRef(supabaseUrl);
export const supabaseAuthStorageKey = `sb-${projectRef}-auth-token`;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Check your .env file.');
}

export const clearSupabaseAuthStorage = () => {
  if (typeof window === 'undefined') return;

  const keysToRemove = new Set<string>([supabaseAuthStorageKey]);
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
      keysToRemove.add(key);
    }
  }

  keysToRemove.forEach(key => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  });
};

export const checkSupabaseReachability = async (timeoutMs = 5000) => {
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    throw new Error('VITE_SUPABASE_URL não está configurada.');
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      cache: 'no-store',
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storageKey: supabaseAuthStorageKey,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: true
    }
  }
);
