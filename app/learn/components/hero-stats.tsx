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

/** The data strip under the hero — three big counting numbers. */
export function HeroStats() {
  return (
    <dl className="grid grid-cols-3 divide-x divide-border border-y border-border">
      {STATS.map((stat) => (
        <div key={stat.label} className="px-4 py-6 sm:px-8 text-center sm:text-left">
          <dt className="sr-only">
            {stat.label} {stat.sub}
          </dt>
          <dd>
            <span className="block font-serif text-3xl sm:text-display-md font-semibold tracking-tight tabular">
              <CountUp to={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
            </span>
            <span className="mt-1 block text-xs sm:text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{stat.label}</span> {stat.sub}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
