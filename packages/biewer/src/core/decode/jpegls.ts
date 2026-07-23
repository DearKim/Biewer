// JPEG-LS (ISO/IEC 14495-1 / ITU-T T.87) LOSSLESS decoder, from scratch.
//
// Scope: the profile that medical DICOM JPEG-LS uses in practice —
//   * lossless only (NEAR = 0),
//   * single component / grayscale (Nf = 1),
//   * non-interleaved scan (ILV = 0),
//   * 2..16 bits per sample (8-bit -> Uint8Array, 9..16-bit -> Uint16Array).
// Multi-component, interleave modes 1/2 and near-lossless (NEAR > 0) are rejected
// with a clear error rather than producing wrong pixels.
//
// The implementation follows the LOCO-I procedures of T.87 Annex A: context
// modelling from the three gradients (D1,D2,D3) quantized with thresholds
// T1/T2/T3, median-edge prediction, per-context bias correction, limited-length
// Golomb-Rice coding, and run mode (with run-interruption coding). It has been
// verified byte-exact against the pydicom-data oracle (uncompressed vs JPEG-LS
// copies of the same MR series).

export interface JpegLSResult {
  width: number;
  height: number;
  components: number;
  /** sample precision P declared in the frame header (SOF55). */
  bitsPerSample: number;
  data: Uint8Array | Uint16Array;
}

function decodeErr(message: string): Error {
  const e: Error & { code?: string } = new Error(message);
  e.code = 'DECODE_FAILED';
  return e;
}

// JPEG markers (second byte; all preceded by 0xFF).
const M_SOI = 0xd8;
const M_EOI = 0xd9;
const M_SOF55 = 0xf7; // Start Of Frame, JPEG-LS
const M_LSE = 0xf8; // JPEG-LS preset parameters
const M_SOS = 0xda; // Start Of Scan
const M_TEM = 0x01;

// Run-length order array J[] (T.87 A.2.1, initialization step 3).
const J = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15];

// ---------------------------------------------------------------------------
// Derived-parameter helpers (T.87 A.2.1 / C.2.4.1.1.1)
// ---------------------------------------------------------------------------

/** Smallest x with n <= 2^x. */
function log2Ceiling(n: number): number {
  let x = 0;
  while (n > 1 << x) x++;
  return x;
}

/** RANGE. For NEAR = 0 this is MAXVAL + 1. */
function computeRange(maxval: number, near: number): number {
  return Math.floor((maxval + 2 * near) / (2 * near + 1)) + 1;
}

/** LIMIT — max regular-mode code length before the escape. */
function computeLimit(bpp: number): number {
  return 2 * (bpp + Math.max(8, bpp));
}

/** Initial value for the A[] accumulators (T.87 A.8, step 1.d). */
function initializationValueForA(range: number): number {
  return Math.max(2, (range + 32) >> 6);
}

/** Clamping used by the default-threshold computation (T.87 Figure C.3). */
function clamp(i: number, j: number, maxval: number): number {
  return i > maxval || i < j ? j : i;
}

/** Default T1/T2/T3 when no LSE preset is present (T.87 C.2.4.1.1.1). */
function computeDefaultThresholds(maxval: number, near: number): [number, number, number] {
  const basicT1 = 3;
  const basicT2 = 7;
  const basicT3 = 21;
  if (maxval >= 128) {
    const factor = (Math.min(maxval, 4095) + 128) >> 8;
    const t1 = clamp(factor * (basicT1 - 2) + 2 + 3 * near, near + 1, maxval);
    const t2 = clamp(factor * (basicT2 - 3) + 3 + 5 * near, t1, maxval);
    const t3 = clamp(factor * (basicT3 - 4) + 4 + 7 * near, t2, maxval);
    return [t1, t2, t3];
  }
  const factor = Math.floor(256 / (maxval + 1));
  const t1 = clamp(Math.max(2, Math.floor(basicT1 / factor) + 3 * near), near + 1, maxval);
  const t2 = clamp(Math.max(3, Math.floor(basicT2 / factor) + 5 * near), t1, maxval);
  const t3 = clamp(Math.max(4, Math.floor(basicT3 / factor) + 7 * near), t2, maxval);
  return [t1, t2, t3];
}

