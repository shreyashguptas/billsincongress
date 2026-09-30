import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Envelope, Paper, Person, Scene, TrackPicture } from '@/components/brand/pictures';

// The Pro page's and account page's pictures, in the Learn page's style
// (components/brand/pictures.tsx): flat SVG, ink on paper, one colour that
// means something. A bill's move takes its stage colour, the alert email is
// signed by the spectrum, and Pro's allowance is Pro's indigo (`topic-3`).
// Server-safe: no hooks, no state.

/** Tile 1: the alert email, a bell, and the step it reports. */
export function AlertsTilePicture() {
  return (
    <Scene viewBox="0 0 240 130" label="An email with a bell: a bill you follow moved a step.">
      <Envelope x={34} y={16} w={172} h={100}>
        <rect x={50} y={36} width={72} height={16} rx={4} className="fill-raised stroke-ink/40" strokeWidth={1.5} />
        <circle cx={60} cy={44} r={4} className="fill-status-passed-both" />
        <rect x={68} y={42} width={46} height={4} rx={2} className="fill-ink/60" />
        <TrackPicture x={50} y={62} w={140} reached={4} fill="fill-status-passed-both" h={6} />
        <rect x={50} y={78} width={140} height={4} rx={2} className="fill-ink/25" />
        <rect x={50} y={88} width={96} height={4} rx={2} className="fill-ink/25" />
      </Envelope>
      {/* The bell, over the corner. */}
      <g transform="translate(196 18)">
        <circle r={18} className="fill-ink" />
        <path
          d="M-7 4v-6a7 7 0 0 1 14 0v6l2 3h-18z M-3 10a3 3 0 0 0 6 0"
          className="fill-none stroke-on-ink"
          strokeWidth={2}
        />
      </g>
    </Scene>
  );
}

/**
 * Tile 2: the daily allowance, every question a dot. 500 dots, the first 100
 * (a free account's day) in ink, the 400 Pro adds in Pro's indigo.
 */
export function QuestionsTilePicture({ free, pro }: { free: number; pro: number }) {
  const cols = 40;
  const rows = Math.ceil(pro / cols);
  const step = 8;
  const dots = Array.from({ length: pro }, (_, i) => ({ x: 4 + (i % cols) * step, y: 4 + Math.floor(i / cols) * step }));
  return (
    <Scene
      viewBox={`0 0 ${cols * step} ${rows * step}`}
      label={`${pro} dots, one per question a day. The first ${free} are what a free account gets; the other ${pro - free} are what Pro adds.`}
    >
      <g className="fill-ink">
        {dots.slice(0, free).map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={2.9} />
        ))}
      </g>
      <g className="fill-topic-3">
        {dots.slice(free).map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={2.9} />
        ))}
      </g>
    </Scene>
  );
}

/** Tile 3: what does not pay for the site, struck through; readers do. */
export function IndependentTilePicture() {
  const rows = [
    { y: 18, label: 'Ads', w: 36 },
    { y: 52, label: 'Sponsors', w: 64 },
    { y: 86, label: 'Selling data', w: 82 },
  ];
  return (
    <Scene viewBox="0 0 240 130" label="Ads, sponsors and selling data, each crossed out. Readers pay for the site.">
      {rows.map((r) => (
        <g key={r.y}>
          <rect x={16} y={r.y} width={r.w + 28} height={26} rx={5} className="fill-raised stroke-ink/40" strokeWidth={1.5} />
          <text x={30} y={r.y + 17.5} className="fill-ink-3 font-sans text-[12px]">
            {r.label}
          </text>
          <path d={`M24 ${r.y + 13}H${r.w + 36}`} className="stroke-ink" strokeWidth={2} />
        </g>
      ))}
      {/* Readers: three people, the one thing that pays. */}
      {[164, 194, 224].map((x, i) => (
        <Person key={x} x={x} y={80} className={i === 1 ? 'fill-topic-3' : 'fill-ink'} />
      ))}
      <rect x={144} y={98} width={94} height={3} rx={1.5} className="fill-ink/20" />
    </Scene>
  );
}

/** A small diagram step: an icon in a circle over a short word. */
export function DiagramNode({
  icon: Icon,
  label,
  tone = 'bg-sunken text-ink',
  struck = false,
}: {
  icon: LucideIcon;
  label: ReactNode;
  tone?: string;
  struck?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <span aria-hidden="true" className={cn('relative flex h-11 w-11 items-center justify-center rounded-full', tone)}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
        {struck && <span className="absolute h-0.5 w-12 -rotate-45 rounded-full bg-ink" />}
      </span>
      <span className="text-[12px] leading-tight text-ink-2">{label}</span>
    </span>
  );
}

/** Sunrise over the horizon, with the hour. For "When do alerts arrive?". */
export function MorningPicture() {
  return (
    <Scene viewBox="0 0 240 84" label="The sun rising: alerts arrive at 11:00 UTC, which is 7 AM Eastern in summer and 6 AM in winter.">
      <rect x={6} y={66} width={96} height={3} rx={1.5} className="fill-ink/20" />
      <path d="M28 66a26 26 0 0 1 52 0" className="fill-ink/10 stroke-ink" strokeWidth={2} />
      <path d="M54 30v-9M30 40l-6-6M78 40l6-6M16 58h-9M92 58h9" className="stroke-ink-3" strokeWidth={2.5} />
      <text x={118} y={42} className="fill-ink font-mono text-[22px]">
        7 AM ET
      </text>
      <text x={118} y={60} className="fill-ink-3 font-mono text-[11px]">
        6 AM in winter
      </text>
      <text x={118} y={75} className="fill-ink-3 font-mono text-[11px]">
        11:00 UTC
      </text>
    </Scene>
  );
}
