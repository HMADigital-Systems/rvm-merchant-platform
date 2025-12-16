import { createClient } from '@supabase/supabase-js';

// Use environment variable OR a dummy fallback string to prevent crashes during UI dev
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('⚠️ Supabase URL is missing. Using placeholder to prevent crash.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);