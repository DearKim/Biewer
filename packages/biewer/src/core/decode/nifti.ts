// NIfTI-1 decoder (from scratch). Handles the .nii header + voxel data and
// slices the volume along a chosen axis into a FrameSource.
//
// Two display corrections are applied per slice so that all three axes look
// right regardless of voxel anisotropy or storage sign:
//
//  1. Anisotropic aspect. A plane's two in-plane physical extents (dim * spacing)
//     rarely match its voxel-count aspect when spacing is non-isotropic. Each
//     plane is resampled (nearest-neighbour) onto a grid of ~square physical
//     pixels of size min(sx,sy,sz), so the returned width/height already encode
//     the true physical aspect. The renderer only contain-fits by pixel count,
//     so baking the aspect into the pixel dims is the cheapest correct fix.
//
//  2. Orientation. The sform (srow_*) affine, else the qform quaternion, else a
//     RAS+ fallback, tells us which world axis (R/A/S) each voxel axis points
//     along and with what sign. From that we mirror rows/cols so every axis is
//     shown with a consistent, anatomically sensible convention (see the per-axis
//     geometry in volumeFrameSource): axial is anterior-up with patient-right on
//     the right; coronal and sagittal are superior-up; sagittal puts anterior on
//     the left. We assume the volume is stored roughly axis-aligned (i~L/R, j~A/P,
//     k~I/S), true for MNI152 and typical brain NIfTI; we do NOT reslice
//     arbitrarily-permuted or oblique volumes (best-effort — such volumes keep
//     their natural in-plane order).
import type { BiewerDecoder, FrameSource, FramePixels, PixelType, VolumeAxis, VolumeData } from '../types';

/** Expose the parsed volume (for MPR / MIP / 3D rendering). */
export function niftiVolume(bytes: Uint8Array): VolumeData {
  const v = parseNifti(bytes);
  let min = Infinity, max = -Infinity;
  const d = v.data;
  for (let i = 0; i < d.length; i++) { const x = d[i]; if (x < min) min = x; if (x > max) max = x; }
  return { dims: [v.nx, v.ny, v.nz], spacing: v.spacing, pixelType: v.pixelType, data: v.data, min, max, format: 'nifti' };
}

type TypedCtor = Uint8ArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Float32ArrayConstructor;

/** Per voxel-axis dominant world mapping in RAS+ world (0=X/Right, 1=Y/Anterior, 2=Z/Superior). */
export interface Orient {
  /** for voxel axes [i, j, k]: index of the dominant world axis */
  worldAxis: [number, number, number];
  /** for voxel axes [i, j, k]: +1 if +voxel steps toward +world, else -1 */
  sign: [number, number, number];
}

export interface Vol {
  data: Uint8Array | Int16Array | Uint16Array | Float32Array;
  nx: number; ny: number; nz: number;
  spacing: [number, number, number];
  pixelType: PixelType;
  /** voxel->world orientation; absent means "assume RAS+ identity". */
  orient?: Orient;
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
    64: [Float32Array, 'float32', 8], // float64 → float32
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
  } else if (datatype === 64) {
    // float64 → float32 (display precision). Like float32, native-endian read only.
    const src = new Float64Array(bytes.buffer.slice(bytes.byteOffset + voxOffset, bytes.byteOffset + voxOffset + n * 8));
    data = Float32Array.from(src);
  } else {
    // copy into an aligned buffer (byteOffset may be unaligned for typed arrays)
    const slice = bytes.buffer.slice(bytes.byteOffset + voxOffset, bytes.byteOffset + voxOffset + n * bpv);
    data = new (Ctor as Uint16ArrayConstructor)(slice) as Vol['data'];
    if (!le && bpv === 2) swap16(data as Uint16Array);
  }
  return { data, nx, ny, nz, spacing: [sx, sy, sz], pixelType, orient: readOrient(i16, f32) };
}

/**
 * Derive voxel->world orientation from the header, preferring sform (srow_*),
 * then qform (quaternion), then a RAS+ identity fallback. We only need each
 * voxel axis's dominant world axis and sign (positive spacing never flips it).
 */
function readOrient(i16: (o: number) => number, f32: (o: number) => number): Orient {
  const qformCode = i16(252);
  const sformCode = i16(254);
  // m[r][c] = world component r contributed by a unit step along voxel axis c
  let m: number[][] | null = null;
  if (sformCode > 0) {
    m = [
      [f32(280), f32(284), f32(288)], // srow_x
      [f32(296), f32(300), f32(304)], // srow_y
      [f32(312), f32(316), f32(320)], // srow_z
    ];
  } else if (qformCode > 0) {
    const b = f32(256), c = f32(260), d = f32(264);
    const a = Math.sqrt(Math.max(0, 1 - (b * b + c * c + d * d)));
    const qfac = f32(76) < 0 ? -1 : 1; // pixdim[0]
    // R = quaternion rotation; z column carries qfac. Spacing is positive so only signs matter.
    m = [
      [a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c) * qfac],
      [2 * (b * c + a * d), a * a + c * c - b * b - d * d, 2 * (c * d - a * b) * qfac],
      [2 * (b * d - a * c), 2 * (c * d + a * b), (a * a + d * d - b * b - c * c) * qfac],
    ];
  }
  if (!m) return { worldAxis: [0, 1, 2], sign: [1, 1, 1] };
  const worldAxis: [number, number, number] = [0, 1, 2];
  const sign: [number, number, number] = [1, 1, 1];
  for (let c = 0; c < 3; c++) {
    let best = 0, bestAbs = -1;
    for (let r = 0; r < 3; r++) {
      const v = Math.abs(m[r][c]);
      if (v > bestAbs) { bestAbs = v; best = r; }
    }
    worldAxis[c] = best;
    sign[c] = m[best][c] < 0 ? -1 : 1;
  }
  return { worldAxis, sign };
}

