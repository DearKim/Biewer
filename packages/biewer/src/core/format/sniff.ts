// Format detection: hint → extension → magic bytes (magic bytes win).
import type { FormatHint, ResolvedFormat } from '../types';

function starts(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, offset: number, str: string): boolean {
  return starts(bytes, [...str].map((c) => c.charCodeAt(0)), offset);
}

/** Detect by magic bytes alone. Returns null if unknown. */
export function sniffBytes(bytes: Uint8Array): ResolvedFormat | null {
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif'; // GIF8
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return 'webp';
  if (starts(bytes, [0x1f, 0x8b])) return 'gzip' as ResolvedFormat; // gz container — caller unwraps
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'zip' as ResolvedFormat;
  if (ascii(bytes, 4, 'ftyp')) return 'mp4';
  if (ascii(bytes, 128, 'DICM')) return 'dicom';
  // NIfTI-1: magic "n+1\0" or "ni1\0" at offset 344. (gz-wrapped nii handled after unwrap.)
  if (ascii(bytes, 344, 'n+1') || ascii(bytes, 344, 'ni1')) return 'nifti';
  return null;
}

const EXT_MAP: Record<string, ResolvedFormat> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  jls: 'jpeg-ls',
  webp: 'webp',
  gif: 'gif',
  nii: 'nifti',
  dcm: 'dicom',
  dicom: 'dicom',
  mp4: 'mp4',
  m4v: 'mp4',
  zip: 'zip' as ResolvedFormat,
  gz: 'gzip' as ResolvedFormat,
};

export function sniffExtension(filename: string): ResolvedFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.nii.gz')) return 'nifti'; // common medical case
  const ext = lower.split('.').pop();
  return ext ? (EXT_MAP[ext] ?? null) : null;
}

export interface SniffResult {
  /** best-guess format */
  format: ResolvedFormat | null;
  /** true if the decision came from magic bytes (most trustworthy) */
  fromBytes: boolean;
  /** true if extension and bytes disagreed */
  conflict: boolean;
}

/** hint → extension → magic bytes; bytes are authoritative. */
export function sniff(bytes: Uint8Array, opts: { filename?: string; hint?: FormatHint }): SniffResult {
  const byteFmt = sniffBytes(bytes);
  const extFmt = opts.filename ? sniffExtension(opts.filename) : null;
  const conflict = !!(byteFmt && extFmt && byteFmt !== extFmt && !(extFmt === 'nifti' && byteFmt === ('gzip' as ResolvedFormat)));

  if (byteFmt) return { format: byteFmt, fromBytes: true, conflict };
  if (opts.hint) return { format: opts.hint, fromBytes: false, conflict: false };
  if (extFmt) return { format: extFmt, fromBytes: false, conflict: false };
  return { format: null, fromBytes: false, conflict: false };
}
