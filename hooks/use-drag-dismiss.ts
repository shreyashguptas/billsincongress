'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Drag a surface off the screen to close it — with a finger, a pen or a mouse.
 *
 * One gesture for every sheet and slide-over on the site (the ask panel, the
 * menu, the filter pickers), so they all feel the same under either input:
 *
 *  - The surface follows the pointer 1:1 in the closing direction and resists
 *    (a quarter of the travel, capped) in the other, so it never tears off the
 *    edge it is attached to.
 *  - Letting go past a distance, or with a quick flick, carries it the rest of
 *    the way out from WHERE IT IS. Anything less eases it back.
 *  - The scrim behind it fades with the distance, so the reader sees the page
 *    coming back before they let go.
 *
 * Nothing re-renders per frame: offsets are written straight to the element's
 * inline style. The drag only begins once the pointer has moved a few pixels
 * along the axis, so a tap on a button inside the grab area is still a click,
 * and a movement that starts across the axis (scrolling a list) is left to the
 * browser.
 *
 * The exit is animated HERE, then `onDismiss` runs. A surface whose own close
 * animation would otherwise replay from its resting position (Radix's exit
 * keyframes start at `transform: none`) is marked `data-swiped`, which
 * globals.css uses to switch that keyframe off — otherwise it would jump back
 * to the top and slide out a second time.
 */
export type DragAxis = 'x' | 'y';

export interface DragDismissOptions {
  /** Axis the surface leaves along. A function is read when a press begins. */
  axis: DragAxis | (() => DragAxis);
  /** +1 if it leaves toward +axis (down, right), -1 toward −axis (up, left). */
  direction: 1 | -1 | (() => 1 | -1);
  /** The element that moves. */
  surface: () => HTMLElement | null;
  /** A scrim to fade with the drag, if there is one. */
  overlay?: () => HTMLElement | null;
  /** Called once the surface is off screen. */
  onDismiss: () => void;
  /**
   * With a mouse, only start from inside this selector (a grab bar or header),
   * so dragging across text still selects it. Fingers and pens may start
   * anywhere the handlers are attached.
   */
  mouseHandle?: string;
  /** Turn the gesture off without unbinding the handlers (e.g. docked panel). */
  enabled?: () => boolean;
}

/** Movement along the axis before it counts as a drag rather than a tap. */
const SLOP_PX = 6;
/** A release faster than this (px/ms) in the closing direction dismisses. */
const FLICK_VELOCITY = 0.45;
const SETTLE_MS = 280;
const EXIT_MS = 200;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

