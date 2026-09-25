'use client';

import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

/**
 * A number that counts up from zero the first time it scrolls into view.
 * Used in the hero stat strip and the bill-survival section.
 */
export function CountUp({
  to,
  prefix = '',
  suffix = '',
  duration = 1.6,
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!inView || !el) return;

    const render = (value: number) => {
      el.textContent = `${prefix}${Math.round(value).toLocaleString('en-US')}${suffix}`;
    };

    if (reduceMotion) {
      render(to);
      return;
    }

    const controls = animate(0, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: render,
    });
    return () => controls.stop();
  }, [inView, to, prefix, suffix, duration, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  );
}

const STATS = [
  { value: 435, label: 'Representatives', sub: 'in the House' },
  { value: 100, label: 'Senators', sub: 'in the Senate' },
  { value: 3, prefix: '~', suffix: ' in 100', label: 'bills', sub: 'ever become law' },
];

/**
 * The three figures under the page head: Newsreader numerals in a row with
 * hairline dividers, each captioned in mono (Documentation/brand.md, "Numbers
 * sit in a row … not in cards").
 */
export function HeroStats() {
  return (
    <dl className="grid divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {STATS.map((stat) => (
        <div key={stat.label} className="py-4 sm:py-8 sm:pl-8 sm:pr-8 sm:first:pl-0">
          <dt className="sr-only">
            {stat.label} {stat.sub}
          </dt>
          {/* On a phone each figure is a row (number, then caption); from sm
              up the three sit side by side. */}
          <dd className="flex items-baseline gap-4 sm:block">
            <span className="block w-32 shrink-0 font-serif text-display-sm font-medium leading-none text-ink tabular sm:w-auto sm:text-display-lg">
              <CountUp to={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
            </span>
            <span className="block font-mono text-xs leading-4 text-ink-3 sm:mt-3">
              <span className="text-ink-2">{stat.label}</span> {stat.sub}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
