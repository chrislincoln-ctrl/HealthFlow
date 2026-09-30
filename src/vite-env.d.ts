/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL — public by design; safe to bundle. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase public key: classic anon JWT or newer sb_publishable_ format. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
