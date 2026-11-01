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
  /**
   * Which edge of the trigger the popover lines up with. `end` for a trigger at
   * the right of the bar (All filters), so the popover opens leftward, into the
   * page, instead of over whatever sits to its right. Left unset, a popover
   * starts at the trigger's left edge unless that would run it off the window.
   */
  align?: 'start' | 'end';
}

/** The shortest list worth showing under a pill: 15rem. */
const MIN_POPOVER_PX = 15 * 16;

/** The default popover width (22rem) plus the 12px collision padding. */
const POPOVER_ROOM_PX = 22 * 16 + 12;

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
  align,
}: AdaptiveSurfaceProps) {
  const live = useSurfaceMode();
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<SurfaceMode>('touch');
  const [autoAlign, setAutoAlign] = useState<'start' | 'end'>('start');
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');
  const triggerId = useId();

  const handleOpenChange = (next: boolean) => {
    const resolved = next ? (live ?? 'touch') : layout;
    if (next) {
      setLayout(resolved);
      // Collision avoidance is off (below), so nothing else would stop a pill
      // near the right of a narrow window from opening a popover off screen.
      const rect = document.getElementById(triggerId)?.getBoundingClientRect();
      setAutoAlign(rect && rect.left + POPOVER_ROOM_PX > window.innerWidth ? 'end' : 'start');
      // Below by default, decided once at open. Only when the room under the
      // pill is less than a usable list (15rem) and there is more above does it
      // open upward — on a short laptop window, not on a 1280x800 one.
      if (rect) {
        const below = window.innerHeight - rect.bottom;
        setSide(below < MIN_POPOVER_PX && rect.top > below ? 'top' : 'bottom');
      }
    }
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

  /**
   * Focus on open, once the shell's focus scope is listening.
   *
   * The body marks the element that should take focus with `data-autofocus`
   * (option-list.tsx explains which one, and why it differs by input). It used
   * to focus it from its own mount effect, which runs BEFORE the shell's focus
   * scope starts: the scope never saw focus arrive, had nothing to hand it back
   * to, and Tab walked straight out of the bottom sheet onto the page behind.
   * With no marked element, the shell's default (the first tabbable) stands.
   */
  const focusMarked = (e: Event) => {
    const content = e.currentTarget as HTMLElement | null;
    const target = content?.querySelector<HTMLElement>('[data-autofocus]');
    if (!target) return;
    e.preventDefault();
    target.focus({ preventScroll: true });
  };

  return (
    <>
      <Popover open={open && layout === 'pointer'} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{anchoredTrigger}</PopoverTrigger>
        <PopoverContent
          // Below the bar unless there is genuinely no room (see handleOpenChange).
          // Radix's own collision check measured the list at full height before
          // the max height applied, found no room, and flipped it up over the
          // site header on a 1280x800 laptop. The max height fits it to the room
          // on whichever side it opens.
          side={side}
          avoidCollisions={false}
          align={align ?? autoAlign}
          className={cn(
            'flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw_-_2rem))] flex-col overflow-hidden p-0',
            popoverClassName
          )}
          onOpenAutoFocus={focusMarked}
          // Suppressed here and handled by the effect above; the default would
          // fight it and land on <body>.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Not gated on `open`: Radix keeps the content mounted while its exit
              animation runs and unmounts it after, so gating here played the
              close animation on an empty box. */}
          {layout === 'pointer' && children({ layout: 'pointer', close })}
        </PopoverContent>
      </Popover>

      <Sheet open={open && layout === 'touch'} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          hideClose
          // The sheet draws its own grab bar, first thing in it, and drags from
          // it (finger or mouse) to close.
          grabber
          // Deliberately unnamed here: the body renders a real dialog title (see
          // option-list.tsx), and an aria-label on the content would override it.
          // From `sm` up (an iPad, a touchscreen laptop) a full-width slab reads
          // as a mistake: it floats as a card a phone's width and a half wide,
          // just above the bottom edge.
          className={cn(
            'flex flex-col gap-0 rounded-t-lg border-line bg-raised p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
            'sm:inset-x-3 sm:bottom-3 sm:mx-auto sm:max-h-[calc(85dvh_-_0.75rem)] sm:max-w-[36rem] sm:rounded-lg sm:border sm:pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          )}
          onOpenAutoFocus={focusMarked}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {layout === 'touch' && children({ layout: 'touch', close })}
        </SheetContent>
      </Sheet>
    </>
  );
}
