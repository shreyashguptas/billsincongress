'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Seconds to wait after entering the viewport before revealing. */
  delay?: number;
  className?: string;
}

/**
 * Scroll-triggered entrance shared by every Learn-page section.
 * Content fades and rises the first time it scrolls into view.
 *
 * Reduced motion is handled globally by LearnMotionProvider (MotionConfig),
 * so `initial` here must stay identical between server and client renders.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