/** Median edge detector prediction (T.87 A.4.2). */
function medPredict(ra: number, rb: number, rc: number): number {
  if (rc >= Math.max(ra, rb)) return Math.min(ra, rb);
  if (rc <= Math.min(ra, rb)) return Math.max(ra, rb);
  return ra + rb - rc;
}

// ---------------------------------------------------------------------------
// Big-endian bit reader with JPEG-LS byte de-stuffing (T.87 A.1).
//
// Bits are consumed MSB-first. In the entropy stream, whenever a 0xFF byte is
// data (i.e. the following byte is < 0x80), the top bit of the following byte
// is a stuffed 0 and is skipped. A 0xFF followed by a byte >= 0x80 is a marker,
// where the reader stops (returning zero bits, i.e. the end-of-data padding).
// ---------------------------------------------------------------------------

class BitReader {
  private readonly bytes: Uint8Array;
  private pos: number;
  private readonly end: number;
  private curByte = 0;
  private curBits = 0;
  private prevFF = false;

  constructor(bytes: Uint8Array, start: number, end: number) {
    this.bytes = bytes;
    this.pos = start;
    this.end = end;
  }

  readBit(): number {
    if (this.curBits === 0) {
      if (this.pos >= this.end) return 0;
      const b = this.bytes[this.pos];
      if (b === 0xff) {
        if (this.pos + 1 >= this.end || (this.bytes[this.pos + 1] & 0x80) !== 0) return 0; // marker -> pad zeros
      }
      this.pos++;
      if (this.prevFF) {
        // The byte after a data 0xFF is < 0x80; its MSB is the stuffed bit.
        this.curByte = b & 0x7f;
        this.curBits = 7;
      } else {
        this.curByte = b;
        this.curBits = 8;
      }
      this.prevFF = b === 0xff;
    }
    this.curBits--;
    return (this.curByte >> this.curBits) & 1;
  }

  readValue(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | this.readBit();
    return v;
  }

  /** Count leading zero bits, consuming the terminating 1 bit. */
  readUnary(): number {
    let c = 0;
    while (this.readBit() === 0) {
      c++;
      if (c > 1 << 24) throw decodeErr('JPEG-LS: runaway unary code');
    }
    return c;
  }
}

// ---------------------------------------------------------------------------
// Scan header result
// ---------------------------------------------------------------------------

interface FrameHeader {
  precision: number;
  width: number;
  height: number;
  components: number;
}

interface Preset {
  maxval: number;
  t1: number;
  t2: number;
  t3: number;
  reset: number;
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

class JpegLSDecoder {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;

  // Coding parameters (resolved before the scan).
  private maxval = 0;
  private near = 0;
  private t1 = 0;
  private t2 = 0;
  private t3 = 0;
  private reset = 64;
  private range = 0;
  private qbpp = 0;
  private limit = 0;

  // Regular-mode context state, indexed by |Q| in [0, 364].
  private readonly A = new Int32Array(365);
  private readonly B = new Int32Array(365);
  private readonly C = new Int32Array(365);
  private readonly N = new Int32Array(365);

  // Run-interruption context state. Index 0 -> RItype 0, index 1 -> RItype 1.
  private readonly runA = new Int32Array(2);
  private readonly runN = new Int32Array(2);
  private readonly runNn = new Int32Array(2);
  private runIndex = 0;

