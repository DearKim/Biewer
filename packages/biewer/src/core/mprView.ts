// createBiewerMPRView — one anatomical plane (axial / coronal / sagittal) of a
// volume, GPU-resliced through the voxel→world affine. Several views share one
// decoded VolumeData and one crosshair controller: clicking a plane sets the
// shared world point (the other planes jump to it), scrolling moves that plane's
// slice along its normal. Radiological display convention.
import type { VolumeData, BiewerError } from './types';
import { type Vec3 } from './render/mat4';
import { createMPRRenderer, volumeWorldBounds, type MPRRenderer, type MPRPlane } from './render/mpr';

export type MPRAxis = 'axial' | 'coronal' | 'sagittal';

/** Shared crosshair: a world point (RAS mm) linking several MPR views. */
export interface MPRCrosshair {
  get(): Vec3;
  set(p: Vec3): void;
  subscribe(fn: (p: Vec3) => void): () => void;
}

export function createMPRCrosshair(initial: Vec3): MPRCrosshair {
  let p: Vec3 = [initial[0], initial[1], initial[2]];
  const subs = new Set<(p: Vec3) => void>();
  return {
    get: () => [p[0], p[1], p[2]],
    set(next) { p = [next[0], next[1], next[2]]; subs.forEach((f) => f([p[0], p[1], p[2]])); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

export interface BiewerMPRViewOptions {
  volume: VolumeData;
  plane: MPRAxis;
  crosshair: MPRCrosshair;
  window?: { lo: number; hi: number };
  invert?: boolean;
  showCrosshair?: boolean;
  onError?: (e: BiewerError) => void;
}

export interface BiewerMPRView {
  setWindow(lo: number, hi: number): void;
  setInvert(b: boolean): void;
  resize(): void;
  dispose(): void;
}

const NORMAL: Record<MPRAxis, Vec3> = { axial: [0, 0, 1], coronal: [0, 1, 0], sagittal: [1, 0, 0] };
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Screen basis (origin/u/v world vectors) for a plane through point P. Radiological:
 *  patient-right on the viewer's left; anterior/superior up. */
function planeGeom(axis: MPRAxis, min: Vec3, max: Vec3, P: Vec3): { origin: Vec3; u: Vec3; v: Vec3 } {
  if (axis === 'axial') {
    return { origin: [max[0], max[1], P[2]], u: [min[0] - max[0], 0, 0], v: [0, min[1] - max[1], 0] };
  }
  if (axis === 'coronal') {
    return { origin: [max[0], P[1], max[2]], u: [min[0] - max[0], 0, 0], v: [0, 0, min[2] - max[2]] };
  }
  // sagittal — anterior to the left, superior up
  return { origin: [P[0], max[1], max[2]], u: [0, min[1] - max[1], 0], v: [0, 0, min[2] - max[2]] };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function createBiewerMPRView(el: HTMLElement, options: BiewerMPRViewOptions): BiewerMPRView {
  const { volume, plane, crosshair } = options;
  let disposed = false;
  const win = { lo: options.window?.lo ?? 0.08, hi: options.window?.hi ?? 0.92 };
  let invert = options.invert ?? false;
  const showCross = options.showCrosshair ?? true;

  const root = document.createElement('div');
  root.className = 'bw-mpr';
  root.style.cssText = 'position:relative;width:100%;height:100%;background:#05080a;overflow:hidden;touch-action:none;cursor:crosshair;';
  const canvas = document.createElement('canvas');
  canvas.className = 'bw-mpr-gl';
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  const overlay = document.createElement('canvas');
  overlay.className = 'bw-mpr-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  root.appendChild(canvas); root.appendChild(overlay);
  el.appendChild(root);

  const bounds = volumeWorldBounds(volume);
  const normal = NORMAL[plane];
  const stepMM = Math.max(Math.abs(volume.spacing[0]), Math.abs(volume.spacing[1]), Math.abs(volume.spacing[2])) || 1;
  const normLo = dot(bounds.min, normal), normHi = dot(bounds.max, normal);

  let renderer: MPRRenderer;
  try {
    renderer = createMPRRenderer(canvas, volume);
  } catch (cause) {
    options.onError?.({ code: (cause as { code?: string })?.code as BiewerError['code'] ?? 'DECODE_FAILED', message: (cause as Error)?.message ?? 'MPR 초기화 실패', cause });
    return { setWindow() {}, setInvert() {}, resize() {}, dispose() { root.remove(); } };
  }

  let raf = 0;
  function schedule() { if (raf || disposed) return; raf = requestAnimationFrame(() => { raf = 0; draw(); }); }

  function draw() {
    if (disposed) return;
    const P = crosshair.get();
    const g = planeGeom(plane, bounds.min, bounds.max, P);
    const p: MPRPlane = { ...g, window: win, invert };
    renderer.render(p);
    // crosshair overlay: project P onto (s,t) and draw lines
    const octx = overlay.getContext('2d')!;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (showCross) {
      const rel: Vec3 = [P[0] - g.origin[0], P[1] - g.origin[1], P[2] - g.origin[2]];
      const s = dot(rel, g.u) / (dot(g.u, g.u) || 1);
      const t = dot(rel, g.v) / (dot(g.v, g.v) || 1);
      const x = s * overlay.width, y = t * overlay.height;
      octx.strokeStyle = 'rgba(78,197,220,0.7)'; octx.lineWidth = 1;
      octx.beginPath(); octx.moveTo(x, 0); octx.lineTo(x, overlay.height); octx.moveTo(0, y); octx.lineTo(overlay.width, y); octx.stroke();
    }
  }

  function doResize() {
    const r = root.getBoundingClientRect();
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    renderer.resize(r.width || 1, r.height || 1, dpr);
    overlay.width = Math.max(1, Math.round((r.width || 1) * dpr));
    overlay.height = Math.max(1, Math.round((r.height || 1) * dpr));
    schedule();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => doResize()) : null;
  ro?.observe(root);

  const unsub = crosshair.subscribe(() => schedule());

  // scroll → move this plane's slice along its normal
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    const P = crosshair.get();
    const cur = dot(P, normal);
    const next = clamp(cur + dir * stepMM, Math.min(normLo, normHi), Math.max(normLo, normHi));
    crosshair.set([P[0] + normal[0] * (next - cur), P[1] + normal[1] * (next - cur), P[2] + normal[2] * (next - cur)]);
  }, { passive: false });

  // click → set the shared crosshair to the clicked world point (on this plane)
  root.addEventListener('pointerdown', (e) => {
    const r = root.getBoundingClientRect();
    const s = (e.clientX - r.left) / (r.width || 1);
    const t = (e.clientY - r.top) / (r.height || 1);
    const g = planeGeom(plane, bounds.min, bounds.max, crosshair.get());
    crosshair.set([
      g.origin[0] + s * g.u[0] + t * g.v[0],
      g.origin[1] + s * g.u[1] + t * g.v[1],
      g.origin[2] + s * g.u[2] + t * g.v[2],
    ]);
  });

  doResize();

  return {
    setWindow(lo, hi) { win.lo = lo; win.hi = hi; schedule(); },
    setInvert(b) { invert = b; schedule(); },
    resize: doResize,
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      unsub(); ro?.disconnect(); renderer.dispose(); root.remove();
    },
  };
}
