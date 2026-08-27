import { cn } from '@/lib/utils';

/**
 * A slowly waving American flag, drawn in the site's own palette rather than
 * literal red/white/blue so it reads as part of the page instead of clip art.
 *
 * Purely decorative — no text, no links, nothing to interact with. It exists to
 * close the home page before the footer, and is hidden from assistive tech.
 *
 * All the geometry and colour live in the `.flag*` rules in app/globals.css.
 * This component's only job is to emit the strips the cloth is cut into and
 * hand each one its phase: how far it swings, how steeply it leans, when in the
 * cycle it starts, and where it should come to rest if the visitor has asked
 * for reduced motion.
 */

/** Vertical strips the cloth is cut into. More strips, smoother wave. */
const STRIPS = 60;
/** The canton spans 2/5 of the flag, so it must divide evenly into the strips.
 *  Keep `--cols` on `.flag-canton .flag-strip` in globals.css equal to this. */
const CANTON_STRIPS = (STRIPS * 2) / 5;
/** Full wave cycles visible across the flag at any instant. */
const WAVES = 1.4;
/** Must match `--wave` in globals.css — used to derive per-strip delays. */
const CYCLE_SECONDS = 6.5;
/** Swing at the hoist as a fraction of the swing at the fly end. */
const HOIST_SWING = 0.22;
/** Swing height as a fraction of flag width. Must match `--peak` in
 *  globals.css, which is declared in container units for exactly this reason:
 *  the lean below is derived from this ratio, so it cannot drift by viewport. */
const PEAK_OVER_WIDTH = 0.021;

interface Strip {
  /** Position of this strip, 0 at the hoist. */
  index: number;
  /** Swing multiplier, small at the hoist and full at the fly end. */
  amp: number;
  /**
   * Peak lean, in degrees. Each strip shears by the slope of the wave passing
   * under it, so the strips meet edge to edge instead of stacking into stairs.
   */
  lean: number;
  /** Negative offset into the shared cycle — this is what makes the wave travel. */
  delay: string;
  /** Resting swing and lean when the animation is switched off, in [-1, 1]. */
  rest: number;
  restLean: number;
}

const STRIPS_DATA: Strip[] = Array.from({ length: STRIPS }, (_, index) => {
  // Phase in cycles. Vertical offset runs as -cos, so a strip at phase 0 sits
  // at the top of its swing and perfectly level; its lean is the derivative,
  // a quarter cycle behind. `rest` samples both curves once.
  const phase = (index / STRIPS) * WAVES;
  const amp = HOIST_SWING + (1 - HOIST_SWING) * (index / (STRIPS - 1));
  const lean = Math.atan(amp * 2 * Math.PI * WAVES * PEAK_OVER_WIDTH);
  return {
    index,
    amp: round(amp),
    lean: round((lean * 180) / Math.PI),
    delay: `${round(-phase * CYCLE_SECONDS)}s`,
    rest: round(-Math.cos(2 * Math.PI * phase) * amp),
    restLean: round(Math.sin(2 * Math.PI * phase) * ((lean * 180) / Math.PI)),
  };
});

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function stripStyle(strip: Strip): React.CSSProperties {
  return {
    '--i': strip.index,
    '--amp': strip.amp,
    '--lean': strip.lean,
    '--delay': strip.delay,
    '--rest': strip.rest,
    '--rest-lean': strip.restLean,
  } as React.CSSProperties;
}

export default function WavingFlag({ className }: { className?: string }) {
  return (
    <div className={cn('flag', className)} aria-hidden="true">
      <div className="flag-cloth">
        {STRIPS_DATA.map((strip) => (
          <span key={strip.index} className="flag-strip" style={stripStyle(strip)} />
        ))}
      </div>
      <div className="flag-canton">
        {STRIPS_DATA.slice(0, CANTON_STRIPS).map((strip) => (
          <span key={strip.index} className="flag-strip" style={stripStyle(strip)} />
        ))}
      </div>
    </div>
  );
}
