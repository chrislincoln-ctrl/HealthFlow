import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2, LogIn, Moon, ShieldCheck, Sun, UserPlus } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';
import { EcgMark } from '../components/EcgMark';

/**
 * Official multi-color Google "G" (brand guidelines permit unmodified use).
 */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

/**
 * Resource-flow vignette — the HealthFlow network illustration (isometric
 * facilities, corridors, courier) anchored to the district cluster. The source
 * PNG is a tall poster whose bottom third is baked-in text; the SVG viewBox
 * crops to the illustration region only — the real tagline is live DOM below.
 */
import loginNetwork from '../assets/login-network.png';

function NetworkVignette() {
  return (
    <svg viewBox="0 0 100 90" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <image href={loginNetwork} x="-5" y="-5" width="110" height="99.1" preserveAspectRatio="xMidYMid slice" />
    </svg>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const {
    user,
    loading,
    supabaseConfigured,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    signInAsDemo,
  } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/command-center';

  // form state
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'form' | 'google' | null>(null);

  if (user) {
    return <Navigate to={redirect} replace />;
  }

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  function validate(): string | null {
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy('form');
    try {
      if (mode === 'signin') {
        await signInWithPassword(email.trim(), password);
        navigate(redirect, { replace: true });
      } else {
        const { needsConfirmation } = await signUpWithPassword(email.trim(), password);
        if (needsConfirmation) {
          setNotice('Account created — check your inbox for the confirmation link, then sign in.');
          setMode('signin');
        } else {
          navigate(redirect, { replace: true });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setBusy(null);
    }
  }

  async function onGoogle() {
    resetMessages();
    setBusy('google');
    try {
      await signInWithGoogle();
      // Browser navigates to Google and back; nothing to do on success.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setBusy(null);
    }
  }

  function onDemo() {
    signInAsDemo();
    navigate(redirect, { replace: true });
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-canvas lg:grid-cols-[1.1fr_1fr]">
      {/* LEFT — brand story */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-chrome p-10 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <NetworkVignette />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-accent">
              <EcgMark className="h-4.5 w-4.5" />
            </span>
            <span className="text-sm font-bold uppercase tracking-[0.3em]">HealthFlow</span>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
            Predict shortages.
            <br />
            <span className="text-[#B983FF]">Move resources.</span>
            <br />
            <span className="text-peach">Protect care.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-chrome-50/80">
            Statistical forecasting and resource reallocation intelligence for resilient healthcare networks.
          </p>
          <p className="mt-6 flex items-center gap-1.5 text-[11px] font-medium text-chrome-50/60">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Simulated network · demo data · decision-support prototype
          </p>
        </div>
        <p className="relative z-10 text-[10px] text-chrome-50/50">
          Predict shortages. Move resources. Protect care.
        </p>
      </div>

      {/* RIGHT — auth card */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-accent">
                <EcgMark className="h-4 w-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-ink">HealthFlow</span>
            </div>
            <button
              onClick={toggle}
              className="ml-auto rounded p-1.5 text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>

          <div className="rounded-lg border border-line bg-surface p-6 shadow-panel sm:p-8">
            <h2 className="text-lg font-extrabold tracking-tight text-ink">Welcome to HealthFlow</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {mode === 'signin'
                ? 'Sign in to access the health network command center.'
                : 'Create an account to access the health network command center.'}
            </p>

            {!supabaseConfigured && (
              <p className="mt-4 rounded bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
                Email sign-in isn't configured in this environment. Set{' '}
                <code className="font-mono text-[10px] text-ink">VITE_SUPABASE_URL</code> and{' '}
                <code className="font-mono text-[10px] text-ink">VITE_SUPABASE_PUBLISHABLE_KEY</code> to enable
                it — the app still works with demo access below.
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded border border-status-critical/30 bg-status-critical/10 px-3 py-2 text-[12px] font-medium leading-relaxed text-status-critical"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
            {notice && (
              <p
                role="status"
                className="mt-4 rounded border border-status-stable/30 bg-status-stable/10 px-3 py-2 text-[12px] font-medium leading-relaxed text-status-stable"
              >
                {notice}
              </p>
            )}

            {supabaseConfigured && (
              <>
                {/* Google OAuth through Supabase */}
                <button
                  onClick={onGoogle}
                  disabled={busy !== null || loading}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2.5 rounded border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:opacity-60"
                >
                  {busy === 'google' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {busy === 'google' ? 'Redirecting to Google…' : 'Continue with Google'}
                </button>

                <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>

                {/* Email + password */}
                <form onSubmit={onSubmit} noValidate>
                  <label htmlFor="hf-email" className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Email
                  </label>
                  <input
                    id="hf-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1 w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
                  />

                  <label htmlFor="hf-password" className="mt-3 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Password
                  </label>
                  <input
                    id="hf-password"
                    type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signin' ? 'Your password' : 'At least 6 characters'}
                    className="mt-1 w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
                  />

                  <button
                    type="submit"
                    disabled={busy !== null || loading}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-chrome px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chrome-light focus:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:opacity-60"
                  >
                    {busy === 'form' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : mode === 'signin' ? (
                      <LogIn className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                    )}
                    {busy === 'form' ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                </form>

                <p className="mt-3 text-center text-xs text-muted">
                  {mode === 'signin' ? (
                    <>
                      New here?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          resetMessages();
                          setMode('signup');
                        }}
                        className="font-semibold text-ai hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
                      >
                        Create an account
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          resetMessages();
                          setMode('signin');
                        }}
                        className="font-semibold text-ai hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </>
            )}

            <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <button
              onClick={onDemo}
              className="inline-flex w-full items-center justify-center gap-2 rounded border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
            >
              Continue as Demo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="mt-2 text-center text-[10px] text-muted">
              Demo access opens the simulated environment — no account required.
            </p>

            <p className="mt-6 border-t border-line-soft pt-4 text-[10px] leading-relaxed text-muted">
              Authentication stores only your email and display name to gate the demo workspace — never
              personal, medical, or identity data. HealthFlow is a decision-support prototype and does not
              replace clinical judgment or official health authority systems.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
