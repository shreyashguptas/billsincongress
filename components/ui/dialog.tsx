"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Same scrim as Sheet: paper at 85%, no blur (brand.md, "Dialog, Sheet").
      "fixed inset-0 z-50 bg-background/85 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Drop the built-in corner close button when the dialog supplies its own (as `Sheet` does). */
  hideClose?: boolean
  /**
   * Classes for the scrolling body inside the frame: padding, gap, layout.
   * `className` sizes and colours the frame itself.
   */
  bodyClassName?: string
}

/*
 * Brand edits (documentation/brand.md, "Dialog, Sheet"):
 *
 *  - Two layers. The frame (Radix Content, `className`) is fixed, never taller
 *    than the screen less a 1rem margin all round, and never scrolls; the body
 *    inside it (`bodyClassName`) does. So the close button, which sits on the
 *    frame, stays in its corner however far a long dialog is scrolled — it used
 *    to scroll away with the content on a phone.
 *  - Centred with `inset-0 m-auto h-fit`, not translate(-50%, -50%), so the
 *    frame lands on whole pixels (a half-pixel translate blurs text on 1x
 *    screens) and its enter/exit animation owns `transform` outright.
 *  - Always a card with a 1rem gutter and rounded corners, phones included;
 *    shadcn's default was a full-bleed square slab below `sm`.
 *  - Enter: a short rise and fade, 200ms. Exit: 140ms. Reduced motion cuts both.
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, bodyClassName, children, hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-lg border bg-popover shadow-float focus:outline-hidden",
        "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
        className
      )}
      {...props}
    >
      <div className={cn("grid min-h-0 gap-4 overflow-y-auto overscroll-contain p-6", bodyClassName)}>
        {children}
      </div>
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none touchable:h-11 touchable:w-11">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      // Brand: dialog titles are panel titles (Newsreader, display-sm), not shadcn's bold sans.
      "font-serif text-display-sm font-medium text-foreground",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
