// Canvas 2D renderer. rgba8 frames (image/video) draw directly; gray frames
// (gray8/gray16/float32 — NIfTI/DICOM) convert to RGBA through a CPU
// window/level LUT. (A GPU/WebGL W/L path is a future perf optimization.)
import type { FramePixels, ViewTransformState } from '../types';

export interface Renderer {
  render(frame: FramePixels, t: ViewTransformState): void;
  /** set backing store size from CSS size + dpr */
  resize(cssW: number, cssH: number, dpr: number): void;
  clear(): void;
  canvas: HTMLCanvasElement;
  dispose(): void;
}

export function createCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')!;
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;

  // offscreen scratch for gray→rgba conversion, reused across frames
  let scratch: HTMLCanvasElement | null = null;

  function resize(w: number, h: number, ratio: number): void {
    cssW = Math.max(1, Math.floor(w));
    cssH = Math.max(1, Math.floor(h));
    dpr = ratio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }

  function clear(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function render(frame: FramePixels, t: ViewTransformState): void {
    clear();
    const iw = frame.width;
    const ih = frame.height;
    if (!iw || !ih) return;

    // fit scale so the image fills the view at zoom = 1 (contain)
    const viewW = cssW * dpr;
    const viewH = cssH * dpr;
    const rotated = t.rotation === 90 || t.rotation === 270;
    const contentW = rotated ? ih : iw;
    const contentH = rotated ? iw : ih;
    const fit = Math.min(viewW / contentW, viewH / contentH);
    const scale = fit * t.zoom;

    ctx.save();
    // center + pan (pan is in CSS px → scale by dpr)
    ctx.translate(viewW / 2 + t.pan.x * dpr, viewH / 2 + t.pan.y * dpr);
    if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(scale * (t.flipH ? -1 : 1), scale * (t.flipV ? -1 : 1));
    if (t.inverted) ctx.filter = 'invert(1)';

    const source = toDrawable(frame, t.window);
    ctx.imageSmoothingEnabled = t.zoom < 8; // crisp when heavily zoomed
    ctx.drawImage(source, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
    ctx.filter = 'none';
  }

  function toDrawable(frame: FramePixels, window?: { wc: number; ww: number }): CanvasImageSource {
    if (frame.data instanceof ImageBitmap) return frame.data;
    // gray/rgba typed array → paint into scratch canvas
    if (!scratch) scratch = document.createElement('canvas');
    scratch.width = frame.width;
    scratch.height = frame.height;
    const sctx = scratch.getContext('2d')!;
    const img = sctx.createImageData(frame.width, frame.height);
    fillRgba(img.data, frame, window);
    sctx.putImageData(img, 0, 0);
    return scratch;
  }

  function dispose(): void {
    scratch = null;
  }

  return { render, resize, clear, canvas, dispose };
}

/**
 * Convert a frame's pixel data into RGBA bytes.
 * - rgba8 typed array → copied straight through.
 * - gray (8/16/float) → window/level mapping. With an explicit window {wc,ww}
 *   the standard DICOM ramp is applied (out = (v - (wc-0.5))/(ww-1) + 0.5);
 *   without one, per-frame min/max auto-contrast is used.
 */
function fillRgba(out: Uint8ClampedArray, frame: FramePixels, window?: { wc: number; ww: number }): void {
  const { data } = frame;
  if (data instanceof Uint8ClampedArray && data.length === out.length) {
    out.set(data);
    return;
  }
  const n = frame.width * frame.height;
  if (!(data instanceof Uint8ClampedArray || data instanceof Uint8Array || data instanceof Uint16Array || data instanceof Int16Array || data instanceof Float32Array)) {
    return;
  }
  let lo: number, span: number;
  if (window && window.ww > 0) {
    lo = window.wc - 0.5 - (window.ww - 1) / 2;
    span = window.ww - 1 || 1;
  } else {
    // auto: per-frame min/max
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) { const v = data[i]; if (v < min) min = v; if (v > max) max = v; }
    lo = min; span = (max - min) || 1;
  }
  for (let i = 0; i < n; i++) {
    let g = ((data[i] - lo) / span) * 255;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = g;
    out[o + 3] = 255;
  }
}
