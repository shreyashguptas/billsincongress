'use client';

import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSurfaceMode, type SurfaceMode } from '@/hooks/use-surface-mode';
import { cn } from '@/lib/utils';

export interface AdaptiveSurfaceProps {
  /** The button that opens the surface. Must accept a ref and DOM props. */
  trigger: ReactElement<{ id?: string }>;
  /** Rendered inside whichever shell is chosen. Receives the live layout. */
  children: (args: { layout: SurfaceMode; close: () => void }) => ReactNode;
  /** Called on open and on close, with the shell that was actually used. */
  onOpenChange?: (open: boolean, layout: SurfaceMode) => void;
  /** Width of the popover shell. Ignored on touch. */
  popoverClassName?: string;
}

/**
 * One trigger, two shells: an anchored popover under a mouse, a bottom sheet
 * under a finger. The body is written once and rendered by whichever shell won.
 *
 * Three things here are load-bearing rather than incidental:
 *
 *  - **The trigger always lives inside `<Popover.Root>`,** and is never moved
 *    between the two shells. If it were re-parented when the pointer mode
 *    resolves after hydration, React would destroy and recreate the DOM node,
 *    dropping refs and any keyboard focus on it.
 *  - **`PopoverTrigger asChild`, not `PopoverAnchor`.** Only `Trigger` sets
 *    `aria-expanded` and `aria-controls`, so an anchor would leave a screen
 *    reader with no idea the button opens anything.
 *  - **The mode is latched when the surface opens,** not read live. An iPad
 *    whose trackpad wakes mid-session flips `(hover: hover)`, which would
 *    otherwise unmount an open sheet and remount a popover under the reader's
 *    finger.
 *
 * Focus is managed here rather than left to the shell, because the two shells
 * want different things and the defaults are wrong for both. On close, focus is
 * returned to the trigger explicitly, by id: the element that had focus is
 * inside the content being unmounted, and a removed node takes focus to
 * `<body>` with it, stranding a keyboard reader at the top of the document.
 *
 * The fallback while `useSurfaceMode()` is still null is `touch`, because a
 * bottom sheet is perfectly usable with a mouse while a popover anchored on a
 * phone is not. In practice it is never used: opening requires a user event,
 * which cannot happen before the effect has run.
 */
export function AdaptiveSurface({
  trigger,
  children,
  onOpenChange,
  popoverClassName,
}: AdaptiveSurfaceProps) {
  const live = useSurfaceMode();
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<SurfaceMode>('touch');
  const triggerId = useId();

  const handleOpenChange = (next: boolean) => {
    const resolved = next ? (live ?? 'touch') : layout;
    if (next) setLayout(resolved);
    setOpen(next);
    onOpenChange?.(next, resolved);
  };

  const close = () => handleOpenChange(false);

  /**
   * Put focus back on the pill after the picker closes.
   *
   * This runs in an effect rather than in the shell's `onCloseAutoFocus`
   * because that callback fires BEFORE the content is removed: whatever we
   * focus there is immediately undone when the browser sees the focused node
   * (the listbox, or the search field) leave the document and resets focus to
   * `<body>`. An effect on `open` runs after React has committed the removal,
   * which is the first moment the trigger can actually keep focus.
   *
   * `wasOpen` keeps it from firing on mount, when nothing has closed and focus
   * belongs wherever the reader left it.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    document.getElementById(triggerId)?.focus();
  }, [open, triggerId]);

  const anchoredTrigger = cloneElement(trigger, { id: triggerId });

  return (
    <>
      <Popover open={open && layout === 'pointer'} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{anchoredTrigger}</PopoverTrigger>
        <PopoverContent
          className={cn(
            'flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw_-_2rem))] flex-col overflow-hidden p-0',
            popoverClassName
          )}
          // Suppressed here and handled by the effect above; the default would
          // fight it and land on <body>.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {open && layout === 'pointer' && children({ layout: 'pointer', close })}
        </PopoverContent>
      </Popover>

      <Sheet open={open && layout === 'touch'} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          hideClose
          // Deliberately unnamed here: the body renders a real dialog title (see
          // option-list.tsx), and an aria-label on the content would override it.
          className="flex flex-col gap-0 rounded-t-sm p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {open && layout === 'touch' && children({ layout: 'touch', close })}
        </SheetContent>
      </Sheet>
    </>
  );
}
