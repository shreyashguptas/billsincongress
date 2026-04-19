/** @type {import('tailwindcss').Config} */
/* eslint-disable max-len */
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
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 1px)',
        sm: 'calc(var(--radius) - 2px)',
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out forwards',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
