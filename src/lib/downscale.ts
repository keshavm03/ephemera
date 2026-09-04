import { MAX_PHOTO_BYTES } from './keys';

/**
 * Shrinks an image in the browser before it is uploaded.
 *
 * Phone photos routinely run 4-8MB, well past what fits in a Redis-backed
 * store, so the resize has to happen client-side — it also means the user's
 * upload is small, which matters far more on mobile data than the CPU cost of
 * a canvas draw.
 *
 * Quality is stepped down before dimensions are, because a slightly softer
 * 1600px photo reads better in a chat bubble than a crisp 700px one.
 */

const MAX_EDGE = 1600;
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45];
const MIN_EDGE = 640;

export interface Downscaled {
  blob: Blob;
  width: number;
  height: number;
}

export async function downscaleImage(file: File): Promise<Downscaled> {
  // An animated GIF would lose its animation on a canvas, so it is passed
  // through untouched when it is already small enough.
  if (file.type === 'image/gif') {
    if (file.size <= MAX_PHOTO_BYTES) {
      const size = await imageSize(file);
      return { blob: file, ...size };
    }
    throw new Error(
      `That GIF is ${Math.round(file.size / 1000)}KB. GIFs can't be compressed here — keep them under ${Math.floor(MAX_PHOTO_BYTES / 1000)}KB.`
    );
  }

  const bitmap = await createImageBitmap(file);
  // PNGs with transparency must stay PNG-like; WebP preserves alpha and
  // compresses far better than PNG, so it is the target for everything.
  const type = 'image/webp';

  let maxEdge = MAX_EDGE;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not process that image');
      ctx.drawImage(bitmap, 0, 0, w, h);

      for (const quality of QUALITY_STEPS) {
        const blob = await toBlob(canvas, type, quality);
        if (blob && blob.size <= MAX_PHOTO_BYTES) {
          return { blob, width: w, height: h };
        }
      }

      if (maxEdge <= MIN_EDGE) break;
      maxEdge = Math.max(MIN_EDGE, Math.round(maxEdge * 0.7));
    }
  } finally {
    bitmap.close();
  }

  throw new Error('That image is too detailed to compress — try a smaller one.');
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
