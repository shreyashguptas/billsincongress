'use client';

import { motion } from 'framer-motion';
import { Users, Vote, Landmark, Home, RotateCcw } from 'lucide-react';

// "Who makes the rules?" — the loop between the people and their laws, drawn
// as four steps in a row with hairline dividers (no cards) that appear in
// sequence as they scroll into view.
// Reduced motion is handled globally by LearnMotionProvider.

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
      <ol className="grid divide-y divide-line border-y border-line lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.55, delay: i * 0.3, ease }}
            className="py-6 lg:px-6 lg:py-8 lg:first:pl-0 lg:last:pr-0"
          >
            <step.icon className="h-5 w-5 text-ink" strokeWidth={1.75} aria-hidden="true" />
            <p className="mt-4 font-mono text-xs leading-4 text-ink-3 tabular">
              Step {i + 1} of {STEPS.length}
            </p>
            <h3 className="mt-1.5 text-title text-ink">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.body}</p>
          </motion.li>
        ))}
      </ol>

      {/* The loop closes */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={{ duration: 0.55, delay: STEPS.length * 0.3, ease }}
        className="mt-6 flex items-center gap-2 text-sm text-ink-2"
      >
        <RotateCcw className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
        <span>
          …and every two years, the ballot comes back to{' '}
          <span className="font-medium text-ink">you</span>.
        </span>
      </motion.p>
    </div>
  );
}
