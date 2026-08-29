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
      fontFamily: {
        // Editorial display serif
        serif: ['var(--font-serif)', 'Fraunces', 'Charter', 'Georgia', 'serif'],
        display: ['var(--font-serif)', 'Fraunces', 'Charter', 'Georgia', 'serif'],
        // UI / body sans
        sans: ['var(--font-sans)', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        // Tabular monospace for bill numbers, vote tallies, etc.
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Tightened editorial scale
        'display-2xl': ['4.5rem', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
        'display-xl':  ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.022em' }],
        'display-lg':  ['2.75rem', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        'display-md':  ['2.125rem', { lineHeight: '1.15', letterSpacing: '-0.018em' }],
        'display-sm':  ['1.625rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Bill-stage status palette — used in dashboard and badges
        status: {
          introduced: 'hsl(var(--status-introduced))',
          committee: 'hsl(var(--status-committee))',
          'passed-one': 'hsl(var(--status-passed-one))',
          'passed-both': 'hsl(var(--status-passed-both))',
          president: 'hsl(var(--status-president))',
          signed: 'hsl(var(--status-signed))',
          law: 'hsl(var(--status-law))',
        },
        // Party palette — used for sponsor indicators and dashboard charts
        party: {
          d: 'hsl(var(--party-d))',
          r: 'hsl(var(--party-r))',
          i: 'hsl(var(--party-i))',
          u: 'hsl(var(--party-u))',
        },
      },
      borderColor: {
        // The boundary of an interactive control, which needs 3:1 against its
        // fill to satisfy WCAG 1.4.11. `border` is a decorative rule and is
        // deliberately lighter; do not use it to outline a control.
        control: 'hsl(var(--control-border))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 1px)',
        sm: 'calc(var(--radius) - 2px)',
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
    // Adapt to the INPUT DEVICE rather than to the screen width. A 1280px-wide
    // touchscreen laptop needs 44px hit targets; a 768px iPad with a trackpad
    // does not need a bottom sheet. Width breakpoints answer neither question.
    plugin(({ addVariant }: { addVariant: (name: string, definition: string) => void }) => {
      addVariant('touchable', '@media (any-pointer: coarse)');
      addVariant('fine', '@media (hover: hover) and (pointer: fine)');
    }),
  ],
};
