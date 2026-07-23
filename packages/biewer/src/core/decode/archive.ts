// Archive decoder: gz / zip. Unwraps the container and re-detects the inner
// format (spec: "gz → unwrap → re-detect"). A zip of images becomes one stack.
import type { BiewerDecoder, FrameSource, DecodeContext } from '../types';
import { gunzip, unzip, naturalSort } from './bytes';
import { resolveDecoder } from './registry';
import { imageDecoder } from './image';

function decodeErr(code: string, message: string): Error {
  const e: Error & { code?: string } = new Error(message);
  e.code = code;
  return e;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

export const archiveDecoder: BiewerDecoder = {
  name: 'archive',
  sniff(bytes) {
    // gzip: 1f 8b   |   zip: 'PK\x03\x04'
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return true;
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return true;
    return false;
  },
  async decode(bytes, ctx) {
    // --- gzip: single inner stream ---
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const inner = await gunzip(bytes);
      const name = (ctx.filename ?? '').replace(/\.gz$/i, '');
      return dispatch(inner, ctx, name);
    }
    // --- zip: pick supported entries ---
    const entries = (await unzip(bytes)).sort((a, b) => naturalSort(a.name, b.name));
    if (entries.length === 0) throw decodeErr('EMPTY_CONTAINER', 'zip has no entries');
    const images = entries.filter((e) => IMAGE_EXT.test(e.name));
    if (images.length > 0) {
      // an image zip → one N-frame stack
      return imageDecoder.decode(images[0].bytes, { ...ctx, filename: images[0].name, extra: images.slice(1).map((e) => e.bytes) });
    }
    // otherwise dispatch the first supported entry as a single source
    for (const e of entries) {
      const d = resolveDecoder(e.bytes, { filename: e.name });
      if (d && d.name !== 'archive') return d.decode(e.bytes, { ...ctx, filename: e.name });
    }
    throw decodeErr('UNSUPPORTED_FORMAT', 'zip has no supported inner format');
  },
};

async function dispatch(inner: Uint8Array, ctx: DecodeContext, name: string): Promise<FrameSource> {
  const d = resolveDecoder(inner, { filename: name });
  if (!d || d.name === 'archive') throw decodeErr('UNSUPPORTED_FORMAT', `unwrapped content is not a supported format (${name})`);
  return d.decode(inner, { ...ctx, filename: name });
}
