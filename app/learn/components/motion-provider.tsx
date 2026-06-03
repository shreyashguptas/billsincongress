'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Wraps the Learn page so every framer-motion component on it respects the
 * user's reduced-motion preference: transform/movement animations are skipped,
 * while safe opacity fades still run (so scroll-revealed content always
 * becomes visible).
 *
 * This is the only reduced-motion handling the Learn page needs. Individual
 * components must NOT branch their `initial` props on useReducedMotion() —
 * the server can't know the user's preference, so that creates a server/client
 * mismatch that leaves content stuck invisible after hydration.
 */
export function LearnMotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
