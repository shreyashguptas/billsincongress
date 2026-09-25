import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * An eyebrow naming the view, a headline that states the finding, and one
 * action on the right — usually "Ask about this →" (Documentation/brand.md,
 * "SectionHeader"). Write the finding, not the chart type.
 */
export function SectionHeader({
  eyebrow,
  title,
  action,
  finding = false,
  as: Heading = 'h2',
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  /** A headline that states a number takes the larger `display-lg`. */
  finding?: boolean;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 max-w-3xl space-y-3">
        {eyebrow && <p className="label-eyebrow">{eyebrow}</p>}
        <Heading
          className={cn(
            'text-ink',
            finding ? 'text-display-sm sm:text-display-lg' : 'text-display-sm sm:text-display-md',
          )}
        >
          {title}
        </Heading>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/**
 * Where a view's numbers came from and when they were last read. Every chart
 * and page title that shows a count carries one.
 */
export function SourceLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-mono text-xs leading-4 text-ink-3 [&_a]:text-ink-2', className)}>{children}</p>;
}
