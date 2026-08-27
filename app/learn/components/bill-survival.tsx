'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

// "Watch what happens to 100 bills" — a grid of 100 documents pops in, then
// nearly all of them fade away. Only ~3 survive and turn law-green.

const TOTAL = 100;
/** The lucky few, scattered across the grid so survival looks random. */
const SURVIVORS = new Set([13, 47, 82]);

type Phase = 'hidden' | 'shown' | 'resolved';

export function BillSurvival() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('hidden');

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) {
      setPhase('resolved');
      return;
    }
    setPhase('shown');
    // Let all 100 pop in and sit for a beat before the die-off.
    const timer = setTimeout(() => setPhase('resolved'), 2400);
    return () => clearTimeout(timer);
  }, [inView, reduceMotion]);

  return (
    <div ref={ref} className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
      {/* Narrative side */}
      <div className="lg:col-span-5 space-y-5">
        <p className="font-serif text-lg sm:text-xl leading-[1.7]">
          Here are <span className="font-semibold tabular">100</span> bills, freshly
          introduced into Congress.
        </p>
        <p
          className={cn(
            'font-serif text-lg sm:text-xl leading-[1.7] transition-opacity duration-700',
            phase === 'resolved' ? 'opacity-100' : 'opacity-30',
          )}
          aria-hidden={phase !== 'resolved'}
        >
          Only about{' '}
          <span className="font-semibold text-status-law tabular">3 of them</span> will
          ever become law. The rest run out of time, never get a vote, or were only ever
          introduced to make a point.
        </p>
        <div
          className={cn(
            'flex flex-wrap gap-x-6 gap-y-2 text-sm transition-opacity duration-700 delay-300',
            phase === 'resolved' ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden={phase !== 'resolved'}
        >
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <FileText className="h-3.5 w-3.5 text-border" aria-hidden="true" />
            Died along the way
          </span>
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <FileText className="h-3.5 w-3.5 text-status-law" aria-hidden="true" />
            Became law
          </span>
        </div>
      </div>

      {/* The 100 bills */}
      <div className="lg:col-span-7">
        <div
          className="grid grid-cols-10 gap-2 sm:gap-2.5"
          role="img"
          aria-label="Visualization of 100 bills: only about 3 in 100 become law, the rest fail"
        >
          {Array.from({ length: TOTAL }, (_, i) => {
            const survives = SURVIVORS.has(i);
            return (
              <motion.div
                key={i}
                className="flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={phase !== 'hidden' ? { opacity: 1, scale: 1 } : {}}
                transition={{
                  delay: reduceMotion ? 0 : i * 0.014,
                  duration: 0.3,
                  ease: 'backOut',
                }}
              >
                <FileText
                  strokeWidth={1.5}
                  className={cn(
                    'h-4 w-4 sm:h-5 sm:w-5 transition-all duration-700',
                    phase === 'resolved'
                      ? survives
                        ? 'text-status-law scale-125'
                        : 'text-border'
                      : 'text-foreground/70',
                  )}
                  style={{
                    transitionDelay: phase === 'resolved' && !reduceMotion ? `${i * 9}ms` : '0ms',
                  }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
