// Volume abstraction — decode a medical volume (nii/dcm, incl. .nii.gz) ONCE
// into a VolumeData that the 3D renderer (and future MPR/MIP) consumes.
//
// It reuses the full decode pipeline (acquire → sniff → decoder registry) and
// stacks the gray frames of a volumetric FrameSource into a single grid. This
// keeps every format path (gz unwrap, DICOM multiframe, NIfTI) uniform without
// duplicating any decoder internals. Non-volumetric / rgba sources are rejected
// (3D rendering needs a scalar volume).
import type { BiewerSource, BiewerProgress, VolumeAxis, VolumeData, FrameSource } from './types';
import { acquire } from './format/acquire';
import { sniff } from './format/sniff';
import { resolveDecoder } from './decode/registry';
import { registerBuiltins } from './decode/builtins';

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

/** Decode a volumetric source into a single scalar grid for 3D rendering. */
export async function createVolume(source: BiewerSource, opts?: CreateVolumeOptions): Promise<VolumeData> {
  registerBuiltins();
  const { inputs, hint } = await acquire(source, { signal: opts?.signal, onProgress: opts?.onProgress });
  if (inputs.length === 0) throw err('EMPTY_CONTAINER', '입력이 비어 있습니다');
  const head = inputs[0];
  const s = sniff(head.bytes, { filename: head.filename, hint });
  const decoder = resolveDecoder(head.bytes, { filename: head.filename, hint });
  if (!decoder) throw err('UNSUPPORTED_FORMAT', `지원하지 않는 포맷입니다${s.format ? ` (${s.format})` : ''}`);
  const fs = await decoder.decode(head.bytes, {
    format: s.format ?? 'png',
    filename: head.filename,
    signal: opts?.signal,
    axis: 'native' as VolumeAxis,
    extra: inputs.slice(1).map((i) => i.bytes),
  });
  try {
    return await frameSourceToVolume(fs, opts?.maxEdge ?? 192);
  } finally {
    fs.dispose();
  }
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
  return {
    dims: [ow, oh, od],
    spacing: [sp[0] * stride, sp[1] * stride, sp[2] * stride],
    pixelType: 'float32',
    data: out,
    min,
    max,
    format: fs.meta.format,
  };
}
