// Small byte helpers shared by decoders (gz/zip unwrap, typed reads).

/** Inflate a gzip stream using the native DecompressionStream. */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return inflate(bytes, 'gzip');
}

/** Inflate a raw DEFLATE stream (ZIP method 8) using DecompressionStream. */
export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return inflate(bytes, 'deflate-raw');
}

async function inflate(bytes: Uint8Array, format: 'gzip' | 'deflate-raw'): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    const err: Error & { code?: string } = new Error(`${format} not supported in this environment`);
    err.code = 'DECODE_FAILED';
    throw err;
  }
  const ds = new DecompressionStream(format);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Minimal ZIP reader: returns stored/deflated entries (End-of-Central-Directory scan). */
export interface ZipEntry { name: string; bytes: Uint8Array; }

export async function unzip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // find End Of Central Directory (0x06054b50), scanning from the end
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) {
    const err: Error & { code?: string } = new Error('not a zip (no EOCD)');
    err.code = 'DECODE_FAILED';
    throw err;
  }
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true); // central directory offset
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break; // central dir header
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));
    // read local header to find the data start
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    if (!name.endsWith('/')) {
      const data = method === 0 ? raw : await inflateRaw(raw);
      out.push({ name, bytes: data });
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** natural-ish sort for filenames (so image_2 < image_10). */
export function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
