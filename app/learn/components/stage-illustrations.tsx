'use client';

import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// One hand-drawn, animated illustration per stage of a bill's journey.
// Each plays when mounted (the journey stepper remounts them on navigation).
// All strokes use currentColor; accent red and law green mark the key moments.
// ─────────────────────────────────────────────────────────────────────────────

const VIEWBOX = '0 0 240 200';

const ease = [0.22, 1, 0.36, 1] as const;

/** Shared text-line detail inside document shapes. */
function DocLines({ x, y, width, count = 4 }: { x: number; y: number; width: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <line
          key={i}
          x1={x}
          y1={y + i * 9}
          x2={x + (i === count - 1 ? width * 0.6 : width)}
          y2={y + i * 9}
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.4}
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

// ── Stage 1: Introduced — the bill drops into the hopper ────────────────────

export function IntroducedIllustration() {
  return (
    <svg viewBox={VIEWBOX} fill="none" className="w-full h-auto" aria-hidden="true">
      {/* The falling bill */}
      <motion.g
        initial={{ y: -70, opacity: 0, rotate: -8 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ duration: 1.1, ease, delay: 0.2 }}
      >
        <rect x={92} y={28} width={56} height={72} rx={2} stroke="currentColor" strokeWidth={2} className="fill-background" />
        <text x={120} y={46} textAnchor="middle" fontSize={11} className="fill-accent font-mono font-bold">
          H.R. 1
        </text>
        <DocLines x={100} y={58} width={40} />
      </motion.g>

      {/* The hopper (a real wooden box on the House floor) */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
      >
        {/* back rim */}
        <path d="M 78 96 L 162 96" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        {/* front face — drawn after the bill so the bill sinks behind it */}
        <path
          d="M 70 104 L 170 104 L 162 162 L 78 162 Z"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          className="fill-background"
        />
        <path d="M 70 104 L 78 96 M 170 104 L 162 96" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <text x={120} y={138} textAnchor="middle" fontSize={10} letterSpacing={2} className="fill-current font-mono" opacity={0.6}>
          THE HOPPER
        </text>
      </motion.g>

      {/* Impact puff */}
      <motion.g
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 1, 0], scale: [0.4, 1.15, 1.3] }}
        transition={{ duration: 0.8, delay: 1.2, times: [0, 0.4, 1] }}
        style={{ transformOrigin: '120px 104px' }}
      >
        <path
          d="M 60 100 L 50 92 M 180 100 L 190 92 M 66 112 L 54 114 M 174 112 L 186 114"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.5}
        />
      </motion.g>

      {/* Caption ground line */}
      <line x1={40} y1={176} x2={200} y2={176} stroke="currentColor" strokeWidth={1} opacity={0.25} />
    </svg>
  );
}

// ── Stage 2: In committee — experts around the table ────────────────────────

export function CommitteeIllustration() {
  const members = [
    { x: 56, y: 84 },
    { x: 88, y: 64 },
    { x: 120, y: 56 },
    { x: 152, y: 64 },
    { x: 184, y: 84 },
  ];
  return (
    <svg viewBox={VIEWBOX} fill="none" className="w-full h-auto" aria-hidden="true">
      {/* Table */}
      <motion.ellipse
        cx={120}
        cy={130}
        rx={78}
        ry={30}
        stroke="currentColor"
        strokeWidth={2}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease }}
        style={{ transformOrigin: '120px 130px' }}
      />

      {/* The bill on the table */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <rect x={104} y={114} width={32} height={40} rx={1.5} stroke="currentColor" strokeWidth={1.5} className="fill-background" />
        <DocLines x={109} y={123} width={22} count={3} />
      </motion.g>

      {/* Committee members pop in one by one */}
      {members.map((m, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 + i * 0.15, duration: 0.4, ease: 'backOut' }}
          style={{ transformOrigin: `${m.x}px ${m.y}px` }}
        >
          <circle cx={m.x} cy={m.y} r={9} stroke="currentColor" strokeWidth={2} className="fill-background" />
          <path
            d={`M ${m.x - 13} ${m.y + 26} C ${m.x - 13} ${m.y + 14}, ${m.x + 13} ${m.y + 14}, ${m.x + 13} ${m.y + 26}`}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </motion.g>
      ))}

      {/* Magnifying glass sweeps over the bill */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, x: [0, 14, -10, 0], y: [0, 8, -6, 0] }}
        transition={{
          opacity: { delay: 1.3, duration: 0.4 },
          x: { delay: 1.6, duration: 2.4, repeat: Infinity, repeatType: 'mirror' },
          y: { delay: 1.6, duration: 2.4, repeat: Infinity, repeatType: 'mirror' },
        }}
      >
        <circle cx={132} cy={122} r={16} className="stroke-accent fill-background/60" strokeWidth={2.5} />
        <line x1={143} y1={134} x2={156} y2={148} className="stroke-accent" strokeWidth={3.5} strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

