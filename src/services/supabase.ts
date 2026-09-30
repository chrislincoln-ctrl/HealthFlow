/**
 * Supabase client — the single place the app talks to Supabase Auth.
 *
 * The URL + anon key are PUBLIC by design (row-level security protects the
 * data, not the key). Absent variables mean Supabase auth is simply not
 * configured: `supabaseConfigured` stays false and the Login page keeps the
 * demo path — the hackathon demo never breaks on a missing key.
 *
 * NEVER put the service_role key in this file or any client module.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Supabase exposes the public key as either the classic JWT anon key or the
// newer sb_publishable_... format — both are safe to bundle and both work
// anywhere the anon key does. Either variable name is accepted.
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

/** True only when BOTH variables are present and non-empty. */
export const supabaseConfigured = Boolean(url && anonKey);

/**
 * Lazy singleton. Returns null while unconfigured so call sites can branch
 * cleanly; all auth flows in AuthContext check `supabaseConfigured` first.
 */
let client: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!supabaseConfigured) return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        // Session persists in localStorage under this key; tokens refresh
        // automatically. detectSessionInUrl handles the OAuth redirect
        // (?code=... / #access_token=...) and the magic-link return trip.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Human-readable message for common Supabase auth failures. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox.';
  if (m.includes('user already registered')) return 'That email already has an account — try signing in.';
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters.';
  if (m.includes('rate limit')) return 'Too many attempts — wait a moment and try again.';
  if (m.includes('failed to fetch') || m.includes('networkerror')) return 'Cannot reach the auth service — check your connection.';
  return message;
}
