import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  BillStages,
  getStageStep,
  isStageOnPath,
  measureStageLabel,
  PATH_LABELS,
  stagePath,
  type BillStage,
} from '@/lib/utils/bill-stages';

/**
 * A bill's stage, drawn the same way everywhere (documentation/brand.md,
 * "StatusPill" and "StageTrack"). Colour is never the only signal: the pill
 * always carries the word, the track always carries "Stage n of N".
 *
 * Each takes the measure's `billType` where it has one, so a resolution is drawn
 * on its own shorter road ("The road a measure travels"). Without it they draw
 * the seven-step road to law.
 */

/** Fill class per stage — the `status-*` tokens. */
const STAGE_FILL: Record<BillStage, string> = {
  [BillStages.INTRODUCED]: 'bg-status-introduced',
  [BillStages.IN_COMMITTEE]: 'bg-status-committee',
  [BillStages.OUT_OF_COMMITTEE]: 'bg-status-out-of-committee',
  [BillStages.PASSED_ONE_CHAMBER]: 'bg-status-passed-one',
  [BillStages.PASSED_BOTH_CHAMBERS]: 'bg-status-passed-both',
  [BillStages.VETOED]: 'bg-status-vetoed',
  [BillStages.TO_PRESIDENT]: 'bg-status-president',
  [BillStages.SIGNED_BY_PRESIDENT]: 'bg-status-signed',
  [BillStages.BECAME_LAW]: 'bg-status-law',
};

/**
 * An unrecognised stage takes neutral ink-3, never a stage's hue: the colour is
 * the stage. So does a stage off the measure's road (a resolution "to President").
 */
export function stageFill(stage: number, billType?: string | null): string {
  if (billType && !isStageOnPath(stage, billType)) return 'bg-ink-3';
  return STAGE_FILL[stage as BillStage] ?? 'bg-ink-3';
}

/** The stage as a dot and a word: an outline `Badge` with the stage's dot. */
export function StatusPill({
  stage,
  billType,
  className,
}: {
  stage: number;
  billType?: string | null;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 whitespace-nowrap', className)}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', stageFill(stage, billType))} aria-hidden="true" />
      {measureStageLabel(stage, billType)}
    </Badge>
  );
}

/** One column per step. Literal class names, so Tailwind keeps all three. */
const GRID_COLS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4', 7: 'grid-cols-7' };

/**
 * Equal segments from introduced to the end of the measure's road: law for a
 * bill, "Agreed to" for a resolution. Reached segments take the current stage's
 * colour; the rest are `sunken`. A vetoed bill fills to "To President" in slate.
 */
export function StageTrack({
  stage,
  billType,
  labels = false,
  size = 'sm',
  className,
}: {
  stage: number;
  /** "hres", "S.Con.Res." … — picks the road. Omitted, the seven-step road to law. */
  billType?: string | null;
  /** The step names underneath — bill pages only. */
  labels?: boolean;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  // An unrecognised stage is step 0, so it fills nothing.
  const { step, total, isVetoed } = getStageStep(stage, billType);
  const fill = stageFill(stage, billType);
  const stepLabels = PATH_LABELS[stagePath(billType)];
  return (
    <div className={className}>
      <div
        className={cn('grid gap-1', GRID_COLS[total])}
        role="img"
        aria-label={
          isVetoed
            ? 'Vetoed — reached the President and did not become law'
            : step
              ? `Stage ${step} of ${total}${step === total ? `: ${stepLabels[total - 1].toLowerCase()}` : ''}`
              : 'Stage unknown'
        }
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn('rounded-xs', size === 'lg' ? 'h-2' : 'h-1.5', i < step ? fill : 'bg-sunken')}
          />
        ))}
      </div>
      {labels && (
        <div
          className={cn('mt-2.5 hidden gap-1 sm:grid', GRID_COLS[total])}
          aria-hidden="true"
        >
          {stepLabels.map((label, i) => (
            <span key={label} className={cn('text-xs font-medium leading-4', i < step ? 'text-ink' : 'text-ink-3')}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