function swap16(a: Uint16Array | Int16Array): void {
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    a[i] = ((v & 0xff) << 8) | ((v >> 8) & 0xff);
  }
}

/** Cap on either output dimension after resampling, to bound allocation. */
const MAX_OUT_DIM = 1024;

interface AxisGeom {
  frameCount: number;
  /** source in-plane columns / rows (before any flip) */
  srcW: number; srcH: number;
  /** in-plane physical extents (mm): width, height */
  wExt: number; hExt: number;
  /** voxel axis feeding columns / rows (0=i,1=j,2=k) */
  hAxis: number; vAxis: number;
  /** target world axis+sign for screen-right and screen-up (RAS+) */
  rAxis: number; rSign: 1 | -1;
  uAxis: number; uSign: 1 | -1;
  /** data linear index = idx*baseMul + row*rowStride + col*colStride */
  baseMul: number; colStride: number; rowStride: number;
}

export function volumeFrameSource(vol: Vol, format: string, axis: VolumeAxis): FrameSource {
  const { data, nx, ny, nz, spacing, pixelType } = vol;
  const orient = vol.orient ?? { worldAxis: [0, 1, 2] as [number, number, number], sign: [1, 1, 1] as [number, number, number] };
  const useAxis: Exclude<VolumeAxis, 'native'> = axis === 'native' ? 'axial' : axis;

  // positive spacing magnitudes for extents / output pixel size
  const asx = Math.abs(spacing[0]) || 1, asy = Math.abs(spacing[1]) || 1, asz = Math.abs(spacing[2]) || 1;
  const outSpacing = Math.min(asx, asy, asz);
  const nxny = nx * ny;

  let g: AxisGeom;
  if (useAxis === 'sagittal') {
    // i fixed. columns = j (A/P), rows = k (I/S). anterior to the left, superior up.
    g = {
      frameCount: nx, srcW: ny, srcH: nz, wExt: ny * asy, hExt: nz * asz,
      hAxis: 1, vAxis: 2, rAxis: 1, rSign: -1, uAxis: 2, uSign: 1,
      baseMul: 1, colStride: nx, rowStride: nxny,
    };
  } else if (useAxis === 'coronal') {
    // j fixed. columns = i (L/R), rows = k (I/S). patient-right right, superior up.
    g = {
      frameCount: ny, srcW: nx, srcH: nz, wExt: nx * asx, hExt: nz * asz,
      hAxis: 0, vAxis: 2, rAxis: 0, rSign: 1, uAxis: 2, uSign: 1,
      baseMul: nx, colStride: 1, rowStride: nxny,
    };
  } else {
    // axial (native). k fixed. columns = i (L/R), rows = j (A/P). patient-right right, anterior up.
    g = {
      frameCount: nz, srcW: nx, srcH: ny, wExt: nx * asx, hExt: ny * asy,
      hAxis: 0, vAxis: 1, rAxis: 0, rSign: 1, uAxis: 1, uSign: 1,
      baseMul: nxny, colStride: 1, rowStride: nx,
    };
  }

  // Mirror an in-plane axis when its natural increasing direction disagrees with
  // the target. If the storage isn't axis-aligned to the expected world axis we
  // leave it unflipped (best-effort). Columns increase toward rSign; rows go DOWN
  // the screen, so they must increase away from uSign.
  const flipH = orient.worldAxis[g.hAxis] === g.rAxis && orient.sign[g.hAxis] !== g.rSign;
  const flipV = orient.worldAxis[g.vAxis] === g.uAxis && orient.sign[g.vAxis] === g.uSign;

  // Resample onto ~square physical pixels; preserve aspect if we hit the cap.
  let outW = Math.max(1, Math.round(g.wExt / outSpacing));
  let outH = Math.max(1, Math.round(g.hExt / outSpacing));
  const mx = Math.max(outW, outH);
  if (mx > MAX_OUT_DIM) {
    const s = MAX_OUT_DIM / mx;
    outW = Math.max(1, Math.round(outW * s));
    outH = Math.max(1, Math.round(outH * s));
  }

  const frameSize = { width: outW, height: outH };
  const cache = new Map<number, FramePixels>();
  let disposed = false;

  function slice(idx: number): FramePixels {
    const Ctor = data.constructor as new (length: number) => typeof data;
    const out = new Ctor(outW * outH);
    const base = idx * g.baseMul;
    for (let oy = 0; oy < outH; oy++) {
      let sr = ((oy + 0.5) * g.srcH / outH) | 0; // nearest-neighbour (floor of centre)
      if (sr >= g.srcH) sr = g.srcH - 1;
      if (flipV) sr = g.srcH - 1 - sr;
      const rowOff = base + sr * g.rowStride;
      const outRow = oy * outW;
      for (let ox = 0; ox < outW; ox++) {
        let sc = ((ox + 0.5) * g.srcW / outW) | 0;
        if (sc >= g.srcW) sc = g.srcW - 1;
        if (flipH) sc = g.srcW - 1 - sc;
        out[outRow + ox] = data[rowOff + sc * g.colStride];
      }
    }
    return { width: outW, height: outH, pixelType, data: out };
  }

  return {
    frameCount: Math.max(1, g.frameCount),
    frameSize,
    pixelType,
    meta: { format, spacing, dims: [nx, ny, nz], axis: useAxis },
    async getFrame(index) {
      if (disposed) throw new Error('FrameSource disposed');
      const i = Math.max(0, Math.min(g.frameCount - 1, index | 0));
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