// ── Stage 3: The first vote — yea beats nay ─────────────────────────────────

export function VoteIllustration() {
  return (
    <svg viewBox={VIEWBOX} fill="none" className="w-full h-auto" aria-hidden="true">
      {/* Baseline */}
      <line x1={36} y1={160} x2={204} y2={160} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />

      {/* YEA bar — wins */}
      <motion.rect
        x={62}
        width={44}
        className="fill-status-law"
        initial={{ y: 160, height: 0 }}
        animate={{ y: 64, height: 96 }}
        transition={{ duration: 1.1, ease, delay: 0.3 }}
      />
      {/* NAY bar — falls short */}
      <motion.rect
        x={134}
        width={44}
        className="fill-foreground/25"
        initial={{ y: 160, height: 0 }}
        animate={{ y: 76, height: 84 }}
        transition={{ duration: 1.1, ease, delay: 0.45 }}
      />

      {/* Labels */}
      <text x={84} y={178} textAnchor="middle" fontSize={11} letterSpacing={2} className="fill-current font-mono font-bold">
        YEA
      </text>
      <text x={156} y={178} textAnchor="middle" fontSize={11} letterSpacing={2} className="fill-current font-mono" opacity={0.6}>
        NAY
      </text>

      {/* Tallies fade in once the bars land */}
      <motion.text
        x={84}
        y={54}
        textAnchor="middle"
        fontSize={18}
        className="fill-current font-mono font-bold"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.3, duration: 0.5 }}
      >
        220
      </motion.text>
      <motion.text
        x={156}
        y={66}
        textAnchor="middle"
        fontSize={18}
        className="fill-current font-mono"
        opacity={0.6}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 0.6, y: 0 }}
        transition={{ delay: 1.45, duration: 0.5 }}
      >
        215
      </motion.text>

      {/* "PASSES" stamp */}
      <motion.g
        initial={{ opacity: 0, scale: 1.6, rotate: -14 }}
        animate={{ opacity: 1, scale: 1, rotate: -8 }}
        transition={{ delay: 1.9, duration: 0.35, ease: 'backOut' }}
        style={{ transformOrigin: '120px 30px' }}
      >
        <rect x={84} y={16} width={72} height={28} rx={2} className="stroke-status-law" strokeWidth={2} fill="none" />
        <text x={120} y={35} textAnchor="middle" fontSize={13} letterSpacing={2} className="fill-status-law font-mono font-bold">
          PASSES
        </text>
      </motion.g>
    </svg>
  );
}

// ── Stage 4: The other chamber — both rooms must agree ──────────────────────

function MiniBuilding({ cx, label }: { cx: number; label: string }) {
  return (
    <>
      {/* pediment */}
      <path d={`M ${cx - 34} 86 L ${cx} 64 L ${cx + 34} 86`} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      {/* columns */}
      {[-24, -12, 0, 12, 24].map((dx) => (
        <line key={dx} x1={cx + dx} y1={90} x2={cx + dx} y2={130} stroke="currentColor" strokeWidth={1.5} opacity={0.6} />
      ))}
      {/* base + steps */}
      <line x1={cx - 34} y1={90} x2={cx + 34} y2={90} stroke="currentColor" strokeWidth={2} />
      <line x1={cx - 34} y1={130} x2={cx + 34} y2={130} stroke="currentColor" strokeWidth={2} />
      <line x1={cx - 40} y1={138} x2={cx + 40} y2={138} stroke="currentColor" strokeWidth={2} />
      <text x={cx} y={156} textAnchor="middle" fontSize={10} letterSpacing={2} className="fill-current font-mono" opacity={0.6}>
        {label}
      </text>
    </>
  );
}

