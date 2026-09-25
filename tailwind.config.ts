/** @type {import('tailwindcss').Config} */
/* eslint-disable max-len */
const plugin = require('tailwindcss/plugin');

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      // Documentation/brand.md is the source of truth for every value below.
      fontFamily: {
        // Newsreader: headlines, bill titles, summaries, the big figures.
        serif: ['var(--font-serif)', 'Iowan Old Style', 'Georgia', 'serif'],
        // Geist: everything a reader operates or scans.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Geist Mono: bill numbers, counts, dates — anything that lines up.
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        'display-2xl': ['4.5rem', { lineHeight: '1.03', letterSpacing: '-0.025em' }],   // 72 — the home hero only
        'display-xl':  ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.022em' }],   // 56 — page titles
        'display-lg':  ['2.75rem', { lineHeight: '1.09', letterSpacing: '-0.02em' }],   // 44 — finding headlines
        'display-md':  ['2.125rem', { lineHeight: '1.15', letterSpacing: '-0.018em' }], // 34 — section headlines
        'display-sm':  ['1.625rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],  // 26 — panel titles
        title:         ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.01em' }],   // 20 — bill titles in lists
        reading:       ['1.1875rem', { lineHeight: '1.63' }],                           // 19 — summaries, articles
        'reading-sm':  ['1.0625rem', { lineHeight: '1.6' }],                            // 17 — answers, phone reading
      },
      colors: {
        // shadcn/ui's semantic names — aliases of the brand tokens below
        // (app/globals.css). components/ui uses these; app code uses the brand names.
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        // The brand (Documentation/brand.md).
        paper: 'hsl(var(--paper))',
        raised: 'hsl(var(--raised))',
        sunken: 'hsl(var(--sunken))',
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          2: 'hsl(var(--ink-2))',
          3: 'hsl(var(--ink-3))',
        },
        'on-ink': 'hsl(var(--on-ink))',
        line: {
          DEFAULT: 'hsl(var(--line))',
          strong: 'hsl(var(--line-strong))',
        },
        error: 'hsl(var(--error))',
        // Bill stages — StatusPill, StageTrack and every stage chart.
        status: {
          introduced: 'hsl(var(--status-introduced))',
          committee: 'hsl(var(--status-committee))',
          'passed-one': 'hsl(var(--status-passed-one))',
          'passed-both': 'hsl(var(--status-passed-both))',
          president: 'hsl(var(--status-president))',
          signed: 'hsl(var(--status-signed))',
          law: 'hsl(var(--status-law))',
          vetoed: 'hsl(var(--status-vetoed))',
        },
        // Parties — only where the data is about party.
        party: {
          d: 'hsl(var(--party-d))',
          r: 'hsl(var(--party-r))',
          i: 'hsl(var(--party-i))',
          u: 'hsl(var(--party-u))',
        },
        topic: {
          1: 'var(--topic-1)',
          2: 'var(--topic-2)',
          3: 'var(--topic-3)',
          4: 'var(--topic-4)',
          5: 'var(--topic-5)',
          6: 'var(--topic-6)',
        },
        heat: 'hsl(var(--heat))',
      },
      ringColor: {
        DEFAULT: 'hsl(var(--ink))',
      },
      borderRadius: {
        xs: '2px',       // waffle squares, progress segments
        sm: '4px',       // status pills, filter chips
        md: '8px',       // buttons, cards, inputs
        lg: '14px',      // the ask composer, the status panel, sheets
      },
      boxShadow: {
        // Borders carry structure; a shadow only means "this floats".
        float: '0 1px 2px rgb(0 0 0 / 0.06), 0 12px 32px -8px rgb(0 0 0 / 0.2)',
      },
      maxWidth: {
        measure: '680px',
      },
      // Keyframes are written out in app/globals.css; these entries exist so
      // Tailwind GENERATES the matching `animate-*` utilities. A variant such
      // as `data-[state=open]:animate-sheet-in-bottom` only emits CSS for a
      // utility Tailwind knows about, so a plain CSS class alone is inert
      // inside a variant — which is why every sheet on the site currently
      // opens with no transition at all.
      keyframes: {
        'overlay-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'overlay-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'sheet-in-bottom': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'sheet-out-bottom': { from: { transform: 'none' }, to: { transform: 'translateY(100%)' } },
        'sheet-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        'sheet-out-left': { from: { transform: 'none' }, to: { transform: 'translateX(-100%)' } },
        'sheet-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'sheet-out-right': { from: { transform: 'none' }, to: { transform: 'translateX(100%)' } },
        'sheet-in-top': { from: { transform: 'translateY(-100%)' }, to: { transform: 'none' } },
        'sheet-out-top': { from: { transform: 'none' }, to: { transform: 'translateY(-100%)' } },
        'popover-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
        'popover-out': {
          from: { opacity: '1', transform: 'none' },
          to: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out forwards',
        'overlay-in': 'overlay-in 0.2s ease-out',
        'overlay-out': 'overlay-out 0.18s ease-in',
        'sheet-in-bottom': 'sheet-in-bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'sheet-out-bottom': 'sheet-out-bottom 0.2s cubic-bezier(0.4, 0, 1, 1)',
        'sheet-in-left': 'sheet-in-left 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'sheet-out-left': 'sheet-out-left 0.2s cubic-bezier(0.4, 0, 1, 1)',
        'sheet-in-right': 'sheet-in-right 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'sheet-out-right': 'sheet-out-right 0.2s cubic-bezier(0.4, 0, 1, 1)',
        'sheet-in-top': 'sheet-in-top 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'sheet-out-top': 'sheet-out-top 0.2s cubic-bezier(0.4, 0, 1, 1)',
        'popover-in': 'popover-in 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
        'popover-out': 'popover-out 0.12s ease-in',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    // The enter/exit utilities (animate-in, fade-in-0, zoom-in-95…) that
    // shadcn/ui components ship with. Every blanket rule under
    // prefers-reduced-motion in globals.css still applies to them.
    require('tailwindcss-animate'),
    // Adapt to the INPUT DEVICE rather than to the screen width. A 1280px-wide
    // touchscreen laptop needs 44px hit targets; a 768px iPad with a trackpad
    // does not need a bottom sheet. Width breakpoints answer neither question.
    plugin(({ addVariant }: { addVariant: (name: string, definition: string) => void }) => {
      addVariant('touchable', '@media (any-pointer: coarse)');
      addVariant('fine', '@media (hover: hover) and (pointer: fine)');
    }),
  ],
};
