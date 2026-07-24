// createBiewerVolumeView — a self-contained 3D volume view (WebGL raycaster).
//
// Owns: a canvas, the volume renderer, orbit/zoom input (rAF-coalesced), and
// resize. The host mounts it into any element and drives it imperatively; the
// same headless-controller philosophy as createBiewerView, but for 3D. Tools
// (mode / window / opacity / invert / camera) are plain setters so a host can
// wire them into whatever UI it wants, or share one setter across many views.
import type { BiewerSource, BiewerError, BiewerProgress, VolumeData } from './types';
import { createVolume } from './volume';
import { createVolumeRenderer, type VolumeRenderer, type VolumeRenderMode, type VolumeCamera } from './render/volume3d';

export interface BiewerVolumeViewOptions {
  /** decode a volume from a source (nii/dcm/.nii.gz) … */
  source?: BiewerSource;
  /** … or hand in an already-decoded volume (e.g. shared across views). */
  volume?: VolumeData;
  mode?: VolumeRenderMode;
  window?: { lo: number; hi: number };
  opacity?: number;
  invert?: boolean;
  /** initial camera (azimuth/elevation radians, distance in box units) */
  camera?: Partial<VolumeCamera>;
  /** cap the longest volume edge in voxels (perf). Default 192. */
  maxEdge?: number;
  onReady?: (v: VolumeData) => void;
  onError?: (e: BiewerError) => void;
  onProgress?: (p: BiewerProgress) => void;
  onCameraChange?: (c: VolumeCamera) => void;
}

export interface BiewerVolumeView {
  setMode(m: VolumeRenderMode): void;
  setWindow(lo: number, hi: number): void;
  setOpacity(o: number): void;
  setInvert(b: boolean): void;
  setCamera(patch: Partial<VolumeCamera>): void;
  getCamera(): VolumeCamera;
  getVolume(): VolumeData | null;
  resize(): void;
  capture(): Promise<Blob>;
  dispose(): void;
}

const MIN_DIST = 0.6, MAX_DIST = 6;
const MAX_EL = (85 * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function createBiewerVolumeView(el: HTMLElement, options: BiewerVolumeViewOptions): BiewerVolumeView {
  let disposed = false;
  let renderer: VolumeRenderer | null = null;
  let volume: VolumeData | null = null;

  const camera: VolumeCamera = {
    azimuth: options.camera?.azimuth ?? 0.6,
    elevation: options.camera?.elevation ?? 0.35,
    distance: options.camera?.distance ?? 2.4,
  };

  // --- DOM ------------------------------------------------------------------
  const root = document.createElement('div');
  root.className = 'bw-volume';
  root.style.cssText = 'position:relative;width:100%;height:100%;background:#0a0d0f;overflow:hidden;touch-action:none;cursor:grab;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  root.appendChild(canvas);
  const status = document.createElement('div');
  status.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'color:#8aa;font:13px/1.4 system-ui,sans-serif;text-align:center;padding:12px;pointer-events:none;';
  root.appendChild(status);
  el.appendChild(root);

  function showStatus(msg: string) { status.textContent = msg; status.style.display = 'flex'; }
  function hideStatus() { status.style.display = 'none'; }

  // --- render scheduling (rAF-coalesced) ------------------------------------
  let raf = 0;
  function schedule() {
    if (raf || disposed || !renderer) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (disposed || !renderer) return;
      renderer.render(camera);
      options.onCameraChange?.({ ...camera });
    });
  }

  function doResize() {
    if (!renderer) return;
    const r = root.getBoundingClientRect();
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    renderer.resize(r.width || 1, r.height || 1, dpr);
    schedule();
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => doResize()) : null;
  ro?.observe(root);

  // --- input: drag = orbit, wheel = zoom ------------------------------------
  let dragging = false, lastX = 0, lastY = 0;
  root.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    root.style.cursor = 'grabbing';
    root.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    camera.azimuth += dx * 0.01;
    camera.elevation = clamp(camera.elevation - dy * 0.01, -MAX_EL, MAX_EL);
    schedule();
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false; root.style.cursor = 'grab';
    try { root.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.distance = clamp(camera.distance * Math.exp(e.deltaY * 0.001), MIN_DIST, MAX_DIST);
    schedule();
  }, { passive: false });

  // --- mount ----------------------------------------------------------------
  function mount(v: VolumeData) {
    if (disposed) return;
    volume = v;
    try {
      renderer = createVolumeRenderer(canvas, v);
    } catch (cause) {
      fail((cause as { code?: string })?.code ?? 'DECODE_FAILED', (cause as Error)?.message ?? '3D 렌더 초기화 실패', cause);
      return;
    }
    renderer.setState({
      mode: options.mode ?? 'dvr',
      window: options.window ?? { lo: 0.12, hi: 1.0 },
      opacity: options.opacity ?? 0.4,
      invert: options.invert ?? false,
    });
    hideStatus();
    doResize();
    options.onReady?.(v);
  }

  function fail(code: string, message: string, cause?: unknown) {
    showStatus(message);
    options.onError?.({ code: code as BiewerError['code'], message, cause });
  }

  async function load() {
    if (options.volume) { mount(options.volume); return; }
    if (!options.source) { showStatus('소스가 없습니다'); return; }
    showStatus('볼륨 로딩 중…');
    try {
      const v = await createVolume(options.source, { onProgress: options.onProgress, maxEdge: options.maxEdge });
      if (disposed) return;
      mount(v);
    } catch (cause) {
      if (disposed) return;
      fail((cause as { code?: string })?.code ?? 'DECODE_FAILED', (cause as Error)?.message ?? '볼륨 로드 실패', cause);
    }
  }
  void load();

  return {
    setMode(m) { renderer?.setState({ mode: m }); schedule(); },
    setWindow(lo, hi) { renderer?.setState({ window: { lo, hi } }); schedule(); },
    setOpacity(o) { renderer?.setState({ opacity: o }); schedule(); },
    setInvert(b) { renderer?.setState({ invert: b }); schedule(); },
    setCamera(patch) {
      if (patch.azimuth != null) camera.azimuth = patch.azimuth;
      if (patch.elevation != null) camera.elevation = clamp(patch.elevation, -MAX_EL, MAX_EL);
      if (patch.distance != null) camera.distance = clamp(patch.distance, MIN_DIST, MAX_DIST);
      schedule();
    },
    getCamera: () => ({ ...camera }),
    getVolume: () => volume,
    resize: doResize,
    async capture() {
      if (renderer) renderer.render(camera); // ensure a fresh frame in the buffer
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('capture failed'))), 'image/png');
      });
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      renderer?.dispose();
      renderer = null;
      root.remove();
    },
  };
}