  private reader!: BitReader;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  decode(): JpegLSResult {
    const bytes = this.bytes;
    const view = this.view;
    if (bytes.length < 2 || view.getUint16(0, false) !== 0xffd8) throw decodeErr('JPEG-LS: missing SOI marker');

    let frame: FrameHeader | null = null;
    let preset: Preset | null = null;
    let near = 0;
    let interleave = 0;
    let scanStart = -1;

    let p = 2;
    while (p + 2 <= bytes.length) {
      if (bytes[p] !== 0xff) {
        p++;
        continue;
      }
      const marker = bytes[p + 1];
      p += 2;
      if (marker === 0xff) {
        // fill byte, back up one so the next iteration re-reads it as 0xFF
        p--;
        continue;
      }
      if (marker === M_SOI || marker === M_TEM || (marker >= 0xd0 && marker <= 0xd7)) continue; // no length
      if (marker === M_EOI) break;
      if (p + 2 > bytes.length) throw decodeErr('JPEG-LS: truncated marker segment');
      const segLen = view.getUint16(p, false);
      const segStart = p + 2;
      const segEnd = p + segLen;
      if (segLen < 2 || segEnd > bytes.length) throw decodeErr('JPEG-LS: bad segment length');

      if (marker === M_SOF55) {
        frame = {
          precision: bytes[segStart],
          height: view.getUint16(segStart + 1, false),
          width: view.getUint16(segStart + 3, false),
          components: bytes[segStart + 5],
        };
      } else if (marker === M_LSE) {
        if (bytes[segStart] === 1) {
          preset = {
            maxval: view.getUint16(segStart + 1, false),
            t1: view.getUint16(segStart + 3, false),
            t2: view.getUint16(segStart + 5, false),
            t3: view.getUint16(segStart + 7, false),
            reset: view.getUint16(segStart + 9, false),
          };
        }
        // Other LSE IDs (mapping tables, size extension) are not needed here.
      } else if (marker === M_SOS) {
        const ns = bytes[segStart];
        near = bytes[segStart + 1 + ns * 2];
        interleave = bytes[segStart + 2 + ns * 2];
        scanStart = segEnd;
        break;
      }
      p = segEnd;
    }

    if (!frame) throw decodeErr('JPEG-LS: missing SOF55 frame header');
    if (scanStart < 0) throw decodeErr('JPEG-LS: missing SOS scan header');
    if (frame.precision < 2 || frame.precision > 16) {
      throw decodeErr(`JPEG-LS: unsupported precision ${frame.precision}`);
    }
    if (frame.components !== 1 || interleave !== 0) {
      throw decodeErr(`JPEG-LS: only single-component non-interleaved scans are supported (Nf=${frame.components}, ILV=${interleave})`);
    }
    if (near !== 0) throw decodeErr(`JPEG-LS: near-lossless (NEAR=${near}) is not supported`);
    if (!frame.width || !frame.height) throw decodeErr('JPEG-LS: zero frame dimensions');

    this.near = near;
    this.maxval = preset && preset.maxval ? preset.maxval : (1 << frame.precision) - 1;
    this.reset = preset && preset.reset ? preset.reset : 64;
    if (preset && preset.t1) {
      this.t1 = preset.t1;
      this.t2 = preset.t2;
      this.t3 = preset.t3;
    } else {
      [this.t1, this.t2, this.t3] = computeDefaultThresholds(this.maxval, this.near);
    }

    this.range = computeRange(this.maxval, this.near);
    this.qbpp = log2Ceiling(this.range);
    const bpp = Math.max(2, log2Ceiling(this.maxval));
    this.limit = computeLimit(bpp);

    const aInit = initializationValueForA(this.range);
    this.A.fill(aInit);
    this.B.fill(0);
    this.C.fill(0);
    this.N.fill(1);
    this.runA.fill(aInit);
    this.runN.fill(1);
    this.runNn.fill(0);
    this.runIndex = 0;

    this.reader = new BitReader(bytes, scanStart, bytes.length);

    const data = this.decodeScan(frame.width, frame.height);
    return {
      width: frame.width,
      height: frame.height,
      components: 1,
      bitsPerSample: frame.precision,
      data,
    };
  }

