// Video (mp4 / webm) decoder — seek-based frame extraction (decision D12, no
// codec lib). Two entry points:
//   - videoDecoder.decode(bytes): file/buffer sources → same-origin blob URL
//     (drawing frames never taints the canvas).
//   - videoUrlFrameSource(url): url sources → stream the remote file directly
//     with crossOrigin='anonymous' (no full download; large clinical clips work).
// Frames are sampled at a fixed rate; the view's videoStep is a later refinement.
import type { BiewerDecoder, FrameSource, FramePixels } from '../types';

const SAMPLE_FPS = 4;   // frames sampled per second of video
const MAX_FRAMES = 240; // safety cap

function decodeErr(message: string): Error {
  const e: Error & { code?: string } = new Error(message);
  e.code = 'DECODE_FAILED';
  return e;
}

/** shared: given a ready-to-load <video>, wait for metadata then build a
 *  seek-sampling FrameSource. `cleanup` runs on dispose. */
async function buildVideoSource(video: HTMLVideoElement, cleanup: () => void): Promise<FrameSource> {
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(decodeErr('video failed to load'));
  });

  const duration = isFinite(video.duration) ? video.duration : 0;
  const w = video.videoWidth || 2, h = video.videoHeight || 2;
  const frameCount = Math.max(1, Math.min(MAX_FRAMES, Math.round(duration * SAMPLE_FPS) || 1));
  const step = frameCount > 1 ? duration / (frameCount - 1) : 0;

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const cache = new Map<number, FramePixels>();
  let disposed = false;
  let queue: Promise<unknown> = Promise.resolve();

  function seekAndGrab(t: number): Promise<FramePixels> {
    return new Promise<FramePixels>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        if (disposed) return reject(new Error('disposed'));
        ctx.drawImage(video, 0, 0, w, h);
        createImageBitmap(canvas).then(
          (bmp) => resolve({ width: w, height: h, pixelType: 'rgba8', data: bmp }),
          reject,
        );
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = Math.min(Math.max(0, t), Math.max(0, duration - 1e-3));
    });
  }

  return {
    frameCount,
    frameSize: { width: w, height: h },
    pixelType: 'rgba8',
    meta: { format: 'mp4', duration, fps: SAMPLE_FPS },
    async getFrame(index) {
      if (disposed) throw new Error('FrameSource disposed');
      const i = Math.max(0, Math.min(frameCount - 1, index | 0));
      const hit = cache.get(i);
      if (hit) return hit;
      const run = queue.then(() => seekAndGrab(i * step)); // serialize seeks (single playhead)
      queue = run.catch(() => undefined);
      const f = await run;
      cache.set(i, f);
      return f;
    },
    dispose() {
      disposed = true;
      for (const f of cache.values()) if (f.data instanceof ImageBitmap) f.data.close?.();
      cache.clear();
      cleanup();
    },
  } satisfies FrameSource;
}

export const videoDecoder: BiewerDecoder = {
  name: 'mp4',
  sniff(bytes, ctx) {
    if (bytes.length >= 12 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp') return true; // mp4/mov
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true; // webm/mkv EBML
    return ctx.hint === 'mp4' || /\.(mp4|m4v|mov|webm)$/i.test(ctx.filename ?? '');
  },
  async decode(bytes) {
    if (typeof document === 'undefined') throw decodeErr('video decode requires a DOM');
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'video/mp4' }));
    const video = document.createElement('video');
    video.src = url;
    return buildVideoSource(video, () => { video.src = ''; URL.revokeObjectURL(url); });
  },
};

/** Stream a remote video by URL (no full download). Requires the host to send
 *  CORS on the media response so the frame canvas stays untainted. */
export async function videoUrlFrameSource(url: string): Promise<FrameSource> {
  if (typeof document === 'undefined') throw decodeErr('video decode requires a DOM');
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.src = url;
  return buildVideoSource(video, () => { video.src = ''; });
}

/** True if a URL looks like a streamable video (used to pick the streaming path). */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|m4v|mov|webm)(\?|#|$)/i.test(url);
}
