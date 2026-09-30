// Getting a reader's picture from their device to convex/feedback.ts.
//
// Every picture is redrawn on a canvas before it leaves the browser. That does
// two jobs: a phone photo or a 5K screenshot shrinks to well under the
// endpoint's 2 MB limit, and whatever the file carried besides pixels (a
// photo's GPS location, the camera, the time it was taken) is left behind.

/** Longest side after shrinking. Enough to read a screenshot's text. */
const MAX_SIDE = 1600;
/** Refused before decoding: larger than any screenshot, and slow to decode on a phone. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
    } catch {
      // Some browsers decode formats (HEIC in Safari) only through <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** The picture as a WebP (or JPEG where WebP cannot be encoded), metadata stripped. */
export async function preparePicture(file: Blob): Promise<Blob> {
  const image = await decode(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    // A transparent screenshot would otherwise turn black in a JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    // A browser that cannot encode WebP silently hands back a PNG instead.
    const webp = await toBlob(canvas, 'image/webp', 0.85);
    if (webp && webp.type === 'image/webp') return webp;
    const jpeg = await toBlob(canvas, 'image/jpeg', 0.85);
    if (!jpeg) throw new Error('could not encode picture');
    return jpeg;
  } finally {
    image.done();
  }
}

/** Where the picture goes: the Convex deployment's HTTP actions (`.convex.site`). */
function endpoint(): string | null {
  const site =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL?.replace('.convex.cloud', '.convex.site');
  return site ? `${site}/feedback/picture` : null;
}

/** Uploads a prepared picture and returns its link. Throws on any failure. */
export async function uploadPicture(picture: Blob): Promise<string> {
  const url = endpoint();
  if (!url) throw new Error('Convex is not configured');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': picture.type },
    body: picture,
  });
  const body = (await response.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
  if (!response.ok || typeof body.url !== 'string') {
    throw new Error(`picture upload failed: ${response.status} ${String(body.error ?? '')}`);
  }
  return body.url;
}
