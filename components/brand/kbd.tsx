import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * A key on the keyboard, drawn as a small keycap (brand.md, "Components"):
 * mono, ink-2 on paper, a line-strong edge with a heavier bottom so it reads as
 * a key rather than a tag. Ink on paper only — a keycap is chrome, not data.
 *
 * Decorative by default: say the key in words next to it (or in the control's
 * `aria-keyshortcuts`), so a screen reader never hears a lone "slash".
 */
export function Kbd({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      aria-hidden="true"
      {...props}
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[5px] border border-b-2 border-line-strong bg-paper px-1.5',
        'font-mono text-xs font-medium leading-none text-ink-2',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
