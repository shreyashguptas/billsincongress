'use client';

/**
 * Section — "What Congress is working on" (the wheel).
 *
 * CivLab-style radial map: each slice is a policy area sized by its bills, the
 * dots inside are the bills (one dot ≈ a fixed number). The six biggest topics
 * each get a colour; everything past them folds into one grey "everything
 * else" slice, because more than six colours stop being tellable apart.
 * Names live in the legend beside the wheel, never squeezed onto the rim, so a
 * long one like "Armed Forces and National Security" always reads in full.
 * Hover either side to link them; click to pin a topic and get its actions.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { formatCongressOrdinal } from '@/lib/congress';
import { StarterButton, fmt, type HomeProps } from './shared';

const COLORED = 6;
const S = 640;
const C = S / 2;
const R_IN = 110;
const R_OUT = 305;
const GAP = 0.014;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Deterministic scatter so dots don't jump on every render. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function arcPath(a0: number, a1: number, r0: number, r1: number) {
  const p = (a: number, r: number) => `${round2(C + r * Math.cos(a))} ${round2(C + r * Math.sin(a))}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(a0, r1)} A ${r1} ${r1} 0 ${large} 1 ${p(a1, r1)} L ${p(a1, r0)} A ${r0} ${r0} 0 ${large} 0 ${p(a0, r0)} Z`;
}

export function TopicWheel({
  congress,
  dashboard,
  policyAreaHref,
  onDrillDown,
}: Pick<HomeProps, 'congress' | 'dashboard' | 'policyAreaHref' | 'onDrillDown'>) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const focus = hover ?? pinned;

  const wheel = useMemo(() => {
    const top = dashboard.topPolicyAreas.filter((a) => a.count > 0).slice(0, COLORED);
    const topSum = top.reduce((s, a) => s + a.count, 0);
    const rest = Math.max(0, dashboard.totalBills - topSum);
    const items = [
      ...top.map((a, i) => ({ name: a.name, count: a.count, color: `var(--topic-${i + 1})`, isRest: false })),
      ...(rest > 0 ? [{ name: 'Everything else', count: rest, color: 'hsl(var(--muted-foreground))', isRest: true }] : []),
    ];
    const total = items.reduce((s, a) => s + a.count, 0) || 1;
    const perDot = Math.max(1, Math.round(total / 1100));
    let a = -Math.PI / 2;
    return {
      perDot,
      items: items.map((it, i) => {
        const span = (it.count / total) * Math.PI * 2;
        const a0 = a + GAP / 2;
        const a1 = a + span - GAP / 2;
        a += span;
        const rand = rng(i * 7919 + 17);
        const dots = Array.from({ length: Math.round(it.count / perDot) }, () => {
          // Area-uniform radius so dots don't crowd the centre.
          const r = Math.sqrt((R_IN + 8) ** 2 + rand() * ((R_OUT - 8) ** 2 - (R_IN + 8) ** 2));
          const ang = a0 + 0.012 + rand() * Math.max(0, a1 - a0 - 0.024);
          return { x: round2(C + r * Math.cos(ang)), y: round2(C + r * Math.sin(ang)) };
        });
        return { ...it, a0, a1, dots, share: it.count / total };
      }),
    };
  }, [dashboard.topPolicyAreas, dashboard.totalBills]);

  const f = focus !== null ? wheel.items[focus] : null;
  const pinnedItem = pinned !== null ? wheel.items[pinned] : null;
  const toggle = (i: number) => {
    const next = pinned === i ? null : i;
    setPinned(next);
    if (next !== null) {
      const w = wheel.items[next];
      analytics.homeTopicSelected({ policy_area: w.name, is_rest: w.isRest, congress });
    }
  };

  return (
    <section className="border-b border-border">
      <div className="container-editorial py-12">
        <header className="mb-6">
          <p className="label-eyebrow mb-2">By subject</p>
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-serif text-display-sm font-semibold tracking-tight leading-tight">
              What Congress is working on
            </h2>
            <StarterButton
              question={`What are the biggest policy areas in the ${formatCongressOrdinal(congress)} Congress and what do those bills do?`}
              className="shrink-0 pt-1.5 text-[12px] whitespace-nowrap"
            >
              Ask about this →
            </StarterButton>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <svg
              viewBox={`0 0 ${S} ${S}`}
              className="w-full max-w-[560px] mx-auto h-auto"
              onMouseLeave={() => setHover(null)}
              role="img"
              aria-label={wheel.items.map((w) => `${w.name}: ${fmt(w.count)} bills`).join(', ')}
            >
              {wheel.items.map((w, i) => {
                const on = focus === null || focus === i;
                return (
                  <g key={w.name} className="cursor-pointer" onMouseEnter={() => setHover(i)} onClick={() => toggle(i)}>
                    <path
                      d={arcPath(w.a0, w.a1, R_IN, R_OUT)}
                      fill={w.color}
                      fillOpacity={focus === i ? 0.16 : 0.06}
                      stroke={w.color}
                      strokeOpacity={focus === i ? 0.9 : 0.25}
                      className="transition-all duration-200"
                    />
                    {w.dots.map((d, k) => (
                      <circle
                        key={k}
                        cx={d.x}
                        cy={d.y}
                        r={focus === i ? 2.4 : 2}
                        fill={w.color}
                        opacity={on ? (w.isRest && focus !== i ? 0.45 : 0.9) : 0.12}
                        className="transition-opacity duration-200"
                      />
                    ))}
                  </g>
                );
              })}
              <circle cx={C} cy={C} r={R_IN - 8} fill="hsl(var(--background))" stroke="hsl(var(--border))" />
              <text x={C} y={C - 4} textAnchor="middle" className="fill-foreground font-serif" style={{ fontSize: 36, fontWeight: 600 }}>
                {fmt(f ? f.count : dashboard.totalBills)}
              </text>
              <text x={C} y={C + 22} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11, letterSpacing: '0.14em' }}>
                {f ? `${(f.share * 100).toFixed(1)}% OF BILLS` : 'BILLS · ALL TOPICS'}
              </text>
            </svg>
            <p className="mt-2 text-center font-mono text-[10px] text-muted-foreground">
              each dot ≈ {fmt(wheel.perDot)} bills
            </p>
          </div>

          {/* Legend — full names, counts, and the pinned topic's actions */}
          <div className="lg:col-span-5">
            <ul className="divide-y divide-border border-y border-border" onMouseLeave={() => setHover(null)}>
              {wheel.items.map((w, i) => (
                <li
                  key={w.name}
                  className={cn(
                    'flex items-center transition-opacity',
                    focus !== null && focus !== i && 'opacity-40',
                    pinned === i && 'bg-secondary/60',
                  )}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    onClick={() => toggle(i)}
                    aria-pressed={pinned === i}
                    className="grid flex-1 grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-2.5 px-1 text-left"
                  >
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: w.color }} />
                    <span className="text-sm">{w.name}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular">{(w.share * 100).toFixed(1)}%</span>
                    <span className="w-14 text-right font-mono text-sm tabular">{fmt(w.count)}</span>
                  </button>
                  {/* A real link, not a scripted jump: this is the one page search
                      engines index, and these rows are how link equity reaches the
                      topic hubs. The grey "everything else" slice has no hub. */}
                  {w.isRest ? (
                    <span className="w-8" aria-hidden="true" />
                  ) : (
                    <Link
                      href={policyAreaHref(w.name)}
                      onClick={() => analytics.dashboardDrilldownClicked('policyArea', w.name, congress)}
                      aria-label={`See the ${w.name.toLowerCase()} bills`}
                      className="w-8 py-2.5 text-center text-muted-foreground hover:text-foreground"
                    >
                      →
                    </Link>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-4 min-h-[3rem] text-sm">
              {pinnedItem ? (
                pinnedItem.isRest ? (
                  <button type="button" onClick={() => onDrillDown('congress', congress)} className="underline underline-offset-2 decoration-border hover:decoration-foreground">
                    Browse every bill →
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <Link
                      href={policyAreaHref(pinnedItem.name)}
                      onClick={() => analytics.dashboardDrilldownClicked('policyArea', pinnedItem.name, congress)}
                      className="underline underline-offset-2 decoration-border hover:decoration-foreground"
                    >
                      See the {fmt(pinnedItem.count)} {pinnedItem.name.toLowerCase()} bills →
                    </Link>
                    <StarterButton question={`What are the ${pinnedItem.name.toLowerCase()} bills in the ${formatCongressOrdinal(congress)} Congress about?`}>
                      Ask what they&rsquo;re about →
                    </StarterButton>
                  </div>
                )
              ) : (
                <p className="text-muted-foreground">Click a topic to see its bills or ask about them.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
