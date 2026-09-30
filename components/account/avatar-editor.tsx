'use client';

import * as React from 'react';
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react';

import {
  clampOffset,
  coverScale,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomAboutCentre,
  type Offset,
} from '@/lib/avatar-image';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';

/** The crop square, in CSS px. Fits a 390px phone inside the dialog's padding. */
const VIEWPORT = 280;
const KEY_STEP = 12;

/**
 * Frame a photo in the avatar circle: drag (or arrow keys) to move it, pinch,
 * scroll or the slider (or +/-) to zoom. `work` is the decoded, already
 * shrunk photo (lib/avatar-image.ts); nothing here touches the original file.
 */
export function AvatarEditor({
  work,
  saving,
  error,
  onCancel,
  onPickAnother,
  onSave,
}: {
  work: HTMLCanvasElement | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onPickAnother: () => void;
  onSave: (frame: { viewport: number; zoom: number; offset: Offset }) => void;
}) {
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState<Offset>({ x: 0, y: 0 });
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{ distance: number; zoom: number } | null>(null);
  const uploadRef = React.useRef<HTMLButtonElement>(null);

  const image = React.useMemo(() => (work ? { w: work.width, h: work.height } : null), [work]);
  // Latest values for the native listeners below, which are bound once.
  const live = React.useRef({ zoom, offset, image });
  live.current = { zoom, offset, image };

  // A new photo starts centred, filling the circle.
  React.useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [work]);

  // Show the working canvas itself: no re-encode, no second copy in memory.
  // Callback refs, because the dialog's content mounts in a portal.
  const holderRef = React.useCallback(
    (holder: HTMLDivElement | null) => {
      if (!holder || !work) return;
      work.setAttribute('aria-hidden', 'true');
      work.className = 'pointer-events-none h-full w-full select-none';
      holder.replaceChildren(work);
    },
    [work],
  );

  const zoomTo = React.useCallback((to: number) => {
    const { zoom: from, offset: o, image: img } = live.current;
    if (!img) return;
    const next = zoomAboutCentre(o, img, VIEWPORT, from, to);
    setZoom(next.zoom);
    setOffset(next.offset);
  }, []);

  const panBy = React.useCallback((dx: number, dy: number) => {
    const { zoom: z, offset: o, image: img } = live.current;
    if (!img) return;
    setOffset(clampOffset({ x: o.x + dx, y: o.y + dy }, img, VIEWPORT, z));
  }, []);

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  const wheelCleanup = React.useRef<(() => void) | null>(null);
  const stageRef = React.useCallback(
    (stage: HTMLDivElement | null) => {
      wheelCleanup.current?.();
      wheelCleanup.current = null;
      if (!stage) return;
      function onWheel(e: WheelEvent) {
        e.preventDefault();
        zoomTo(live.current.zoom * Math.exp(-e.deltaY * 0.0015));
      }
      stage.addEventListener('wheel', onWheel, { passive: false });
      wheelCleanup.current = () => stage.removeEventListener('wheel', onWheel);
    },
    [zoomTo],
  );

  function onPointerDown(e: React.PointerEvent) {
    // Keeps the drag when the pointer leaves the square. Some engines refuse
    // capture for a touch that is already ending; the drag still works without it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance > 0) zoomTo(pinch.current.zoom * (distance / pinch.current.distance));
      return;
    }
    if (pointers.current.size === 1) panBy(next.x - prev.x, next.y - prev.y);
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    if (moves[e.key]) {
      e.preventDefault();
      panBy(...moves[e.key]);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomTo(zoom + 0.1);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomTo(zoom - 0.1);
    }
  }

  const base = image ? coverScale(image, VIEWPORT) : 1;

  return (
    <Dialog open={work !== null} onOpenChange={(open) => !open && !saving && onCancel()}>
      <DialogContent
        // A phone held sideways is shorter than the dialog: it scrolls inside
        // rather than losing its title and buttons off the screen.
        className="max-h-[calc(100dvh-1rem)] max-w-sm gap-5 overflow-y-auto"
        onInteractOutside={(e) => saving && e.preventDefault()}
        // Start on Upload, not the crop area: a keyboard reader tabs back to it.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          uploadRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>Drag to move it. Pinch, scroll or use the slider to zoom.</DialogDescription>
        </DialogHeader>

        <div
          ref={stageRef}
          role="img"
          tabIndex={0}
          aria-label="Photo crop area. Arrow keys move the photo, plus and minus zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className="focus-ring relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-md bg-sunken active:cursor-grabbing"
          style={{ width: VIEWPORT, height: VIEWPORT }}
        >
          {image && (
            <div
              ref={holderRef}
              className="absolute left-1/2 top-1/2"
              style={{
                width: image.w * base,
                height: image.h * base,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
              }}
            />
          )}
          {/* Everything outside the circle is dimmed with the page colour, so the
              circle reads as the avatar in either theme. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full border border-line-strong shadow-[0_0_0_9999px_hsl(var(--paper)/0.72)]"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            onClick={() => zoomTo(zoom - 0.25)}
            disabled={zoom <= MIN_ZOOM}
          >
            <ZoomOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Slider
            aria-label="Zoom"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={[zoom]}
            onValueChange={([z]) => zoomTo(z)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            onClick={() => zoomTo(zoom + 0.25)}
            disabled={zoom >= MAX_ZOOM}
          >
            <ZoomIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" role="alert" className="text-sm">
            {error}
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="link" onClick={onPickAnother} disabled={saving} className="self-center">
            Choose another photo
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="flex-1">
              Cancel
            </Button>
            <Button
              ref={uploadRef}
              type="button"
              onClick={() => onSave({ viewport: VIEWPORT, zoom, offset })}
              disabled={saving || !image}
              className="flex-1"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
