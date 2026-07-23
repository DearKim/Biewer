// Built-in image decoder: png / jpeg / webp / (static) gif.
// Uses the browser-native createImageBitmap. Multi-file input (array source)
// becomes an N-frame stack. Frames decode lazily and are cached.
import type { BiewerDecoder, FrameSource, FramePixels, DecodeContext } from '../types';
import { sniffBytes, sniffExtension } from '../format/sniff';

const IMAGE_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);

export const imageDecoder: BiewerDecoder = {
  name: 'image',
  sniff(bytes, ctx) {
    const byteFmt = sniffBytes(bytes);
    if (byteFmt && IMAGE_FORMATS.has(byteFmt)) return true;
    if (!byteFmt && ctx.hint && IMAGE_FORMATS.has(ctx.hint)) return true;
    if (!byteFmt && ctx.filename) {
      const ext = sniffExtension(ctx.filename);
      if (ext && IMAGE_FORMATS.has(ext)) return true;
    }
    return false;
  },
  async decode(bytes, ctx) {
    // All inputs (this one + ctx.extra) are individual images forming a stack.
    const all = [bytes, ...(ctx.extra ?? [])];
    return createImageStackFrameSource(all, ctx);
  },
};

async function createImageStackFrameSource(images: Uint8Array[], ctx: DecodeContext): Promise<FrameSource> {
  if (images.length === 0) {
    const err: Error & { code?: string } = new Error('no image inputs');
    err.code = 'DECODE_FAILED';
    throw err;
  }

  // Decode the first frame eagerly to learn size; the rest lazily.
  const first = await decodeBitmap(images[0]);
  const width = first.width;
  const height = first.height;

  const cache = new Map<number, ImageBitmap>();
  cache.set(0, first);

  let disposed = false;

  const source: FrameSource = {
    frameCount: images.length,
    frameSize: { width, height },
    pixelType: 'rgba8',
    meta: { format: sniffBytes(images[0]) ?? ctx.format },
    async getFrame(index): Promise<FramePixels> {
      if (disposed) throw new Error('FrameSource disposed');
      const i = clamp(index, 0, images.length - 1);
      let bmp = cache.get(i);
      if (!bmp) {
        bmp = await decodeBitmap(images[i]);
        if (disposed) {
          bmp.close?.();
          throw new Error('FrameSource disposed');
        }
        cache.set(i, bmp);
      }
      return { width: bmp.width, height: bmp.height, pixelType: 'rgba8', data: bmp };
    },
    dispose() {
      disposed = true;
      for (const bmp of cache.values()) bmp.close?.();
      cache.clear();
    },
  };
  return source;
}

async function decodeBitmap(bytes: Uint8Array): Promise<ImageBitmap> {
  const blob = new Blob([bytes as BlobPart]);
  try {
    return await createImageBitmap(blob);
  } catch (cause) {
    const err: Error & { code?: string } = new Error('image decode failed');
    err.code = 'DECODE_FAILED';
    (err as { cause?: unknown }).cause = cause;
    throw err;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
