/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand chrome — header/footer/nav shell (fixed in both themes; it is
        // the structural brand, legible white-on-green in light AND dark).
        chrome: {
          DEFAULT: '#14432A',
          dark: '#0E301E',
          light: '#1E5C3A',
          50: '#EAF3EE',
        },
        // Dark shell (legacy dark-surface hues, kept for dark-only contexts)
        navy: {
          950: '#081221',
          900: '#0B1B30',
          800: '#122742',
          700: '#1B3555',
          600: '#26456B',
          500: '#3A5A82',
          200: '#B9C7D8',
          100: '#D6DEE8',
          50: '#EDF1F6',
        },
        /*
         * SEMANTIC THEME TOKENS — the entire app's light/dark switch. Each
         * maps to a CSS variable defined in index.css (:root light,
         * html.dark overrides). Components use these exclusively; no
         * per-component dark: conditionals anywhere.
         */
        canvas: 'var(--hf-canvas)',
        surface: {
          DEFAULT: 'var(--hf-surface)', // cards
          2: 'var(--hf-surface-2)', // subtle wells (hover chips, skeletons)
          elevated: 'var(--hf-elevated)', // popovers/tooltips/modals
        },
        line: {
          DEFAULT: 'var(--hf-line)', // primary borders
          soft: 'var(--hf-line-soft)', // hairline dividers
        },
        ink: 'var(--hf-ink)',
        slate: {
          450: 'var(--hf-muted)',
        },
        muted: 'var(--hf-muted)',
        faint: 'var(--hf-faint)', // icons/dividers-as-fg
        // AI / intelligence accent — purple, reserved for AI + interactive selection
        ai: {
          DEFAULT: '#6A00F4',
          dark: '#5200C7',
          light: '#9B4DFF',
          wash: '#F1E8FF',
        },
        // Warm informational accent — human impact, used sparingly.
        // `deep` is the AA-safe text tone: 5.9:1 on `wash`, 5.1:1 on peach/70.
        peach: {
          DEFAULT: '#FFD6A5',
          deep: '#8A520B',
          wash: '#FFF4E5',
        },
        // Deep neutral canvas for the geospatial view (NOT brand green) —
        // dark in BOTH themes; the dark-mode cards are charcoal family,
        // distinct from this blue-charcoal radar canvas.
        geo: {
          DEFAULT: '#101820',
          line: '#2A3644',
          fill: '#182230',
        },
        // Muted teal accent
        accent: {
          DEFAULT: '#0E7C7B',
          dark: '#0A5C5B',
          light: '#5FA8A7',
          wash: '#E7F2F2',
        },
        // Status scale — always paired with a text label in the UI
        status: {
          stable: '#2F855A',
          watch: '#B7791F',
          high: '#C05621',
          critical: '#C53030',
        },
      },
      fontFamily: {
        sans: [
          'InterVariable',
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Tint driven by --hf-shadow so dark-mode shadows deepen instead of
        // graying out; rgba(var(--hf-shadow) / a) composes per elevation.
        panel: '0 1px 2px rgba(var(--hf-shadow) / 0.06), 0 4px 16px rgba(var(--hf-shadow) / 0.08)',
        drawer: '-12px 0 40px rgba(var(--hf-shadow) / 0.18)',
      },
    },
  },
  plugins: [],
};