/** Elements a press should activate rather than drag, under a mouse. */
const INTERACTIVE = 'a[href],button,input,textarea,select,[role="button"],[role="option"],[contenteditable="true"]';

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function useDragDismiss(opts: DragDismissOptions) {
  // Latest options without re-binding handlers each render.
  const o = useRef(opts);
  o.current = opts;

  const state = useRef<{
    id: number;
    axis: DragAxis;
    dir: 1 | -1;
    start: number;
    cross: number;
    offset: number;
    size: number;
    dragging: boolean;
    samples: Array<{ t: number; v: number }>;
  } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  // The axis and direction of the gesture in flight (or the last one, for the
  // settle/exit animation that follows it).
  const active = useRef<{ axis: DragAxis; dir: 1 | -1 }>({ axis: 'y', dir: 1 });
  const translate = (px: number) =>
    active.current.axis === 'y' ? `translate3d(0, ${px}px, 0)` : `translate3d(${px}px, 0, 0)`;

  const write = (offset: number, size: number) => {
    const el = o.current.surface();
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = translate(offset * active.current.dir);
    const scrim = o.current.overlay?.();
    if (scrim) {
      scrim.style.transition = 'none';
      scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, offset) / size));
    }
  };

  /** Animate both elements to a target, then run `done` and clear inline styles if asked. */
  const animateTo = (offsetPx: number, ms: number, ease: string, done: () => void, clear: boolean) => {
    const el = o.current.surface();
    const scrim = o.current.overlay?.();
    if (!el) return done();
    const duration = reducedMotion() ? 0 : ms;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(timer);
      cleanup.current = null;
      done();
      if (clear) {
        el.style.transition = '';
        el.style.transform = '';
        if (scrim) {
          scrim.style.transition = '';
          scrim.style.opacity = '';
        }
      }
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'transform') finish();
    };
    el.addEventListener('transitionend', onEnd);
    // transitionend never fires for a zero-length or interrupted transition.
    const timer = setTimeout(finish, duration + 60);
    cleanup.current = finish;
    el.style.transition = `transform ${duration}ms ${ease}`;
    el.style.transform = offsetPx === 0 ? '' : translate(offsetPx * active.current.dir);
    if (scrim) {
      scrim.style.transition = `opacity ${duration}ms ${ease}`;
      scrim.style.opacity = offsetPx === 0 ? '' : '0';
    }
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || state.current) return;
    if (o.current.enabled && !o.current.enabled()) return;
    const target = e.target as HTMLElement;
    if (e.pointerType === 'mouse') {
      if (o.current.mouseHandle && !target.closest(o.current.mouseHandle)) return;
      if (target.closest(INTERACTIVE)) return;
      // Stop the press from starting a text selection under the cursor.
      e.preventDefault();
    }
    const el = o.current.surface();
    if (!el) return;
    cleanup.current?.();
    const rect = el.getBoundingClientRect();
    const axis = typeof o.current.axis === 'function' ? o.current.axis() : o.current.axis;
    const dir = typeof o.current.direction === 'function' ? o.current.direction() : o.current.direction;
    const along = axis === 'y' ? e.clientY : e.clientX;
    const across = axis === 'y' ? e.clientX : e.clientY;
    state.current = {
      id: e.pointerId,
      axis,
      dir,
      start: along,
      cross: across,
      offset: 0,
      size: axis === 'y' ? rect.height : rect.width,
      dragging: false,
      samples: [{ t: e.timeStamp, v: along }],
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const s = state.current;
    if (!s || s.id !== e.pointerId) return;
    const along = s.axis === 'y' ? e.clientY : e.clientX;
    const across = s.axis === 'y' ? e.clientX : e.clientY;
    const raw = (along - s.start) * s.dir;

    if (!s.dragging) {
      const crossMoved = Math.abs(across - s.cross);
      if (Math.abs(raw) < SLOP_PX) {
        // Clearly moving the other way first: that is a scroll, not ours.
        if (crossMoved > SLOP_PX) state.current = null;
        return;
      }
      if (crossMoved > Math.abs(raw)) {
        state.current = null;
        return;
      }
      s.dragging = true;
      active.current = { axis: s.axis, dir: s.dir };
      s.start = along - Math.sign(raw) * SLOP_PX;
      // Capture only now: capturing on press would retarget the click of a
      // button the reader merely tapped.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
      o.current.surface()?.setAttribute('data-dragging', '1');
    }

    const delta = (along - s.start) * s.dir;
    // Rubber band toward the attached edge: a quarter of the travel, capped.
    s.offset = delta >= 0 ? delta : Math.max(-24, delta / 4);
    s.samples.push({ t: e.timeStamp, v: along });
    if (s.samples.length > 5) s.samples.shift();
    write(s.offset, s.size);
  }, []);

  const end = useCallback((e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const s = state.current;
    if (!s || s.id !== e.pointerId) return;
    state.current = null;
    if (!s.dragging) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const el = o.current.surface();
    el?.removeAttribute('data-dragging');

    const first = s.samples[0];
    const last = s.samples[s.samples.length - 1];
    const dt = Math.max(1, last.t - first.t);
    const velocity = ((last.v - first.v) / dt) * s.dir;
    const distance = Math.min(140, Math.max(64, s.size * 0.3));
    const dismiss =
      !cancelled && (s.offset > distance || (velocity > FLICK_VELOCITY && s.offset > SLOP_PX * 2));

    if (dismiss) {
      el?.setAttribute('data-swiped', '');
      o.current.overlay?.()?.setAttribute('data-swiped', '');
      // A flick leaves at the finger's own speed; a slow drag past the line
      // accelerates away over the usual exit time.
      const remaining = s.size + 16 - s.offset;
      const flick = velocity > FLICK_VELOCITY;
      const ms = flick ? Math.min(EXIT_MS + 40, Math.max(120, remaining / velocity)) : EXIT_MS;
      animateTo(s.size + 16, ms, flick ? 'cubic-bezier(0.25, 0.6, 0.5, 1)' : EASE_IN, () => o.current.onDismiss(), false);
    } else {
      animateTo(0, SETTLE_MS, EASE_OUT, () => {}, true);
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => end(e, false), [end]);
  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => end(e, true), [end]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

/**
 * Clear what a finished swipe left on an element (its off-screen transform and
 * the `data-swiped` marker) so the next open starts clean. Call when the
 * surface opens again.
 */
export function resetSwiped(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.removeAttribute('data-swiped');
  el.removeAttribute('data-dragging');
  el.style.transition = '';
  el.style.transform = '';
  el.style.opacity = '';
}
