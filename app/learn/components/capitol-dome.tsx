'use client';

import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// The U.S. Capitol, as an editorial line drawing that draws itself in.
// Every path is stroked in currentColor so it works in light and dark mode;
// the two flags pick up the masthead accent red.
// ─────────────────────────────────────────────────────────────────────────────

type Stroke = {
  d: string;
  /** Seconds after mount when this stroke starts drawing. */
  delay: number;
  duration?: number;
  /** Thinner, lighter strokes for detail work (columns, windows). */
  detail?: boolean;
};

// Drawn bottom-up: ground → wings → central building → drum → dome → statue.
const STROKES: Stroke[] = [
  // Ground line
  { d: 'M 30 364 L 610 364', delay: 0, duration: 0.9 },
  // Steps
  { d: 'M 262 356 L 378 356', delay: 0.25, duration: 0.4 },
  { d: 'M 270 348 L 370 348', delay: 0.35, duration: 0.4 },

  // Left wing
  { d: 'M 60 364 L 60 274 L 218 274 L 218 364', delay: 0.3, duration: 0.7 },
  { d: 'M 60 288 L 218 288', delay: 0.55, duration: 0.4, detail: true },
  // Left wing windows (two rows)
  {
    d: 'M 80 302 h16 v20 h-16 Z M 116 302 h16 v20 h-16 Z M 152 302 h16 v20 h-16 Z M 188 302 h16 v20 h-16 Z',
    delay: 0.65,
    duration: 0.6,
    detail: true,
  },
  {
    d: 'M 80 334 h16 v20 h-16 Z M 116 334 h16 v20 h-16 Z M 152 334 h16 v20 h-16 Z M 188 334 h16 v20 h-16 Z',
    delay: 0.75,
    duration: 0.6,
    detail: true,
  },

  // Right wing
  { d: 'M 580 364 L 580 274 L 422 274 L 422 364', delay: 0.3, duration: 0.7 },
  { d: 'M 422 288 L 580 288', delay: 0.55, duration: 0.4, detail: true },
  // Right wing windows (two rows)
  {
    d: 'M 442 302 h16 v20 h-16 Z M 478 302 h16 v20 h-16 Z M 514 302 h16 v20 h-16 Z M 550 302 h16 v20 h-16 Z',
    delay: 0.65,
    duration: 0.6,
    detail: true,
  },
  {
    d: 'M 442 334 h16 v20 h-16 Z M 478 334 h16 v20 h-16 Z M 514 334 h16 v20 h-16 Z M 550 334 h16 v20 h-16 Z',
    delay: 0.75,
    duration: 0.6,
    detail: true,
  },

  // Central building
  { d: 'M 218 364 L 218 254 L 422 254 L 422 364', delay: 0.55, duration: 0.7 },
  // Pediment
  { d: 'M 252 254 L 320 222 L 388 254', delay: 0.8, duration: 0.5 },
  // Portico entablature + floor
  { d: 'M 252 262 L 388 262', delay: 0.9, duration: 0.35, detail: true },
  { d: 'M 252 344 L 388 344', delay: 0.9, duration: 0.35, detail: true },
  // Portico columns
  {
    d: 'M 262 262 L 262 344 M 278 262 L 278 344 M 294 262 L 294 344 M 310 262 L 310 344 M 330 262 L 330 344 M 346 262 L 346 344 M 362 262 L 362 344 M 378 262 L 378 344',
    delay: 1.0,
    duration: 0.7,
    detail: true,
  },

  // Dome skirt (wide base on the roof)
  { d: 'M 240 254 L 240 234 L 400 234 L 400 254', delay: 1.05, duration: 0.5 },
  // Lower drum (peristyle)
  { d: 'M 254 234 L 254 178 L 386 178 L 386 234', delay: 1.2, duration: 0.6 },
  // Peristyle columns
  {
    d: 'M 264 182 L 264 230 M 277 182 L 277 230 M 290 182 L 290 230 M 303 182 L 303 230 M 320 182 L 320 230 M 337 182 L 337 230 M 350 182 L 350 230 M 363 182 L 363 230 M 376 182 L 376 230',
    delay: 1.35,
    duration: 0.6,
    detail: true,
  },
  // Balustrade
  { d: 'M 258 178 L 258 166 L 382 166 L 382 178', delay: 1.45, duration: 0.4 },
  // Upper drum
  { d: 'M 270 166 L 270 146 L 370 146 L 370 166', delay: 1.55, duration: 0.4 },
  // Upper drum windows
  {
    d: 'M 286 150 L 286 162 M 303 150 L 303 162 M 320 150 L 320 162 M 337 150 L 337 162 M 354 150 L 354 162',
    delay: 1.65,
    duration: 0.4,
    detail: true,
  },

  // The dome itself
  {
    d: 'M 270 146 C 270 110, 292 88, 320 88 C 348 88, 370 110, 370 146',
    delay: 1.7,
    duration: 0.8,
  },
  // Dome ribs
  {
    d: 'M 320 88 L 320 146 M 306 90 C 301 108, 298 128, 297 146 M 292 97 C 284 112, 279 130, 278 146 M 334 90 C 339 108, 342 128, 343 146 M 348 97 C 356 112, 361 130, 362 146',
    delay: 1.95,
    duration: 0.6,
    detail: true,
  },

  // Tholos (lantern)
  { d: 'M 306 88 L 334 88', delay: 2.1, duration: 0.25, detail: true },
  {
    d: 'M 309 88 L 309 66 M 316 88 L 316 66 M 324 88 L 324 66 M 331 88 L 331 66',
    delay: 2.15,
    duration: 0.35,
    detail: true,
  },
  { d: 'M 306 66 L 334 66', delay: 2.25, duration: 0.25, detail: true },
  // Tholos cap
  { d: 'M 306 66 C 306 54, 312 48, 320 48 C 328 48, 334 54, 334 66', delay: 2.3, duration: 0.4 },

  // Statue of Freedom
  { d: 'M 314 48 L 314 40 L 326 40 L 326 48', delay: 2.5, duration: 0.3 },
  { d: 'M 320 40 L 320 28 M 320 34 L 314 38 M 320 34 L 326 38', delay: 2.6, duration: 0.35 },
];

// Flags fade in last, in accent red.
const FLAGS = [
  { pole: 'M 139 274 L 139 248', flag: 'M 139 248 L 154 252 L 139 257 Z' },
  { pole: 'M 501 274 L 501 248', flag: 'M 501 248 L 516 252 L 501 257 Z' },
];

// Reduced motion is handled globally by LearnMotionProvider — `initial` props
// must stay identical between server and client renders.
export function CapitolDome({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 380"
      fill="none"
      role="img"
      aria-label="Line drawing of the United States Capitol building"
      className={className}
    >
      {/* Statue head — a plain circle, faded in with the statue strokes */}
      <motion.circle
        cx={320}
        cy={23}
        r={4}
        stroke="currentColor"
        strokeWidth={2}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.7, duration: 0.4 }}
      />

      {STROKES.map((stroke, i) => (
        <motion.path
          key={i}
          d={stroke.d}
          stroke="currentColor"
          strokeWidth={stroke.detail ? 1.25 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={stroke.detail ? 0.55 : 1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            delay: stroke.delay,
            duration: stroke.duration ?? 0.5,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Flags — masthead red, the only colour in the drawing */}
      {FLAGS.map((f, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.8 + i * 0.15, duration: 0.5 }}
        >
          <path d={f.pole} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          <path d={f.flag} className="fill-accent" />
        </motion.g>
      ))}
    </svg>
  );
}
