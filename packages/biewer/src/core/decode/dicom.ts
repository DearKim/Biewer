// DICOM decoder (from scratch) for UNCOMPRESSED transfer syntaxes:
//   1.2.840.10008.1.2   Implicit VR Little Endian
//   1.2.840.10008.1.2.1 Explicit VR Little Endian
// Compressed pixel data (JPEG / JPEG-LS / JPEG2000, transfer syntax .4.xx)
// reports DECODE_FAILED — a from-scratch image codec is out of scope.
import type { BiewerDecoder, FrameSource, FramePixels, PixelType } from '../types';

function decodeErr(message: string): Error {
  const e: Error & { code?: string } = new Error(message);
  e.code = 'DECODE_FAILED';
  return e;
}

export const dicomDecoder: BiewerDecoder = {
  name: 'dicom',
  sniff(bytes, ctx) {
    if (bytes.length >= 132 && String.fromCharCode(bytes[128], bytes[129], bytes[130], bytes[131]) === 'DICM') return true;
    return ctx.hint === 'dicom' || /\.dcm$/i.test(ctx.filename ?? '');
  },
  async decode(bytes) {
    return dicomFrameSource(bytes);
  },
};

interface Tag { group: number; elem: number; vr: string; valueOffset: number; length: number; }

function dicomFrameSource(bytes: Uint8Array): FrameSource {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 132; // skip 128 preamble + "DICM"

  // --- File Meta group (0002) is always Explicit VR LE ---
  let transferSyntax = '1.2.840.10008.1.2.1';
  // read meta group length (0002,0000) then walk meta until group != 2
  while (pos + 8 <= bytes.length) {
    const group = dv.getUint16(pos, true);
    if (group !== 0x0002) break;
    const t = readExplicit(dv, bytes, pos);
    if (t.group === 0x0002 && t.elem === 0x0010) {
      transferSyntax = trimUid(new TextDecoder().decode(bytes.subarray(t.valueOffset, t.valueOffset + t.length)));
    }
    pos = t.valueOffset + t.length;
  }

  const implicit = transferSyntax === '1.2.840.10008.1.2';
  const bigEndian = transferSyntax === '1.2.840.10008.1.2.2';
  if (/^1\.2\.840\.10008\.1\.2\.4\./.test(transferSyntax) || /^1\.2\.840\.10008\.1\.2\.5/.test(transferSyntax)) {
    throw decodeErr(`compressed DICOM (transfer syntax ${transferSyntax}) is not supported`);
  }

  // --- dataset ---
  let rows = 0, cols = 0, bitsAlloc = 16, pixelRep = 0, samples = 1, frames = 1;
  let wc: number | undefined, ww: number | undefined;
  let ps: [number, number] | undefined;
  let pixelOffset = -1, pixelLength = 0;

  const le = !bigEndian;
  while (pos + 8 <= bytes.length) {
    const t = implicit ? readImplicit(dv, pos, le) : readExplicit(dv, bytes, pos, le);
    const { group, elem, valueOffset, length } = t;
    const u16 = () => dv.getUint16(valueOffset, le);
    const ascii = () => new TextDecoder().decode(bytes.subarray(valueOffset, valueOffset + length)).trim();
    if (group === 0x0028) {
      if (elem === 0x0010) rows = u16();
      else if (elem === 0x0011) cols = u16();
      else if (elem === 0x0100) bitsAlloc = u16();
      else if (elem === 0x0103) pixelRep = u16();
      else if (elem === 0x0002) samples = u16();
      else if (elem === 0x0008) frames = parseInt(ascii(), 10) || 1;
      else if (elem === 0x1050) wc = parseFloat(ascii().split('\\')[0]);
      else if (elem === 0x1051) ww = parseFloat(ascii().split('\\')[0]);
      else if (elem === 0x0030) { const p = ascii().split('\\').map(Number); ps = [p[0] || 1, p[1] || 1]; }
    } else if (group === 0x7fe0 && elem === 0x0010) {
      pixelOffset = valueOffset;
      pixelLength = length === 0xffffffff ? bytes.length - valueOffset : length;
      break; // pixel data is last
    }
    if (length === 0xffffffff) { pos = skipUndefinedLength(dv, valueOffset); continue; } // SQ/undefined
    pos = valueOffset + length;
  }

  if (pixelOffset < 0 || !rows || !cols) throw decodeErr('DICOM missing pixel data or dimensions');

  const bytesPerSample = bitsAlloc <= 8 ? 1 : 2;
  const frameLen = rows * cols * samples * bytesPerSample;
  frames = Math.max(1, Math.min(frames, Math.floor(pixelLength / frameLen)));
  const pixelType: PixelType = samples >= 3 ? 'rgba8' : bytesPerSample === 1 ? 'gray8' : 'gray16';

  const cache = new Map<number, FramePixels>();
  let disposed = false;

  function frame(i: number): FramePixels {
    const start = pixelOffset + i * frameLen;
    if (samples >= 3) {
      // RGB → RGBA
      const rgb = bytes.subarray(start, start + rows * cols * 3);
      const rgba = new Uint8ClampedArray(rows * cols * 4);
      for (let p = 0, q = 0; p < rgb.length; p += 3, q += 4) { rgba[q] = rgb[p]; rgba[q + 1] = rgb[p + 1]; rgba[q + 2] = rgb[p + 2]; rgba[q + 3] = 255; }
      return { width: cols, height: rows, pixelType: 'rgba8', data: rgba };
    }
    if (bytesPerSample === 1) {
      return { width: cols, height: rows, pixelType: 'gray8', data: bytes.slice(start, start + frameLen) };
    }
    const slice = bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + start + frameLen);
    const data = pixelRep === 1 ? new Int16Array(slice) : new Uint16Array(slice);
    if (bigEndian) swap16(data);
    return { width: cols, height: rows, pixelType: 'gray16', data };
  }

  return {
    frameCount: frames,
    frameSize: { width: cols, height: rows },
    pixelType,
    meta: {
      format: 'dicom',
      spacing: ps ? [ps[1], ps[0], 1] : undefined,
      defaultWindow: wc != null && ww != null ? { wc, ww } : undefined,
    },
    async getFrame(index) {
      if (disposed) throw new Error('FrameSource disposed');
      const i = Math.max(0, Math.min(frames - 1, index | 0));
      let f = cache.get(i);
      if (!f) { f = frame(i); cache.set(i, f); }
      return f;
    },
    dispose() { disposed = true; cache.clear(); },
  };
}

