'use client';

import { motion } from 'framer-motion';
import { Users, Vote, Landmark, Home, ArrowRight, ArrowDown, RotateCcw } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// "Who makes the rules?" — the loop between the people and their laws,
// drawn as four steps that light up in sequence as they scroll into view.
// Reduced motion is handled globally by LearnMotionProvider.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: Users,
    title: 'You',
    body: 'Along with 340 million other Americans.',
  },
  {
    icon: Vote,
    title: 'You vote',
    body: 'Electing 535 people to speak for you in Washington.',
  },
  {
    icon: Landmark,
    title: 'They write the laws',
    body: 'Debating, changing, and voting on new rules for the country.',
  },
  {
    icon: Home,
    title: 'The laws shape your life',
    body: 'Schools, roads, taxes, food, the internet — all of it.',
  },
];

const ease = [0.22, 1, 0.36, 1] as const;
const viewport = { once: true, margin: '-60px' } as const;

export function CivicFlow() {
  return (
    <div>
      <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-0">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex flex-col sm:flex-row items-center sm:flex-1">
            {/* Each card lights up in sequence, left to right */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewport}
              transition={{ duration: 0.55, delay: i * 0.3, ease }}
              className="w-full h-full border border-border bg-card p-5 sm:p-6 text-center sm:text-left"
            >
              <div className="mx-auto sm:mx-0 mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background">
                <step.icon className="h-5 w-5 text-accent" strokeWidth={1.75} />
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                Step {i + 1}
              </p>
              <h3 className="font-serif text-lg font-semibold tracking-tight mb-1.5">
                {step.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
            </motion.div>

            {/* Connector between cards */}
            {i < STEPS.length - 1 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={viewport}
                transition={{ duration: 0.4, delay: i * 0.3 + 0.25 }}
                className="flex items-center justify-center py-1 sm:py-0 sm:px-1 shrink-0"
                aria-hidden="true"
              >
                <ArrowDown className="h-4 w-4 text-accent sm:hidden" />
                <ArrowRight className="h-4 w-4 text-accent hidden sm:block" />
              </motion.div>
            )}
          </div>
        ))}
      </div>

      {/* The loop closes */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={{ duration: 0.55, delay: STEPS.length * 0.3, ease }}
        className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          …and every two years, the ballot comes back to{' '}
          <span className="font-medium text-foreground">you</span>.
        </span>
      </motion.p>
    </div>
  );
}
