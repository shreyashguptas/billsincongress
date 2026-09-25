import { cn } from '@/lib/utils';
import { Arrow, Floor, Paper, Person, Scene } from '@/components/brand/pictures';
import { buildHemicycle } from './hemicycle';

// The Learn page's pictures: small flat scenes drawn in SVG on the server, so
// they cost no client JavaScript. Everything is ink except the one stage colour
// each step of a bill's path is shown in (Documentation/brand.md, "The data").
// Every scene is 240 x 150 and carries its own text alternative. The shared
// primitives (Scene, Person, Paper…) live in components/brand/pictures.tsx.

/** 1 — People vote: four voters around a ballot box, one ballot going in. */
export function VotePicture() {
  return (
    <Scene label="Four people stand beside a ballot box. A ballot with a check mark goes into it.">
      <Floor />
      <Person x={36} y={118} />
      <Person x={66} y={118} />
      <Person x={174} y={118} />
      <Person x={204} y={118} />
      <rect x={108} y={34} width={24} height={40} rx={2} className="fill-raised stroke-ink" strokeWidth={2} />
      <path d="M113 52l5 5l9-11" className="fill-none stroke-ink" strokeWidth={2.5} />
      <rect x={92} y={78} width={56} height={56} rx={4} className="fill-raised stroke-ink" strokeWidth={2.5} />
      <rect x={104} y={75} width={32} height={5} rx={2.5} className="fill-ink" />
    </Scene>
  );
}

/** 2 — The crowd picks one person to speak for them. */
export function PickPicture() {
  const crowd = [24, 50, 76].flatMap((x) => [58, 90, 122].map((y) => [x, y] as const));
  return (
    <Scene label="A crowd of people on the left, an arrow, and one person at a podium on the right, speaking for them.">
      {crowd.map(([x, y]) => (
        <Person key={`${x}-${y}`} x={x} y={y} s={0.6} className="fill-ink/35" />
      ))}
      <Arrow from={98} to={140} y={90} />
      <Person x={186} y={80} s={1.15} />
      <path d="M162 98H210L204 134H168Z" className="fill-raised stroke-ink" strokeWidth={2} />
      <Floor />
    </Scene>
  );
}

/** Stage 1 — an idea (a lit bulb) is written down as a bill. */
export function IdeaPicture() {
  return (
    <Scene label="A light bulb for an idea, an arrow, and a page of writing: the idea written down as a bill.">
      <path d="M62 20v-8M34 32l-6-6M90 32l6-6M24 60h-8M100 60h8" className="stroke-status-introduced" strokeWidth={3} />
      <circle cx={62} cy={62} r={26} className="fill-status-introduced/30 stroke-ink" strokeWidth={2.5} />
      <rect x={51} y={92} width={22} height={8} rx={2} className="fill-ink" />
      <rect x={54} y={103} width={16} height={6} rx={2} className="fill-ink" />
      <Arrow from={104} to={140} y={70} />
      <Paper x={152} y={22} w={66} h={100} accent="fill-status-introduced" />
    </Scene>
  );
}

/** Stage 2 — a committee: a few people around a table, the bill on it. */
export function CommitteePicture() {
  return (
    <Scene label="Six people sit around a table, looking at the bill together.">
      <Person x={84} y={70} s={0.8} />
      <Person x={120} y={66} s={0.8} />
      <Person x={156} y={70} s={0.8} />
      <ellipse cx={120} cy={98} rx={70} ry={24} className="fill-status-committee/25 stroke-status-committee" strokeWidth={2.5} />
      <rect x={104} y={86} width={32} height={22} rx={2} className="fill-raised stroke-ink" strokeWidth={1.75} />
      <rect x={109} y={92} width={16} height={3} rx={1.5} className="fill-status-committee" />
      <rect x={109} y={99} width={22} height={3} rx={1.5} className="fill-ink/25" />
      <Person x={34} y={110} s={0.8} />
      <Person x={206} y={110} s={0.8} />
      <Person x={120} y={138} s={0.8} />
    </Scene>
  );
}

/**
 * Stages 3 and 4 — a chamber votes: every seat drawn, the yes votes in the
 * stage colour, a check mark in the well.
 */
function VoteChamber({
  total,
  yes,
  rows,
  inner,
  r,
  fill,
  label,
}: {
  total: number;
  yes: number;
  rows: number;
  inner: number;
  r: number;
  fill: string;
  label: string;
}) {
  const seats = buildHemicycle(total, rows, inner, 104, 120, 132);
  return (
    <Scene label={label}>
      {/* Two groups, so each seat is just a circle: the yes votes, then the rest. */}
      <g className={fill}>
        {seats.slice(0, yes).map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={r} />
        ))}
      </g>
      <g className="fill-ink/15">
        {seats.slice(yes).map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={r} />
        ))}
      </g>
      <circle cx={120} cy={118} r={17} className={fill} />
      <path d="M111 118l6 6l12-13" className="fill-none stroke-on-ink" strokeWidth={3.5} />
    </Scene>
  );
}

export function HouseVotePicture() {
  return (
    <VoteChamber
      total={435}
      yes={260}
      rows={10}
      inner={42}
      r={2.2}
      fill="fill-status-passed-one"
      label="The House: 435 seats. More than half of them are coloured in, for yes votes."
    />
  );
}

export function SenateVotePicture() {
  return (
    <VoteChamber
      total={100}
      yes={60}
      rows={5}
      inner={50}
      r={4.2}
      fill="fill-status-passed-both"
      label="The Senate: 100 seats. More than half of them are coloured in, for yes votes."
    />
  );
}

/** Stage 5 — the President signs: a page, a signature, a pen. */
export function SignPicture() {
  return (
    <Scene label="A pen signing its name at the bottom of the bill.">
      <Paper x={62} y={16} w={116} h={120} accent="fill-status-president" lines={5} />
      <rect x={76} y={122} width={84} height={1.5} className="fill-ink/40" />
      <path
        d="M80 116c6-16 12-18 14-6s8 8 12-4s10-8 12 2s8 6 14-3"
        className="fill-none stroke-status-president"
        strokeWidth={3}
      />
      <g transform="translate(146 110) rotate(35)">
        <rect x={-6} y={-70} width={12} height={56} rx={3} className="fill-ink" />
        <path d="M-6 -14L0 0L6 -14Z" className="fill-status-president" />
      </g>
    </Scene>
  );
}

/** Stage 6 — it's a law: the page with a green seal, and everyone it covers. */
export function LawPicture() {
  return (
    <Scene label="The bill with a green seal and a check mark: it is now a law. People stand in front of it.">
      <Paper x={70} y={10} w={100} h={104} accent="fill-status-law" />
      <circle cx={162} cy={96} r={22} className="fill-status-law" />
      <path d="M151 96l7 7l14-15" className="fill-none stroke-on-ink" strokeWidth={4} />
      {[28, 54, 196, 222].map((x) => (
        <Person key={x} x={x} y={118} s={0.8} />
      ))}
      <Floor />
    </Scene>
  );
}

/** A hundred bills, two of which became law. Law is the only hue. */
export function HundredBills({ className }: { className?: string }) {
  const LAW = new Set([23, 76]);
  return (
    <div
      role="img"
      aria-label="100 dots, one for each bill. 2 are green: those became law. The other 98 did not."
      className={cn('grid grid-cols-10 gap-2 sm:gap-3', className)}
    >
      {Array.from({ length: 100 }, (_, i) => (
        <span
          key={i}
          className={cn('aspect-square rounded-full', LAW.has(i) ? 'bg-status-law' : 'bg-ink/15')}
        />
      ))}
    </div>
  );
}
