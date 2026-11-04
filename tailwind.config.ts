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
  // `hover:` only where a device can actually hover. Without it a tap on a
  // phone or tablet leaves the tapped control painted in its hover state until
  // the next tap elsewhere ("sticky hover").
  future: { hoverOnlyWhenSupported: true },
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
      // documentation/brand.md is the source of truth for every value below.
      fontFamily: {
        // Newsreader: headlines, bill titles, summaries, the big figures.
        serif: ['var(--font-serif)', 'Iowan Old Style', 'Georgia', 'serif'],
        // Geist: everything a reader operates or scans.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Geist Mono: identifiers only — bill numbers (H.R. 1276), party-state
        // codes (D-MI), state codes. Dates and counts are Geist with `.tabular`.
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Every size is in rem, so a reader who sets a larger default font in
      // their browser gets a larger site, labels and chart keys included. 1rem
      // is 16px only at the browser's default; the px in the comments are at
      // that default. Nothing is smaller than `xs` (the floor, brand.md "Type
      // floor"); scripts/check-type-floor.ts fails on a px size or a size under it.
      fontSize: {
        'display-2xl': ['4.5rem', { lineHeight: '1.03', letterSpacing: '-0.025em' }],   // 72 — the home hero only
        'display-xl':  ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.022em' }],   // 56 — page titles
        'display-lg':  ['2.75rem', { lineHeight: '1.09', letterSpacing: '-0.02em' }],   // 44 — finding headlines
        'display-md':  ['2.125rem', { lineHeight: '1.15', letterSpacing: '-0.018em' }], // 34 — section headlines
        'display-sm':  ['1.625rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],  // 26 — panel titles
        title:         ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.01em' }],   // 20 — bill titles in lists
        reading:       ['1.1875rem', { lineHeight: '1.63' }],                           // 19 — summaries, articles
        'reading-sm':  ['1.0625rem', { lineHeight: '1.6' }],                            // 17 — answers, phone reading
        // The metadata scale (brand.md, "Type floor"). Nothing a reader needs is
        // smaller than `xs`; `xs` itself is raised from Tailwind's 12px to 13px,
        // so every existing `text-xs` meets the floor without a rewrite.
        meta:          ['0.875rem', { lineHeight: '1.25rem' }],                         // 14 — dates, counts, chart keys, source lines
        xs:            ['0.8125rem', { lineHeight: '1.125rem' }],                       // 13 — the floor: axis ticks, codes, fine print
        // Size only: these leave the line height to the element, as the px
        // values they replaced did.
        ui:            '0.9375rem',                                                     // 15 — controls, list names, secondary copy
        caption:       '0.8125rem',                                                     // 13 — helper text, small controls
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

        // The brand (documentation/brand.md).
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
          'out-of-committee': 'hsl(var(--status-out-of-committee))',
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
        // 42.5rem: 680px at the default size, and the same line length in
        // characters when the reader's font is larger.
        measure: '42.5rem',
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
        'sheet-out-bottom': { from: { transform: 'none' }, to: { transform: 'translateY(calc(100% + 1rem))' } },
        'sheet-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        'sheet-out-left': { from: { transform: 'none' }, to: { transform: 'translateX(-100%)' } },
        'sheet-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'sheet-out-right': { from: { transform: 'none' }, to: { transform: 'translateX(100%)' } },
        'sheet-in-top': { from: { transform: 'translateY(-100%)' }, to: { transform: 'none' } },
        'sheet-out-top': { from: { transform: 'none' }, to: { transform: 'translateY(-100%)' } },
        'dialog-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        'dialog-out': {
          from: { opacity: '1', transform: 'none' },
          to: { opacity: '0', transform: 'translateY(4px) scale(0.99)' },
        },
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
        'dialog-in': 'dialog-in 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        'dialog-out': 'dialog-out 0.14s cubic-bezier(0.4, 0, 1, 1)',
        'popover-in': 'popover-in 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
        'popover-out': 'popover-out 0.12s ease-in',
      },
    },
  },
  plugins: [
    // Class strategy: the base strategy restyled every input and textarea with
    // a blue focus border (and a white ring in Night) — an accent colour the
    // brand does not have. Nothing uses the `form-*` classes.
    require('@tailwindcss/forms')({ strategy: 'class' }),
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
      // A window too short for a pinned header: a phone on its side, a laptop
      // at 200% zoom and up. Below 500px tall the header scrolls away with the
      // page and Ask moves into it (app/globals.css, "Where Ask lives").
      addVariant('short', '@media (max-height: 499.98px)');
    }),
    // The site header's own md / lg / xl, measured on the header rather than on
    // the window (components/navigation.tsx). With the ask panel docked the
    // header is the window minus the panel — as little as 1024px on a 1440px
    // screen — while `lg:` and `xl:` still see 1440 and lay out a header that
    // does not fit. Same widths as the screens, so with the panel closed nothing
    // changes.
    plugin(({ addVariant }: { addVariant: (name: string, definition: string) => void }) => {
      // xs / sm size the phone logo to the room it actually has (Logo `fit`).
      // In em, which a container query reads as the browser's default font
      // size: 440px, 480px… at the default, and proportionally wider when the
      // reader has asked for larger text, so the header drops to its compact
      // form before a larger wordmark and nav run into each other. Ask sits in
      // the phone header beside the search, so the wordmark needs a 440px
      // header before it fits beside "Sign up" (brand.md, "Header").
      addVariant('header-xs', '@container site-header (min-width: 27.5em)');
      addVariant('header-sm', '@container site-header (min-width: 30em)');
      addVariant('header-md', '@container site-header (min-width: 48em)');
      addVariant('header-lg', '@container site-header (min-width: 64em)');
      addVariant('header-xl', '@container site-header (min-width: 80em)');
    }),
  ],
};
