'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_PANEL_PX,
  MIN_PANEL_PX,
  clampPanelWidth,
  isResizable,
  maxPanelWidth,
  savePanelPrefs,
  viewportWidth,
} from '@/lib/ask-panel';
import { analytics } from '@/lib/analytics';

/** How far one arrow key moves the edge, and with Shift held. */
const STEP_PX = 16;
const COARSE_STEP_PX = 64;
/** One analytics event per gesture, not one per frame. */
const REPORT_DELAY_MS = 600;

/**
 * The docked panel's drag edge.
 *
 * Width is written straight to a CSS custom property on <html> inside a single
 * in-flight animation frame — NOT to React state. A `setState` per pointermove
 * would re-render the whole conversation, markdown and all, sixty times a
 * second while the reader drags. React only learns the width when the gesture
 * ends, and only so `aria-valuenow` can report it.
 *
 * The drag is not the only way in, deliberately. A 1px edge is a poor target
 * for switch and voice control, so arrows, Home/End, Enter and a double-click
 * reset all reach the same `commit`.
 */
export function ResizeHandle({ surface }: { surface: string }) {
  const [width, setWidth] = useState(DEFAULT_PANEL_PX);
  const [max, setMax] = useState(MIN_PANEL_PX);
  const [enabled, setEnabled] = useState(false);

  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef(DEFAULT_PANEL_PX);
  const reportRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Width before the last Enter-to-collapse, so the same key restores it. */
  const restoreRef = useRef(DEFAULT_PANEL_PX);

  const read = useCallback(() => {
    const raw = document.documentElement.style.getPropertyValue('--ask-w');
    const px = Number.parseInt(raw, 10);
    return Number.isFinite(px) ? px : DEFAULT_PANEL_PX;
  }, []);

  // The viewport can change under a stored width — a reader moving a window to
  // a smaller display, or rotating a tablet. Re-clamping here is what stops a
  // 640px width taken from a large screen starving the page on a small one.
  useEffect(() => {
    let frame: number | null = null;
    const sync = () => {
      frame = null;
      const vw = viewportWidth();
      setMax(maxPanelWidth(vw));
      setEnabled(isResizable(vw));
      const next = clampPanelWidth(read(), vw);
      document.documentElement.style.setProperty('--ask-w', `${next}px`);
      setWidth(next);
    };
    sync();
    const onResize = () => {
      if (frame === null) frame = requestAnimationFrame(sync);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [read]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (reportRef.current) clearTimeout(reportRef.current);
    },
    [],
  );

  const paint = useCallback((px: number) => {
    pendingRef.current = px;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      document.documentElement.style.setProperty('--ask-w', `${pendingRef.current}px`);
    });
  }, []);

  const commit = useCallback(
    (px: number, method: 'drag' | 'keyboard') => {
      const vw = viewportWidth();
      const next = clampPanelWidth(px, vw);
      document.documentElement.style.setProperty('--ask-w', `${next}px`);
      setWidth(next);
      savePanelPrefs({ widthPx: next });

      if (reportRef.current) clearTimeout(reportRef.current);
      reportRef.current = setTimeout(() => {
        analytics.answerPanelResized({
          surface,
          width_px: next,
          width_pct: Math.round((next / vw) * 100),
          viewport_width: vw,
          method,
        });
      }, REPORT_DELAY_MS);
    },
    [surface],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || e.button !== 0) return;
    e.preventDefault();
    // Pointer capture, not a transparent overlay: it keeps the drag alive over
    // links and past the edge of the window without disabling the document.
    e.currentTarget.setPointerCapture(e.pointerId);
    document.documentElement.dataset.askDrag = '1';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const vw = viewportWidth();
    paint(clampPanelWidth(vw - e.clientX, vw));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    delete document.documentElement.dataset.askDrag;
    commit(pendingRef.current, 'drag');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const step = e.shiftKey ? COARSE_STEP_PX : STEP_PX;
    const current = read();
    let next: number | null = null;

    // Left widens: the panel's edge is being dragged leftward, into the page.
    if (e.key === 'ArrowLeft') next = current + step;
    else if (e.key === 'ArrowRight') next = current - step;
    else if (e.key === 'Home') next = MIN_PANEL_PX;
    else if (e.key === 'End') next = max;
    else if (e.key === 'Enter' || e.key === ' ') {
      next = current > MIN_PANEL_PX ? MIN_PANEL_PX : restoreRef.current;
      if (current > MIN_PANEL_PX) restoreRef.current = current;
    }

    if (next === null) return;
    e.preventDefault();
    commit(next, 'keyboard');
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the ask panel"
      aria-controls="ask-panel"
      aria-valuemin={MIN_PANEL_PX}
      aria-valuemax={max}
      aria-valuenow={width}
      // Pixels mean nothing across a 1440 and a 3840 display; a share of the
      // window is the thing a listener can actually picture.
      aria-valuetext={`${Math.round((width / max) * 100)}% of the available width`}
      aria-disabled={!enabled || undefined}
      tabIndex={enabled ? 0 : -1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={() => {
        delete document.documentElement.dataset.askDrag;
      }}
      onKeyDown={onKeyDown}
      onDoubleClick={() => enabled && commit(DEFAULT_PANEL_PX, 'drag')}
      className={cn(
        'absolute inset-y-0 left-0 z-10 hidden w-px touch-none bg-transparent',
        // Only the docked band can be resized at all; below it the panel width
        // is fixed and an edge that looks draggable would be a lie. The literal
        // matches DOCK_MIN_VIEWPORT_PX rather than Tailwind's `xl` (1280),
        // which is 64px short of where docking actually begins.
        'min-[1344px]:block',
        enabled
          ? 'cursor-col-resize hover:bg-foreground/30 focus-visible:bg-foreground/40'
          : 'pointer-events-none',
        // A 1px line is impossible to hit; a padded pseudo-element widens the
        // target to 20px without widening anything the reader can see.
        'before:absolute before:inset-y-0 before:-left-2.5 before:-right-2.5 before:content-[""]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    />
  );
}
