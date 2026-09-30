/**
 * Profile photos, prepared in the browser (components/account/avatar-editor.tsx).
 *
 * A phone photo can be 20 MB and 8,000px wide. It is decoded once, shrunk to a
 * working copy no longer than WORK_MAX_PX on its long side, cropped to the
 * circle the reader framed, and encoded as a OUTPUT_PX square WebP (JPEG where
 * the browser cannot encode WebP) — tens of kilobytes. Only that small file
 * leaves the device; convex/avatars.ts rejects anything over 512 KB.
 *
 * The geometry is pure so it can be tested without a browser.
 */

export const OUTPUT_PX = 512;
export const WORK_MAX_PX = 2048;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** Refuse before decoding: a file this big is not a photo anyone meant to pick. */
export const INPUT_MAX_BYTES = 50 * 1024 * 1024;

export interface Size {
  w: number;
  h: number;
}
export interface Offset {
  x: number;
  y: number;
}

/** The scale at zoom 1: the image just covers the square viewport (its short side fills it). */
export function coverScale(image: Size, viewport: number): number {
  return Math.max(viewport / image.w, viewport / image.h);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Keep the image covering the whole viewport: its centre may move from the
 * viewport's centre only as far as the image overhangs on that axis.
 */
export function clampOffset(offset: Offset, image: Size, viewport: number, zoom: number): Offset {
  const scale = coverScale(image, viewport) * zoom;
  const maxX = Math.max(0, (image.w * scale - viewport) / 2);
  const maxY = Math.max(0, (image.h * scale - viewport) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

/**
 * Change zoom keeping the point at the viewport's centre where it is, so
 * zooming in goes towards what the reader is looking at.
 */
export function zoomAboutCentre(
  offset: Offset,
  image: Size,
  viewport: number,
  from: number,
  to: number,
): { zoom: number; offset: Offset } {
  const zoom = clampZoom(to);
  const ratio = zoom / from;
  return { zoom, offset: clampOffset({ x: offset.x * ratio, y: offset.y * ratio }, image, viewport, zoom) };
}

/** The square of the image, in its own pixels, that the viewport shows. */
export function cropRect(image: Size, viewport: number, zoom: number, offset: Offset) {
  const scale = coverScale(image, viewport) * zoom;
  const side = viewport / scale;
  const cx = image.w / 2 - offset.x / scale;
  const cy = image.h / 2 - offset.y / scale;
  return { sx: cx - side / 2, sy: cy - side / 2, side };
}

/** A size scaled down (never up) so its long side is at most `max`. */
export function fitWithin(size: Size, max: number): Size {
  const k = Math.min(1, max / Math.max(size.w, size.h));
  return { w: Math.max(1, Math.round(size.w * k)), h: Math.max(1, Math.round(size.h * k)) };
}

// ---- Browser only below ----

async function decode(file: Blob): Promise<CanvasImageSource & Size & { close?: () => void }> {
  try {
    // Honours the photo's EXIF orientation, so a phone portrait stands upright.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return Object.assign(bitmap, { w: bitmap.width, h: bitmap.height });
  } catch {
    // Older engines: decode through an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return Object.assign(img, { w: img.naturalWidth, h: img.naturalHeight });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Decode `file` into a working canvas no longer than WORK_MAX_PX. The canvas
 * is both what the editor shows and what the crop is cut from. Throws
 * `UnreadableImageError` for anything the browser cannot open (HEIC on a
 * desktop browser, a renamed PDF).
 */
export async function loadWorkingImage(file: File): Promise<HTMLCanvasElement> {
  let source: Awaited<ReturnType<typeof decode>>;
  try {
    source = await decode(file);
  } catch {
    throw new UnreadableImageError();
  }
  if (!source.w || !source.h) throw new UnreadableImageError();
  const size = fitWithin(source, WORK_MAX_PX);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UnreadableImageError();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size.w, size.h);
  source.close?.();
  return canvas;
}

export class UnreadableImageError extends Error {
  constructor() {
    super('UNREADABLE_IMAGE');
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Cut the framed square out of the working image and encode it small. */
export async function renderAvatar(
  work: HTMLCanvasElement,
  viewport: number,
  zoom: number,
  offset: Offset,
): Promise<Blob> {
  const { sx, sy, side } = cropRect({ w: work.width, h: work.height }, viewport, zoom, offset);
  const px = Math.min(OUTPUT_PX, Math.round(side));
  const out = document.createElement('canvas');
  out.width = px;
  out.height = px;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('NO_CANVAS');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(work, sx, sy, side, side, 0, 0, px, px);

  const webp = await toBlob(out, 'image/webp', 0.82);
  // Safari before 17 returns PNG when asked for WebP; send JPEG instead,
  // on white, since JPEG has no transparency.
  if (webp && webp.type === 'image/webp') return webp;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, px, px);
  const jpeg = await toBlob(out, 'image/jpeg', 0.85);
  if (!jpeg) throw new Error('ENCODE_FAILED');
  return jpeg;
}