  // Gradient quantization (T.87 A.3.3), NEAR = 0.
  private quantize(di: number): number {
    if (di <= -this.t3) return -4;
    if (di <= -this.t2) return -3;
    if (di <= -this.t1) return -2;
    if (di < 0) return -1;
    if (di === 0) return 0;
    if (di < this.t1) return 1;
    if (di < this.t2) return 2;
    if (di < this.t3) return 3;
    return 4;
  }

  private correctPrediction(x: number): number {
    return x < 0 ? 0 : x > this.maxval ? this.maxval : x;
  }

  // Bring a reconstructed value back into [0, MAXVAL] (T.87 A.4.5), NEAR = 0.
  private fixReconstructed(v: number): number {
    if (v < 0) v += this.range;
    else if (v > this.maxval) v -= this.range;
    return this.correctPrediction(v);
  }

  // Decode a limited-length Golomb code into the mapped error value (T.87 A.5.3).
  private decodeMappedError(k: number, limit: number): number {
    const unary = this.reader.readUnary();
    if (unary < limit - this.qbpp - 1) {
      return k === 0 ? unary : (unary << k) + this.reader.readValue(k);
    }
    return this.reader.readValue(this.qbpp) + 1;
  }

  // Map a non-negative coded value back to a signed error (T.87 A.5.2).
  private static unmapError(m: number): number {
    const sign = -(m & 1);
    return sign ^ (m >> 1);
  }

  // Regular-mode sample decode (T.87 A.4-A.6). qs is the signed context id.
  private decodeRegular(qs: number, predicted: number): number {
    const A = this.A;
    const B = this.B;
    const C = this.C;
    const N = this.N;

    const sign = qs < 0 ? -1 : 0;
    const q = qs < 0 ? -qs : qs;

    const cVal = sign === 0 ? C[q] : -C[q];
    const corrected = this.correctPrediction(predicted + cVal);

    let k = 0;
    while (N[q] << k < A[q] && k < 16) k++;

    let err = JpegLSDecoder.unmapError(this.decodeMappedError(k, this.limit));
    if (k === 0) {
      // k == 0 bias correction (T.87 A.5.2 / code segment mapping flip).
      const corr = 2 * B[q] + N[q] - 1 < 0 ? -1 : 0;
      err ^= corr;
    }

    // Update A/B/N and the bias variables B/C (T.87 A.12/A.13).
    A[q] += err < 0 ? -err : err;
    B[q] += err;
    if (N[q] === this.reset) {
      A[q] >>= 1;
      B[q] >>= 1;
      N[q] >>= 1;
    }
    N[q]++;
    if (B[q] + N[q] <= 0) {
      B[q] += N[q];
      if (B[q] <= -N[q]) B[q] = -N[q] + 1;
      if (C[q] > -128) C[q]--;
    } else if (B[q] > 0) {
      B[q] -= N[q];
      if (B[q] > 0) B[q] = 0;
      if (C[q] < 127) C[q]++;
    }

    const errSigned = (sign ^ err) - sign;
    return this.fixReconstructed(corrected + errSigned);
  }

  // Golomb parameter k for a run-interruption context (T.87 A.7.2).
  private runK(idx: number): number {
    const rit = idx; // RItype == context index (0 or 1)
    const temp = this.runA[idx] + (this.runN[idx] >> 1) * rit;
    let nt = this.runN[idx];
    let k = 0;
    while (nt < temp) {
      nt <<= 1;
      k++;
      if (k > 32) throw decodeErr('JPEG-LS: invalid run-interruption k');
    }
    return k;
  }

