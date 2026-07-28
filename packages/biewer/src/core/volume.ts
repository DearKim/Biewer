// Volume abstraction — decode a medical volume (nii/dcm, incl. .nii.gz) ONCE
// into a VolumeData that the 3D renderer (and future MPR/MIP) consumes.
//
// It reuses the full decode pipeline (acquire → sniff → decoder registry) and
// stacks the gray frames of a volumetric FrameSource into a single grid. This
// keeps every format path (gz unwrap, DICOM multiframe, NIfTI) uniform without
// duplicating any decoder internals. Non-volumetric / rgba sources are rejected
// (3D rendering needs a scalar volume).
import type { BiewerSource, BiewerProgress, VolumeData, FrameSource } from './types';
import { acquire } from './format/acquire';
import { sniff } from './format/sniff';
import { resolveDecoder } from './decode/registry';
import { registerBuiltins } from './decode/builtins';
import { gunzip, unzip, naturalSort } from './decode/bytes';
import { niftiVolume } from './decode/nifti';
import { dicomVolume, isLikelyDicom } from './decode/dicom';

function err(code: string, message: string): Error {
  const e: Error & { code?: string } = new Error(message);
  e.code = code;
  return e;
}

export interface CreateVolumeOptions {
  signal?: AbortSignal;
  onProgress?: (p: BiewerProgress) => void;
  /** cap the longest volume edge (voxels); larger volumes are strided down. Default 192. */
  maxEdge?: number;
}

/**
 * Decode a volumetric source into a scalar grid for 3D / MPR rendering.
 * Oriented formats (NIfTI, DICOM series) yield the RAW voxel grid + a
 * voxel→world affine so the renderer can reslice anatomically. Other gray
 * volumetric sources fall back to a frame-stacked, axis-aligned grid.
 */
export async function createVolume(source: BiewerSource, opts?: CreateVolumeOptions): Promise<VolumeData> {
  registerBuiltins();
  const maxEdge = opts?.maxEdge ?? 192;
  const { inputs, hint } = await acquire(source, { signal: opts?.signal, onProgress: opts?.onProgress });
  if (inputs.length === 0) throw err('EMPTY_CONTAINER', '입력이 비어 있습니다');
  const head = inputs[0];
  const extra = inputs.slice(1).map((i) => i.bytes);

  const oriented = await orientedVolume(head.bytes, head.filename, hint, extra);
  if (oriented) return downsampleVolume(oriented, maxEdge);

  // fallback: any other gray volumetric FrameSource → axis-aligned grid
  const s = sniff(head.bytes, { filename: head.filename, hint });
  const decoder = resolveDecoder(head.bytes, { filename: head.filename, hint });
  if (!decoder) throw err('UNSUPPORTED_FORMAT', `지원하지 않는 포맷입니다${s.format ? ` (${s.format})` : ''}`);
  const fs = await decoder.decode(head.bytes, {
    format: s.format ?? 'png', filename: head.filename, signal: opts?.signal, extra,
  });
  try {
    return await frameSourceToVolume(fs, maxEdge);
  } finally {
    fs.dispose();
  }
}

/** RAW grid + voxel→world affine for oriented volumes (nii/dcm, incl. gz/zip). */
async function orientedVolume(bytes: Uint8Array, filename: string | undefined, hint: string | undefined, extra: Uint8Array[]): Promise<VolumeData | null> {
  let b = bytes;
  if (b[0] === 0x1f && b[1] === 0x8b) b = await gunzip(b); // .nii.gz
  const s = sniff(b, { filename, hint });
  if (s.format === 'nifti') return niftiVolume(b);
  if (s.format === 'dicom') return dicomVolume([b, ...extra.filter(isLikelyDicom)]);
  if (b[0] === 0x50 && b[1] === 0x4b) { // zip: nii or DICOM series inside
    const entries = (await unzip(b)).sort((a, c) => naturalSort(a.name, c.name));
    const dicoms = entries.filter((e) => isLikelyDicom(e.bytes));
    if (dicoms.length) return dicomVolume(dicoms.map((e) => e.bytes));
    const nii = entries.find((e) => /\.nii(\.gz)?$/i.test(e.name));
    if (nii) { let nb = nii.bytes; if (nb[0] === 0x1f && nb[1] === 0x8b) nb = await gunzip(nb); return niftiVolume(nb); }
  }
  return null;
}