export function BothChambersIllustration() {
  return (
    <svg viewBox={VIEWBOX} fill="none" className="w-full h-auto" aria-hidden="true">
      <motion.g
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease }}
      >
        <MiniBuilding cx={68} label="HOUSE" />
      </motion.g>
      <motion.g
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease, delay: 0.15 }}
      >
        <MiniBuilding cx={172} label="SENATE" />
      </motion.g>

      {/* Agreement checks pop over each chamber */}
      {[68, 172].map((cx, i) => (
        <motion.g
          key={cx}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9 + i * 0.5, duration: 0.45, ease: 'backOut' }}
          style={{ transformOrigin: `${cx}px 38px` }}
        >
          <circle cx={cx} cy={38} r={15} className="fill-status-law" />
          <path
            d={`M ${cx - 7} 38 L ${cx - 2} 44 L ${cx + 8} 32`}
            stroke="white"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </motion.g>
      ))}

      {/* Same-words requirement */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 0.6 }}
      >
        <path d="M 104 110 L 136 110 M 104 118 L 136 118" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
        <text x={120} y={100} textAnchor="middle" fontSize={9} letterSpacing={1.5} className="fill-current font-mono" opacity={0.6}>
          SAME WORDS
        </text>
      </motion.g>
    </svg>
  );
}

// ── Stage 5: To the President — the bill travels to the White House ─────────

export function ToPresidentIllustration() {
  return (
    <svg viewBox={VIEWBOX} fill="none" className="w-full h-auto" aria-hidden="true">
      {/* Capitol (departure) */}
      <g opacity={0.8}>
        <path d="M 26 116 C 26 96, 38 86, 52 86 C 66 86, 78 96, 78 116" stroke="currentColor" strokeWidth={2} />
        <line x1={20} y1={116} x2={84} y2={116} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <line x1={28} y1={116} x2={28} y2={148} stroke="currentColor" strokeWidth={1.5} opacity={0.6} />
        <line x1={44} y1={116} x2={44} y2={148} stroke="currentColor" strokeWidth={1.5} opacity={0.6} />
        <line x1={60} y1={116} x2={60} y2={148} stroke="currentColor" strokeWidth={1.5} opacity={0.6} />
        <line x1={76} y1={116} x2={76} y2={148} stroke="currentColor" strokeWidth={1.5} opacity={0.6} />
        <line x1={16} y1={148} x2={88} y2={148} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <line x1={52} y1={86} x2={52} y2={74} stroke="currentColor" strokeWidth={1.5} />
        <text x={52} y={168} textAnchor="middle" fontSize={9} letterSpacing={1.5} className="fill-current font-mono" opacity={0.6}>
          CAPITOL
        </text>
      </g>

      {/* White House (arrival) */}
      <g opacity={0.8}>
        <path d="M 152 112 L 188 96 L 224 112" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
        <rect x={156} y={112} width={64} height={36} stroke="currentColor" strokeWidth={2} fill="none" />
        {[166, 178, 190, 202, 214].map((x) => (
          <line key={x} x1={x} y1={118} x2={x} y2={142} stroke="currentColor" strokeWidth={1.5} opacity={0.6} />
        ))}
        <line x1={148} y1={148} x2={228} y2={148} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <text x={188} y={168} textAnchor="middle" fontSize={9} letterSpacing={1.5} className="fill-current font-mono" opacity={0.6}>
          WHITE HOUSE
        </text>
      </g>

      {/* Dotted travel path */}
      <motion.path
        d="M 70 80 C 100 36, 150 36, 184 78"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="4 6"
        strokeLinecap="round"
        opacity={0.5}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease, delay: 0.3 }}
      />

      {/* The travelling bill */}
      <motion.g
        initial={{ x: -36, y: 0, opacity: 0 }}
        animate={{ x: [-36, 30, 110], y: [0, -38, -34], opacity: [0, 1, 1] }}
        transition={{ duration: 1.8, ease: 'easeInOut', delay: 0.5 }}
      >
        <rect x={86} y={66} width={30} height={38} rx={1.5} stroke="currentColor" strokeWidth={2} className="fill-background" />
        <DocLines x={91} y={75} width={20} count={3} />
      </motion.g>
    </svg>
  );
}