  // Decode the run-interruption error for context idx (T.87 A.7.2, A.21/A.23).
  private decodeRunInterruptionError(idx: number): number {
    const rit = idx;
    const k = this.runK(idx);
    const em = this.decodeMappedError(k, this.limit - J[this.runIndex] - 1);

    const temp = em + rit;
    const map = temp & 1;
    const errAbs = (temp + map) >> 1;
    const cond = k !== 0 || 2 * this.runNn[idx] >= this.runN[idx] ? 1 : 0;
    const err = cond === map ? -errAbs : errAbs;

    if (err < 0) this.runNn[idx]++;
    this.runA[idx] += (em + 1 - rit) >> 1;
    if (this.runN[idx] === this.reset) {
      this.runA[idx] >>= 1;
      this.runN[idx] >>= 1;
      this.runNn[idx] >>= 1;
    }
    this.runN[idx]++;
    return err;
  }

  private decodeRunInterruptionPixel(ra: number, rb: number): number {
    if (Math.abs(ra - rb) <= this.near) {
      const err = this.decodeRunInterruptionError(1);
      return this.fixReconstructed(ra + err);
    }
    const err = this.decodeRunInterruptionError(0);
    const s = rb - ra < 0 ? -1 : 1;
    return this.fixReconstructed(rb + err * s);
  }

  private decodeScan(width: number, height: number): Uint8Array | Uint16Array {
    const stride = width + 2;
    const buf = new Int32Array(2 * stride); // two padded line buffers, swapped each line
    const out = this.maxval > 255 ? new Uint16Array(width * height) : new Uint8Array(width * height);
    const reader = this.reader;

    for (let line = 0; line < height; line++) {
      let prevOff = 0;
      let curOff = stride;
      if (line & 1) {
        prevOff = stride;
        curOff = 0;
      }

      // Edge pixels (T.87 A.4.1): Rd of the last sample = Rb, Ra of the first = Rb.
      buf[prevOff + width + 1] = buf[prevOff + width];
      buf[curOff] = buf[prevOff + 1];

      let index = 1;
      let rb = buf[prevOff]; // seeds Rc for the first sample
      let rd = buf[prevOff + 1]; // seeds Rb for the first sample
      while (index <= width) {
        const ra = buf[curOff + index - 1];
        const rc = rb;
        rb = rd;
        rd = buf[prevOff + index + 1];

        const qs = (this.quantize(rd - rb) * 9 + this.quantize(rb - rc)) * 9 + this.quantize(rc - ra);
        if (qs !== 0) {
          buf[curOff + index] = this.decodeRegular(qs, medPredict(ra, rb, rc));
          index++;
        } else {
          // Run mode (T.87 A.7). Runs replicate Ra until a differing sample.
          const runVal = buf[curOff + index - 1];
          const pixelCount = width - (index - 1);
          let ri = 0;
          while (reader.readBit()) {
            const seg = 1 << J[this.runIndex];
            const count = Math.min(seg, pixelCount - ri);
            ri += count;
            if (count === seg && this.runIndex < 31) this.runIndex++;
            if (ri === pixelCount) break;
          }
          if (ri !== pixelCount) {
            ri += J[this.runIndex] > 0 ? reader.readValue(J[this.runIndex]) : 0;
          }
          if (ri > pixelCount) throw decodeErr('JPEG-LS: run length overflow');
          for (let i = 0; i < ri; i++) buf[curOff + index + i] = runVal;

          const endIndex = index + ri;
          if (endIndex - 1 === width) {
            index = endIndex; // run reached end of line: no interruption sample
          } else {
            const rbInt = buf[prevOff + endIndex];
            buf[curOff + endIndex] = this.decodeRunInterruptionPixel(runVal, rbInt);
            if (this.runIndex > 0) this.runIndex--;
            index = endIndex + 1;
          }
          rb = buf[prevOff + index - 1];
          rd = buf[prevOff + index];
        }
      }

      const base = line * width;
      for (let x = 0; x < width; x++) out[base + x] = buf[curOff + 1 + x];
    }

    return out;
  }
}

/** Decode a single-component lossless JPEG-LS codestream. */
export function decodeJpegLS(bytes: Uint8Array): JpegLSResult {
  return new JpegLSDecoder(bytes).decode();
}