const EXPLICIT_LONG_VR = new Set(['OB', 'OW', 'OF', 'OL', 'OD', 'SQ', 'UT', 'UN', 'UC', 'UR']);

function readExplicit(dv: DataView, bytes: Uint8Array, pos: number, le = true): Tag {
  const group = dv.getUint16(pos, le);
  const elem = dv.getUint16(pos + 2, le);
  const vr = String.fromCharCode(bytes[pos + 4], bytes[pos + 5]);
  if (EXPLICIT_LONG_VR.has(vr)) {
    const length = dv.getUint32(pos + 8, le);
    return { group, elem, vr, valueOffset: pos + 12, length };
  }
  const length = dv.getUint16(pos + 6, le);
  return { group, elem, vr, valueOffset: pos + 8, length };
}

function readImplicit(dv: DataView, pos: number, le = true): Tag {
  const group = dv.getUint16(pos, le);
  const elem = dv.getUint16(pos + 2, le);
  const length = dv.getUint32(pos + 4, le);
  return { group, elem, vr: '', valueOffset: pos + 8, length };
}

/** Skip an undefined-length (0xFFFFFFFF) item/sequence by scanning to its delimiter. */
function skipUndefinedLength(dv: DataView, from: number): number {
  let p = from;
  const max = dv.byteLength - 8;
  while (p <= max) {
    const g = dv.getUint16(p, true), e = dv.getUint16(p + 2, true);
    if (g === 0xfffe && e === 0xe0dd) return p + 8; // Sequence Delimitation
    p += 2;
  }
  return dv.byteLength;
}

function swap16(a: Uint16Array | Int16Array): void {
  for (let i = 0; i < a.length; i++) { const v = a[i]; a[i] = ((v & 0xff) << 8) | ((v >> 8) & 0xff); }
}
function trimUid(s: string): string { return s.replace(/\0+$/, '').trim(); }
