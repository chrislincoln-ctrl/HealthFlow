# Supabase Auth — Setup & Verification Guide

HealthFlow's login is wired to Supabase Auth (email + password and Google OAuth),
with the demo path kept as a fallback. This file is the dashboard checklist and
the record of what was verified.

## What's wired in the app

| Piece | File | Notes |
|---|---|---|
| Supabase client singleton | `src/services/supabase.ts` | Configured-safe; friendly error mapping |
| Auth state + flows | `src/state/AuthContext.tsx` | Same `useAuth` seam as before |
| Login UI | `src/pages/Login.tsx` | Email form + Google + Demo |
| Env typing | `src/vite-env.d.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`/`VITE_SUPABASE_PUBLISHABLE_KEY` |
| Secrets | `.env.local` (gitignored) | URL + publishable key already set |

The publishable/anon key and project URL are **public by design** — they are
safe to bundle. Never put the `service_role` key in any client file.

## One-time dashboard checklist (you)

1. **Redirect URLs** — Supabase dashboard → *Authentication → URL Configuration*:
   - Add `http://localhost:5173/login` (Site URL can stay `http://localhost:5173`).
   - Add your production origin + `/login` when you deploy.
   Without this, Google OAuth returns `redirect_not_allowed`.
2. **Google provider** — *Authentication → Providers → Google*:
   - Create an OAuth client at https://console.cloud.google.com/apis/credentials
     (type: Web application).
   - Authorized redirect URI: `https://wmdiklwpxbcilvysgrhl.supabase.co/auth/v1/callback`
   - Paste the client ID + secret into the Supabase Google provider settings → Enable.
   The in-app button already works the moment this is on — no code change needed.
3. **Email confirmation** — *Authentication → Providers → Email*:
   - "Confirm email" ON (default): signup shows a "check your inbox" notice.
   - Turn it OFF for instant sessions during hackathon judging.
4. Optional: customize the confirmation email template under *Authentication → Emails*.

## Verified live (this project, against your hosted instance)

- [x] Credentials load — "not configured" notice absent, form renders
- [x] Signup round-trip: `healthflow.qa.runner@gmail.com` created →
      "Account created — check your inbox for the confirmation link"
- [x] Error mapping: sign-in before confirmation →
      "Please confirm your email first — check your inbox."
- [x] Invalid-domain rejection surfaced cleanly (Supabase-side validation)
- [x] Demo access still works; unauthenticated routes still redirect to /login
- [x] `tsc --noEmit` clean · `npm run build` succeeds
- [ ] Google OAuth — pending the dashboard steps above (button is live)
- [ ] Confirmed-email sign-in — flip "Confirm email" off, or click the link,
      then sign in through the form

## Security notes

- Only the URL + publishable key live in the client; session tokens are managed
  by supabase-js (localStorage, auto-refresh).
- Any future database access should go through row-level security policies —
  the anon key is expected to be public.
- The GIS (`VITE_GOOGLE_CLIENT_ID`) path from the old login is retired; Google
  now flows through Supabase OAuth exclusively.
