'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDragDismiss } from '@/hooks/use-drag-dismiss';

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      // bg-background/70, not a foreground tint: --ink is near-white in
      // dark mode, so a foreground scrim would LIGHTEN the page behind the
      // sheet. This also removes the only hard-coded colour in the system.
      // 85%, not 70%, and no blur: over the home page's dark stage a thinner
      // paper scrim read as flat grey, and a backdrop blur is repainted every
      // frame of the slide on older GPUs. Swipe-to-close fades it inline.
      'fixed inset-0 z-50 bg-background/85',
      'data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out',
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

/*
 * Both directions are always specified. Radix keeps the content mounted while
 * its exit animation runs; with only an "open" animation, Presence unmounts
 * immediately and the sheet snaps out of existence.
 *
 * The animation utilities are the `--animate-*` entries in app/globals.css,
 * with their keyframes further down that file. They were written when no
 * enter/exit library was installed and every sheet opened with no transition;
 * tw-animate-css is installed now (for the shadcn/ui components added later),
 * but these are tuned to the sheet's own easing and exit timing, so the sheet
 * keeps them.
 */
const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background p-6 shadow-float',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=open]:animate-sheet-in-top data-[state=closed]:animate-sheet-out-top',
        bottom:
          // Capped so a tall list cannot grow a bottom sheet past the viewport
          // and push its own header off screen.
          'inset-x-0 bottom-0 border-t max-h-[85dvh] overflow-hidden data-[state=open]:animate-sheet-in-bottom data-[state=closed]:animate-sheet-out-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm data-[state=open]:animate-sheet-in-left data-[state=closed]:animate-sheet-out-left',
        right:
          'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * Suppress the built-in corner close button. Set it when the sheet supplies
   * its own close affordance, so the two do not overlap.
   */
  hideClose?: boolean;
  /**
   * Drag to close (default on for left, right and bottom). Fingers and pens can
   * swipe a side sheet from anywhere on it; a mouse drags it from the element
   * marked `data-sheet-grab` (its header row), so selecting text still works.
   * A bottom sheet is dragged from its grab bar only, for every input, because
   * its body scrolls along the same axis.
   */
  swipe?: boolean;
  /** Draw the grab bar at the top of a bottom sheet. */
  grabber?: boolean;
}

const SWIPE: Record<string, { axis: 'x' | 'y'; direction: 1 | -1 } | undefined> = {
  left: { axis: 'x', direction: -1 },
  right: { axis: 'x', direction: 1 },
  bottom: { axis: 'y', direction: 1 },
};

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, hideClose = false, swipe = true, grabber = false, ...props }, ref) => {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const mapping = side ? SWIPE[side] : undefined;
  const drag = useDragDismiss({
    axis: mapping?.axis ?? 'y',
    direction: mapping?.direction ?? 1,
    surface: () => contentRef.current,
    overlay: () => overlayRef.current,
    onDismiss: () => closeRef.current?.click(),
    mouseHandle: '[data-sheet-grab]',
    enabled: () => Boolean(swipe && mapping),
  });
  const bottom = side === 'bottom';

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref]
  );

  // A bottom sheet's body scrolls vertically, so only its grab bar starts a
  // drag. Side sheets take a finger from anywhere (touch-action pan-y below
  // hands vertical scrolling back to the browser).
  const guard = (handler: (e: React.PointerEvent<HTMLElement>) => void) =>
    (e: React.PointerEvent<HTMLElement>) => {
      if (bottom && e.type === 'pointerdown' && !(e.target as HTMLElement).closest('[data-sheet-grab]')) return;
      handler(e);
    };

  return (
    <SheetPortal>
      <SheetOverlay ref={overlayRef} />
      <SheetPrimitive.Content
        ref={setRefs}
        className={cn(
          sheetVariants({ side }),
          swipe && (side === 'left' || side === 'right') && 'touch-pan-y',
          className
        )}
        onPointerDown={swipe && mapping ? guard(drag.onPointerDown) : undefined}
        onPointerMove={swipe && mapping ? drag.onPointerMove : undefined}
        onPointerUp={swipe && mapping ? drag.onPointerUp : undefined}
        onPointerCancel={swipe && mapping ? drag.onPointerCancel : undefined}
        {...props}
      >
        {bottom && grabber && (
          <div
            data-sheet-grab=""
            aria-hidden="true"
            className="flex shrink-0 cursor-grab touch-none justify-center pb-1.5 pt-2.5 active:cursor-grabbing"
          >
            <span className="h-1 w-9 rounded-full bg-line-strong" />
          </div>
        )}
        {children}
        {/* The swipe closes through Radix, so focus return and onOpenChange run as for any close. */}
        <SheetPrimitive.Close ref={closeRef} tabIndex={-1} aria-hidden="true" className="hidden" />
        {!hideClose && (
          <SheetPrimitive.Close className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none touchable:h-11 touchable:w-11">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-2 text-center sm:text-left',
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('font-serif text-display-sm text-foreground', className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
