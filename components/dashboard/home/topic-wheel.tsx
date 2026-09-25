'use client';

/**
 * Section — "What Congress is working on" (the wheel).
 *
 * CivLab-style radial map: each slice is a policy area sized by its bills, the
 * dots inside are the bills (one dot ≈ a fixed number). The six biggest topics
 * each get a colour; everything past them folds into one grey slice, because
 * more than six colours stop being tellable apart. That slice is total bills
 * minus the six, so it also holds bills with no policy area yet, and its label
 * says so.
 * Names live in the legend beside the wheel, never squeezed onto the rim, so a
 * long one like "Armed Forces and National Security" always reads in full.
 * Hover either side to link them; click to pin a topic and get its actions.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { formatCongressOrdinal } from '@/lib/congress';
import { AskAbout } from '@/components/answers/ask-about';
import { SectionHeader } from '@/components/brand/section';
import { Button } from '@/components/ui/button';
import { SectionAsk, fmt, type HomeProps } from './shared';

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
      ...(rest > 0 ? [{ name: 'Other topics, or none tagged', count: rest, color: 'hsl(var(--ink-3))', isRest: true }] : []),
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
    <section className="border-b border-line">
      <div className="container-editorial py-16 sm:py-24">
        <SectionHeader
          eyebrow="By subject"
          title="What Congress is working on"
          action={
            <SectionAsk
              question={`What are the biggest policy areas in the ${formatCongressOrdinal(congress)} Congress and what do those bills do?`}
            />
          }
        />

        <div className="mt-10 grid grid-cols-1 items-center gap-10 sm:mt-12 lg:grid-cols-12 lg:gap-12">
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
              <circle cx={C} cy={C} r={R_IN - 8} fill="hsl(var(--paper))" stroke="hsl(var(--line))" />
              <text
                x={C}
                y={C + 2}
                textAnchor="middle"
                className="fill-ink font-serif tabular"
                style={{ fontSize: 48, fontWeight: 400, letterSpacing: '-0.02em' }}
              >
                {fmt(f ? f.count : dashboard.totalBills)}
              </text>
              {/* Set like .label-eyebrow; SVG text cannot take the class's layout rules. */}
              <text
                x={C}
                y={C + 28}
                textAnchor="middle"
                className="fill-ink-3 font-sans"
                style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}
              >
                {f ? `${(f.share * 100).toFixed(1)}% of bills` : 'Bills · all topics'}
              </text>
            </svg>
            <p className="mt-3 text-center font-mono text-xs text-ink-3">
              each dot ≈ {fmt(wheel.perDot)} bills
            </p>
          </div>

          {/* Legend — full names, counts, and the pinned topic's actions */}
          <div className="lg:col-span-5">
            <ul className="border-b border-line" onMouseLeave={() => setHover(null)}>
              {wheel.items.map((w, i) => (
                <li
                  key={w.name}
                  className={cn(
                    'flex min-h-[52px] items-center border-t border-line transition-opacity',
                    focus !== null && focus !== i && 'opacity-35',
                    pinned === i && 'bg-sunken',
                  )}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    onClick={() => toggle(i)}
                    aria-pressed={pinned === i}
                    className="focus-ring grid min-h-[52px] flex-1 grid-cols-[12px_1fr_auto_4rem] items-center gap-x-3 rounded-sm py-2 pl-1 text-left"
                  >
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: w.color }} />
                    <span className="text-[15px] leading-5 text-ink">{w.name}</span>
                    <span className="text-right font-mono text-[13px] text-ink-3 tabular">{(w.share * 100).toFixed(1)}%</span>
                    <span className="text-right font-mono text-[15px] font-medium text-ink tabular">{fmt(w.count)}</span>
                  </button>
                  {/* A real link, not a scripted jump: this is the one page search
                      engines index, and these rows are how link equity reaches the
                      topic hubs. The grey "everything else" slice has no hub. */}
                  {w.isRest ? (
                    <span className="w-10 shrink-0" aria-hidden="true" />
                  ) : (
                    <Link
                      href={policyAreaHref(w.name)}
                      onClick={() => analytics.dashboardDrilldownClicked('policyArea', w.name, congress)}
                      aria-label={`See the ${w.name.toLowerCase()} bills`}
                      className="focus-ring flex h-11 w-10 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:text-ink"
                    >
                      →
                    </Link>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-5 min-h-[3rem] text-sm">
              {pinnedItem ? (
                pinnedItem.isRest ? (
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => onDrillDown('congress', congress)}
                    className="rounded-sm font-normal decoration-1"
                  >
                    Browse every bill →
                  </Button>
                ) : (
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <Link
                      href={policyAreaHref(pinnedItem.name)}
                      onClick={() => analytics.dashboardDrilldownClicked('policyArea', pinnedItem.name, congress)}
                      className="link focus-ring rounded-sm"
                    >
                      See the {fmt(pinnedItem.count)} {pinnedItem.name.toLowerCase()} bills →
                    </Link>
                    <AskAbout
                      question={`What are the ${pinnedItem.name.toLowerCase()} bills in the ${formatCongressOrdinal(congress)} Congress about?`}
                      className="focus-ring rounded-sm text-sm"
                    >
                      Ask what they&rsquo;re about →
                    </AskAbout>
                  </div>
                )
              ) : (
                <p className="text-ink-3">Click a topic to see its bills or ask about them.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
