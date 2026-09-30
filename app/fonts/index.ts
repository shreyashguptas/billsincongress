import { Geist, Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';

// The three faces of Documentation/brand.md, in one place for app/layout.tsx
// and app/global-error.tsx (which replaces the root layout and inherits none of
// it). Both pages must load the same files: two sets of "Newsreader" faces in
// one stylesheet would fight, and the last one defined wins. Newsreader carries
// its optical-size axis so headlines get the display cut and summaries the
// text cut.
//
// Newsreader is served from this folder, not Google: the copy there has its line
// box moved to centre on its capitals, so an icon centred beside serif text
// lines up with the letters (scripts/generate-serif-font.ts says why and how).
// It keeps Google's three unicode-range subsets as three faces of one family,
// so only the Latin file loads unless a page needs the others; the ranges are
// the ones that script prints. The two extra faces are applied to <html> only
// so their @font-face rules ship; their variables are never read.
const newsreader = localFont({
  src: './newsreader-latin.woff2',
  weight: '200 800',
  style: 'normal',
  variable: '--font-serif',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
  declarations: [
    { prop: 'font-family', value: 'Newsreader' },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

const newsreaderLatinExt = localFont({
  src: './newsreader-latin-ext.woff2',
  weight: '200 800',
  style: 'normal',
  variable: '--font-serif-latin-ext',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: 'Newsreader' },
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
});

const newsreaderVietnamese = localFont({
  src: './newsreader-vietnamese.woff2',
  weight: '200 800',
  style: 'normal',
  variable: '--font-serif-vietnamese',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: 'Newsreader' },
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
    },
  ],
});

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

/** Every face's CSS variable, for the <html> element. */
export const fontVariables = [
  newsreader.variable,
  newsreaderLatinExt.variable,
  newsreaderVietnamese.variable,
  geist.variable,
  geistMono.variable,
].join(' ');