// ── Stage 6: Signed (or vetoed) — the signature draws itself ────────────────

export function SignedIllustration() {
  return (
    <svg viewBox={VIEWBOX} fill="none" className="w-full h-auto" aria-hidden="true">
      {/* The bill, now on the President's desk */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
      >
        <rect x={64} y={22} width={112} height={146} rx={2} stroke="currentColor" strokeWidth={2} className="fill-background" />
        <DocLines x={78} y={42} width={84} count={6} />
        {/* signature line */}
        <line x1={78} y1={140} x2={162} y2={140} stroke="currentColor" strokeWidth={1.5} opacity={0.5} />
        <text x={78} y={154} fontSize={8} letterSpacing={1} className="fill-current font-mono" opacity={0.5}>
          THE PRESIDENT
        </text>
      </motion.g>

      {/* The signature draws itself in accent ink */}
      <motion.path
        d="M 82 134 C 86 120, 90 140, 96 128 C 102 116, 104 140, 112 128 C 118 119, 120 138, 128 127 C 136 116, 138 137, 148 126 C 152 121, 156 130, 160 124"
        className="stroke-accent"
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: 'easeInOut', delay: 0.8 }}
      />

      {/* Ten-day clock note */}
      <motion.g
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 2.3, duration: 0.4, ease: 'backOut' }}
        style={{ transformOrigin: '196px 48px' }}
      >
        <circle cx={196} cy={48} r={20} stroke="currentColor" strokeWidth={2} className="fill-background" />
        <line x1={196} y1={48} x2={196} y2={36} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <line x1={196} y1={48} x2={204} y2={52} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <text x={196} y={82} textAnchor="middle" fontSize={8} letterSpacing={1} className="fill-current font-mono" opacity={0.6}>
          10 DAYS
        </text>
      </motion.g>
    </svg>
  );
}

// ── Stage 7: It becomes law — the seal comes down ────────────────────────────

export function LawIllustration() {
  return (
    <svg viewBox={VIEWBOX} fill="none" className="w-full h-auto" aria-hidden="true">
      {/* The finished act */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <rect x={70} y={26} width={100} height={130} rx={2} stroke="currentColor" strokeWidth={2} className="fill-background" />
        <DocLines x={84} y={44} width={72} count={5} />
        <text x={120} y={120} textAnchor="middle" fontSize={9} letterSpacing={1.5} className="fill-current font-mono font-bold">
          PUBLIC LAW
        </text>
        <text x={120} y={134} textAnchor="middle" fontSize={9} letterSpacing={1.5} className="fill-current font-mono" opacity={0.6}>
          No. 119–42
        </text>
      </motion.g>

      {/* The seal stamps down */}
      <motion.g
        initial={{ opacity: 0, scale: 2.4, rotate: -30 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 0.8, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ transformOrigin: '162px 142px' }}
      >
        <circle cx={162} cy={142} r={26} className="stroke-status-law fill-background" strokeWidth={2.5} />
        <circle cx={162} cy={142} r={19} className="stroke-status-law" strokeWidth={1.25} fill="none" />
        {/* star */}
        <path
          d="M 162 130 L 165 138 L 174 138 L 167 143 L 170 152 L 162 146 L 154 152 L 157 143 L 150 138 L 159 138 Z"
          className="fill-status-law"
        />
      </motion.g>

      {/* Celebration rays */}
      <motion.g
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0.7], scale: 1 }}
        transition={{ delay: 1.3, duration: 0.7 }}
        style={{ transformOrigin: '120px 90px' }}
      >
        {[
          'M 48 40 L 38 30',
          'M 192 40 L 202 30',
          'M 40 100 L 28 100',
          'M 200 100 L 212 100',
          'M 48 160 L 38 170',
          'M 56 22 L 50 12',
          'M 184 22 L 190 12',
        ].map((d, i) => (
          <path key={i} d={d} className="stroke-status-law" strokeWidth={2.5} strokeLinecap="round" />
        ))}
      </motion.g>
    </svg>
  );
}
