import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { authErrorMessage, getSupabase, supabaseConfigured } from '../services/supabase';
import { clearBrief } from './briefStore';

/**
 * HealthFlow auth.
 *
 * REAL authentication via Supabase Auth (email + password and Google OAuth),
 * enabled when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are configured at
 * build time. The URL and anon key are public by design; NO service_role key
 * or other secret ever lives in client code. Session persistence, refresh and
 * the OAuth redirect handshake are owned by supabase-js.
 *
 * When credentials are NOT configured, the auth page offers an explicitly
 * labeled "Continue as Demo" session so the hackathon demo never breaks.
 * Demo access is clearly distinguished from real authentication in the UI —
 * it never pretends to be a Google account.
 */

export interface AuthUser {
  name: string;
  email?: string;
  picture?: string;
  provider: 'google' | 'email' | 'demo';
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  /** True when Supabase env vars are present (email + Google available). */
  supabaseConfigured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signInAsDemo: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Map a Supabase user to the app's display user. */
function userOf(u: User | null): AuthUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const provider = (u.app_metadata?.provider as string | undefined) ?? 'email';
  return {
    name:
      (meta.full_name as string | undefined) ||
      (meta.name as string | undefined) ||
      (u.email ?? 'User').split('@')[0],
    email: u.email,
    picture: meta.avatar_url as string | undefined,
    provider: provider === 'google' ? 'google' : 'email',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase: SupabaseClient | null = supabaseConfigured ? getSupabase() : null;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  // Initial session + auth state changes (sign-in from the OAuth redirect,
  // token refreshes, sign-outs in other tabs). No-op when unconfigured.
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setUser(userOf(data.session?.user ?? null));
      })
      .catch(() => {
        // Network unreachable: stay signed out; flows surface errors when used.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!mounted) return;
      setUser(userOf(session?.user ?? null));
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) throw new Error('Supabase auth is not configured in this environment.');
      setLoading(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(authErrorMessage(error.message));
        // State updates arrive via onAuthStateChange.
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) throw new Error('Supabase auth is not configured in this environment.');
      setLoading(true);
      try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw new Error(authErrorMessage(error.message));
        // If email confirmation is ON, no session comes back — tell the user.
        return { needsConfirmation: !data.session };
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Supabase auth is not configured in this environment.');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login`,
          // Keep the prompt selective so re-auth is one click for repeat users.
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw new Error(authErrorMessage(error.message));
      // Browser navigates to Google and back; session lands via detectSessionInUrl.
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const signInAsDemo = useCallback(() => {
    setUser({ name: 'Demo User', provider: 'demo' });
  }, []);

  const signOut = useCallback(async () => {
    // The saved Policy Brief is a per-session artifact: clear it while the
    // signing-out user is still known, so the next session starts clean.
    clearBrief(user?.provider === 'demo' ? 'demo' : user?.email ?? 'anon');
    // Demo users have no Supabase session — clear immediately.
    if (!supabase) {
      setUser(null);
      return;
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // Network hiccup: still clear the local user so the UI resets.
      setUser(null);
    }
    setUser(null);
  }, [supabase, user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      supabaseConfigured,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signInAsDemo,
      signOut,
    }),
    // sessionError intentionally excluded from the context surface — the
    // Login page renders it via the same `loading`/`user` flow; keeping the
    // seam identical to the previous contract minimizes churn.
    [user, loading, signInWithPassword, signUpWithPassword, signInWithGoogle, signInAsDemo, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