/** Stride a large grid down to maxEdge, scaling the affine's basis columns. */
function downsampleVolume(v: VolumeData, maxEdge: number): VolumeData {
  const [nx, ny, nz] = v.dims;
  const stride = Math.max(1, Math.ceil(Math.max(nx, ny, nz) / maxEdge));
  if (stride === 1) return v;
  const ox = Math.max(1, Math.floor(nx / stride)), oy = Math.max(1, Math.floor(ny / stride)), oz = Math.max(1, Math.floor(nz / stride));
  const Ctor = v.data.constructor as new (n: number) => typeof v.data;
  const out = new Ctor(ox * oy * oz);
  const plane = nx * ny;
  for (let z = 0; z < oz; z++) {
    const sz = Math.min(nz - 1, z * stride);
    for (let y = 0; y < oy; y++) {
      const srow = sz * plane + Math.min(ny - 1, y * stride) * nx;
      const orow = (z * oy + y) * ox;
      for (let x = 0; x < ox; x++) out[orow + x] = v.data[srow + Math.min(nx - 1, x * stride)];
    }
  }
  let M = v.voxelToWorld;
  if (M) { M = new Float32Array(M); for (let c = 0; c < 3; c++) { M[c * 4] *= stride; M[c * 4 + 1] *= stride; M[c * 4 + 2] *= stride; } }
  return {
    dims: [ox, oy, oz],
    spacing: [v.spacing[0] * stride, v.spacing[1] * stride, v.spacing[2] * stride],
    pixelType: v.pixelType, data: out, min: v.min, max: v.max, format: v.format, voxelToWorld: M,
  };
}

/** Stack a gray FrameSource (nii/dcm multiframe) into a scalar VolumeData. */
export async function frameSourceToVolume(fs: FrameSource, maxEdge = 192): Promise<VolumeData> {
  if (fs.pixelType === 'rgba8') throw err('DECODE_FAILED', '3D 렌더는 gray 볼륨만 지원합니다 (rgba 아님)');
  if (fs.frameCount < 2) throw err('DECODE_FAILED', '3D 렌더에는 다중 슬라이스 볼륨이 필요합니다');

  const w = fs.frameSize.width, h = fs.frameSize.height, d = fs.frameCount;
  // integer stride so the largest edge fits maxEdge (keeps aspect via spacing)
  const stride = Math.max(1, Math.ceil(Math.max(w, h, d) / maxEdge));
  const ow = Math.max(1, Math.floor(w / stride));
  const oh = Math.max(1, Math.floor(h / stride));
  const od = Math.max(1, Math.floor(d / stride));

  const out = new Float32Array(ow * oh * od);
  let min = Infinity, max = -Infinity;

  for (let oz = 0; oz < od; oz++) {
    const src = await fs.getFrame(Math.min(d - 1, oz * stride));
    const px = src.data as ArrayLike<number>;
    const base = oz * ow * oh;
    for (let oy = 0; oy < oh; oy++) {
      const sy = Math.min(h - 1, oy * stride);
      const srow = sy * w;
      const orow = base + oy * ow;
      for (let ox = 0; ox < ow; ox++) {
        const v = px[srow + Math.min(w - 1, ox * stride)];
        out[orow + ox] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!isFinite(min)) { min = 0; max = 1; }

  const sp = fs.meta.spacing ?? [1, 1, 1];
  const sx = sp[0] * stride, sy2 = sp[1] * stride, sz = sp[2] * stride;
  // axis-aligned affine (no orientation info) so MPR still works, just not oblique
  const M = new Float32Array([sx, 0, 0, 0, 0, sy2, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]);
  return {
    dims: [ow, oh, od],
    spacing: [sx, sy2, sz],
    pixelType: 'float32',
    data: out,
    min,
    max,
    format: fs.meta.format,
    voxelToWorld: M,
  };
}
