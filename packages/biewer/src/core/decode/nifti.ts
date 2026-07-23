// NIfTI-1 decoder (from scratch). Handles the .nii header + voxel data and
// slices the volume along a chosen axis into a FrameSource.
import type { BiewerDecoder, FrameSource, FramePixels, PixelType, VolumeAxis } from '../types';

type TypedCtor = Uint8ArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Float32ArrayConstructor;

interface Vol {
  data: Uint8Array | Int16Array | Uint16Array | Float32Array;
  nx: number; ny: number; nz: number;
  spacing: [number, number, number];
  pixelType: PixelType;
}

/** NIfTI magic "n+1" or "ni1" at byte 344 (uncompressed .nii). gz is handled upstream. */
function isNifti(bytes: Uint8Array): boolean {
  if (bytes.length < 348) return false;
  const m = String.fromCharCode(bytes[344], bytes[345], bytes[346]);
  return m === 'n+1' || m === 'ni1';
}

export const niftiDecoder: BiewerDecoder = {
  name: 'nifti',
  sniff(bytes, ctx) {
    return isNifti(bytes) || (bytes.length < 348 && (ctx.hint === 'nifti' || /\.nii$/i.test(ctx.filename ?? '')));
  },
  async decode(bytes, ctx) {
    return volumeFrameSource(parseNifti(bytes), 'nifti', ctx.axis ?? 'native');
  },
};

function parseNifti(bytes: Uint8Array): Vol {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // endianness: sizeof_hdr should be 348
  let le = true;
  const sizeofHdr = dv.getInt32(0, true);
  if (sizeofHdr !== 348) {
    const be = dv.getInt32(0, false);
    if (be === 348) le = false;
    else throw decodeErr('not a NIfTI-1 header');
  }
  const i16 = (o: number) => dv.getInt16(o, le);
  const f32 = (o: number) => dv.getFloat32(o, le);
  const nx = i16(42), ny = i16(44), nz = i16(46);
  const datatype = i16(70);
  const sx = f32(80) || 1, sy = f32(84) || 1, sz = f32(88) || 1;
  const voxOffset = Math.round(f32(108)) || 352;

  const n = nx * ny * nz;
  const map: Record<number, [TypedCtor, PixelType, number]> = {
    2: [Uint8Array, 'gray8', 1],
    4: [Int16Array, 'gray16', 2],
    8: [Float32Array, 'float32', 4], // int32 → float32
    16: [Float32Array, 'float32', 4],
    512: [Uint16Array, 'gray16', 2],
    256: [Uint8Array, 'gray8', 1], // int8 → uint8 (display only)
  };
  const entry = map[datatype];
  if (!entry) throw decodeErr(`unsupported NIfTI datatype ${datatype}`);
  const [Ctor, pixelType, bpv] = entry;

  // slice a single volume (first timepoint if 4D)
  const need = voxOffset + n * bpv;
  if (bytes.length < need) throw decodeErr('NIfTI voxel data truncated');

  let data: Vol['data'];
  if (datatype === 8) {
    // int32 → float32
    const src = new Int32Array(bytes.buffer.slice(bytes.byteOffset + voxOffset, bytes.byteOffset + voxOffset + n * 4));
    data = Float32Array.from(src);
  } else {
    // copy into an aligned buffer (byteOffset may be unaligned for typed arrays)
    const slice = bytes.buffer.slice(bytes.byteOffset + voxOffset, bytes.byteOffset + voxOffset + n * bpv);
    data = new (Ctor as Uint16ArrayConstructor)(slice) as Vol['data'];
    if (!le && bpv === 2) swap16(data as Uint16Array);
  }
  return { data, nx, ny, nz, spacing: [sx, sy, sz], pixelType };
}

function swap16(a: Uint16Array | Int16Array): void {
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    a[i] = ((v & 0xff) << 8) | ((v >> 8) & 0xff);
  }
}

export function volumeFrameSource(vol: Vol, format: string, axis: VolumeAxis): FrameSource {
  const { data, nx, ny, nz, spacing, pixelType } = vol;
  const useAxis = axis === 'native' ? 'axial' : axis;
  const frameCount = useAxis === 'sagittal' ? nx : useAxis === 'coronal' ? ny : nz;
  const size = useAxis === 'sagittal' ? { width: ny, height: nz } : useAxis === 'coronal' ? { width: nx, height: nz } : { width: nx, height: ny };
  const cache = new Map<number, FramePixels>();
  let disposed = false;

  function slice(idx: number): FramePixels {
    const plane = size.width * size.height;
    const Ctor = data.constructor as new (n: number) => typeof data;
    let out: typeof data;
    if (useAxis === 'axial') {
      out = data.subarray(idx * nx * ny, idx * nx * ny + plane) as typeof data;
    } else if (useAxis === 'coronal') {
      out = new Ctor(plane);
      for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) out[z * nx + x] = data[z * nx * ny + idx * nx + x];
    } else {
      out = new Ctor(plane);
      for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) out[z * ny + y] = data[z * nx * ny + y * nx + idx];
    }
    return { width: size.width, height: size.height, pixelType, data: out };
  }

  return {
    frameCount: Math.max(1, frameCount),
    frameSize: size,
    pixelType,
    meta: { format, spacing, dims: [nx, ny, nz], axis: useAxis },
    async getFrame(index) {
      if (disposed) throw new Error('FrameSource disposed');
      const i = Math.max(0, Math.min(frameCount - 1, index | 0));
      let f = cache.get(i);
      if (!f) { f = slice(i); cache.set(i, f); }
      return f;
    },
    dispose() { disposed = true; cache.clear(); },
  };
}

function decodeErr(message: string): Error {
  const e: Error & { code?: string } = new Error(message);
  e.code = 'DECODE_FAILED';
  return e;
}
