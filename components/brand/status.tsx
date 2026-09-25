import { cn } from '@/lib/utils';
import {
  BillStages,
  getStageStep,
  isValidStage,
  MAIN_PATH_LABELS,
  stageLabel,
  type BillStage,
} from '@/lib/utils/bill-stages';

/**
 * A bill's stage, drawn the same way everywhere (Documentation/brand.md,
 * "StatusPill" and "StageTrack"). Colour is never the only signal: the pill
 * always carries the word, the track always carries "Stage n of 7".
 */

/** Fill class per stage — the `status-*` tokens. */
const STAGE_FILL: Record<BillStage, string> = {
  [BillStages.INTRODUCED]: 'bg-status-introduced',
  [BillStages.IN_COMMITTEE]: 'bg-status-committee',
  [BillStages.PASSED_ONE_CHAMBER]: 'bg-status-passed-one',
  [BillStages.PASSED_BOTH_CHAMBERS]: 'bg-status-passed-both',
  [BillStages.VETOED]: 'bg-status-vetoed',
  [BillStages.TO_PRESIDENT]: 'bg-status-president',
  [BillStages.SIGNED_BY_PRESIDENT]: 'bg-status-signed',
  [BillStages.BECAME_LAW]: 'bg-status-law',
};

export function stageFill(stage: number): string {
  return STAGE_FILL[stage as BillStage] ?? 'bg-status-introduced';
}

/** The stage as a dot and a word. */
export function StatusPill({ stage, className }: { stage: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-sm border border-line bg-raised px-2 text-[13px] font-medium leading-none text-ink',
        className,
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', stageFill(stage))} aria-hidden="true" />
      {stageLabel(stage)}
    </span>
  );
}

/**
 * Seven equal segments from introduced to law. Reached segments take the
 * current stage's colour; the rest are `sunken`. A vetoed bill fills to "To
 * President" in slate.
 */
export function StageTrack({
  stage,
  labels = false,
  size = 'sm',
  className,
}: {
  stage: number;
  /** The seven step names underneath — bill pages only. */
  labels?: boolean;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const { total, isVetoed } = getStageStep(stage);
  // An unrecognised stage proves nothing, so it fills nothing.
  const step = isValidStage(stage) ? getStageStep(stage).step : 0;
  const fill = stageFill(stage);
  return (
    <div className={className}>
      <div
        className="grid grid-cols-7 gap-1"
        role="img"
        aria-label={
          isVetoed
            ? 'Vetoed — reached the President and did not become law'
            : step
              ? `Stage ${step} of ${total}`
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
        <div className="mt-2.5 hidden grid-cols-7 gap-1 sm:grid" aria-hidden="true">
          {MAIN_PATH_LABELS.map((label, i) => (
            <span key={label} className={cn('text-xs font-medium leading-4', i < step ? 'text-ink' : 'text-ink-3')}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
