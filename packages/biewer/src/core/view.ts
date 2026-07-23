// createBiewerView — assembles acquire → sniff → decode → FrameSource → render,
// plus input routing (wheel slice, drag tools) and controller binding.
// Framework-agnostic: takes an HTMLElement, returns an imperative handle.
import type {
  BiewerView,
  BiewerViewOptions,
  BiewerSource,
  BiewerError,
  BiewerErrorCode,
  FrameSource,
  ToolBindable,
  ToolGesture,
  ToolOp,
  PlaybackBindable,
  ViewTransformState,
  VolumeAxis,
} from './types';
import { defaultTransform } from './types';
import { injectStyles } from './styles';
import { acquire } from './format/acquire';
import { sniff } from './format/sniff';
import { resolveDecoder } from './decode/registry';
import { registerBuiltins } from './decode/builtins';
import { createCanvas2DRenderer } from './render/canvas2d';

let viewSeq = 0;

export function createBiewerView(el: HTMLElement, options: BiewerViewOptions): BiewerView {
  // Guarantee built-in decoders exist in THIS bundle's registry, no matter
  // which entry point (core / react / wc) loaded the view code.
  registerBuiltins();
  if (options.injectStyles !== false) injectStyles();

  const id = `bw${++viewSeq}`;
  const root = el;
  root.classList.add('bw-view');

  const canvas = document.createElement('canvas');
  canvas.className = 'bw-canvas';
  const overlay = document.createElement('div');
  overlay.className = 'bw-overlay';
  const status = document.createElement('div');
  status.className = 'bw-status';
  status.style.display = 'none';
  root.append(canvas, overlay, status);

  const renderer = createCanvas2DRenderer(canvas);
  const dpr = () => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  let transform: ViewTransformState = defaultTransform();
  let source: FrameSource | null = null;
  let currentFrame = options.defaultFrame ?? options.frame ?? 0;
  let axis: VolumeAxis = options.axis ?? 'native';
  let disposed = false;
  let loadToken = 0;
  let renderToken = 0;

  // --- status -------------------------------------------------------------
  function showStatus(msg: string, kind?: 'error'): void {
    status.textContent = msg;
    status.className = kind === 'error' ? 'bw-status bw-status--error' : 'bw-status';
    status.style.display = 'flex';
  }
  function hideStatus(): void {
    status.style.display = 'none';
  }
  function fail(code: BiewerErrorCode, message: string, cause?: unknown): void {
    const e: BiewerError = { code, message, cause };
    showStatus(message, 'error');
    options.onError?.(e);
  }

  // --- render -------------------------------------------------------------
  function scheduleRender(): void {
    if (!source || disposed) return;
    const token = ++renderToken;
    const frame = currentFrame;
    source
      .getFrame(frame)
      .then((pixels) => {
        if (disposed || token !== renderToken) return;
        renderer.render(pixels, transform);
      })
      .catch((cause) => {
        if (disposed || token !== renderToken) return;
        fail('DECODE_FAILED', 'frame decode failed', cause);
      });
  }

  function doResize(): void {
    const rect = root.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, dpr());
    scheduleRender();
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => doResize()) : null;
  ro?.observe(root);

  // --- frame --------------------------------------------------------------
  function setFrameInternal(index: number): void {
    if (!source) return;
    const clamped = Math.max(0, Math.min(source.frameCount - 1, Math.floor(index)));
    if (clamped === currentFrame && renderToken > 0) {
      options.onFrameChange?.(clamped);
      return;
    }
    currentFrame = clamped;
    scheduleRender();
    options.onFrameChange?.(clamped);
  }

  function publicSetFrame(index: number): void {
    if (options.playback) options.playback.setFrame(index);
    else setFrameInternal(index);
  }

  // --- tool bindable ------------------------------------------------------
  function notifyTransform(): void {
    options.tools?._notifyTransform(id, { ...transform, pan: { ...transform.pan } });
  }

  function applyOp(op: ToolOp): void {
    switch (op.op) {
      case 'zoomIn':
        transform.zoom = Math.min(40, transform.zoom * 1.2);
        break;
      case 'zoomOut':
        transform.zoom = Math.max(0.1, transform.zoom / 1.2);
        break;
      case 'flipH':
        transform.flipH = !transform.flipH;
        break;
      case 'flipV':
        transform.flipV = !transform.flipV;
        break;
      case 'invert':
        transform.inverted = !transform.inverted;
        break;
      case 'reset':
        transform = defaultTransform();
        break;
      case 'rotate':
        transform.rotation = (((transform.rotation + op.degrees) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
        break;
      case 'windowLevel':
        transform.window = { wc: op.wc, ww: op.ww };
        break;
    }
    scheduleRender();
    notifyTransform();
  }

  function applyGesture(g: ToolGesture): void {
    switch (g.tool) {
      case 'zoom': {
        const factor = Math.exp(-g.dy * 0.005);
        transform.zoom = Math.max(0.1, Math.min(40, transform.zoom * factor));
        break;
      }
      case 'pan':
        transform.pan = { x: transform.pan.x + g.dx, y: transform.pan.y + g.dy };
        break;
      case 'window-level': {
        const w = transform.window ?? source?.meta.defaultWindow ?? { wc: 128, ww: 256 };
        transform.window = { wc: w.wc + g.dx, ww: Math.max(1, w.ww + g.dy) };
        break;
      }
      default:
        return; // rotate/flip/invert are op-based; measurement handled elsewhere
    }
    scheduleRender();
    notifyTransform();
  }

  const toolBindable: ToolBindable = {
    applyOp,
    applyGesture,
    reset() {
      transform = defaultTransform();
      scheduleRender();
      notifyTransform();
    },
    getTransform: () => ({ ...transform, pan: { ...transform.pan } }),
  };

  const playbackBindable: PlaybackBindable = {
    setFrame: setFrameInternal,
    getFrameCount: () => source?.frameCount ?? 1,
  };

  // --- input: activate ----------------------------------------------------
  function activate(): void {
    options.onActivate?.();
    options.tools?._setActiveView(id);
  }

  // --- input: wheel (slice) with rAF coalescing ---------------------------
  let wheelAccum = 0;
  let wheelRaf = 0;
  function flushWheel(): void {
    wheelRaf = 0;
    const steps = wheelAccum;
    wheelAccum = 0;
    if (!steps) return;
    if (options.playback) options.playback.step(steps);
    else setFrameInternal(currentFrame + steps);
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    activate();
    wheelAccum += e.deltaY > 0 ? 1 : -1;
    if (!wheelRaf) wheelRaf = requestAnimationFrame(flushWheel);
  }

  // --- input: drag (tools) with rAF coalescing ----------------------------
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pendingDx = 0;
  let pendingDy = 0;
  let dragRaf = 0;
  let dragTool: ToolGesture['tool'] | null = null;

  function flushDrag(): void {
    dragRaf = 0;
    if (!dragTool || (!pendingDx && !pendingDy)) return;
    const g: ToolGesture = { tool: dragTool, dx: pendingDx, dy: pendingDy };
    pendingDx = 0;
    pendingDy = 0;
    if (options.tools) options.tools._gesture(id, g);
    else applyGesture(g);
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    activate();
    const tool = options.tools?.activeTool;
    if (!tool || tool === 'rotate' || tool === 'flip' || tool === 'invert') return;
    dragging = true;
    dragTool = tool;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    if (e.buttons === 0) {
      onPointerUp(e);
      return;
    }
    pendingDx += e.clientX - lastX;
    pendingDy += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (!dragRaf) dragRaf = requestAnimationFrame(flushDrag);
  }
  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    dragTool = null;
    canvas.releasePointerCapture?.(e.pointerId);
  }

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // --- controller binding -------------------------------------------------
  options.tools?._attach(id, toolBindable);
  options.playback?._attach(id, playbackBindable);

  // --- load ---------------------------------------------------------------
  const abort = new AbortController();

  async function load(src: BiewerSource): Promise<void> {
    const token = ++loadToken;
    // release previous
    source?.dispose();
    source = null;
    transform = defaultTransform();
    showStatus('로딩 중…');
    try {
      const { inputs, hint } = await acquire(src, { signal: abort.signal, onProgress: options.onProgress });
      if (disposed || token !== loadToken) return;
      if (inputs.length === 0) return fail('EMPTY_CONTAINER', '입력이 비어 있습니다');

      const head = inputs[0];
      const s = sniff(head.bytes, { filename: head.filename, hint });
      const decoder = resolveDecoder(head.bytes, { filename: head.filename, hint });
      if (!decoder) {
        return fail('UNSUPPORTED_FORMAT', `지원하지 않는 포맷입니다${s.format ? ` (${s.format})` : ''}`);
      }
      const fs = await decoder.decode(head.bytes, {
        format: s.format ?? 'png',
        filename: head.filename,
        signal: abort.signal,
        onProgress: options.onProgress,
        extra: inputs.slice(1).map((i) => i.bytes),
      });
      if (disposed || token !== loadToken) {
        fs.dispose();
        return;
      }
      source = fs;
      currentFrame = Math.max(0, Math.min(fs.frameCount - 1, options.frame ?? options.defaultFrame ?? 0));
      hideStatus();
      options.onSourceReady?.({
        frameCount: fs.frameCount,
        frameSize: fs.frameSize,
        pixelType: fs.pixelType,
        format: fs.meta.format,
        meta: fs.meta,
      });
      doResize();
      // re-sync any bound playback (frameCount changed)
      options.playback?.setFrame(currentFrame);
    } catch (cause) {
      if (disposed || token !== loadToken) return;
      const code: BiewerErrorCode = (cause as { code?: BiewerErrorCode })?.code ?? 'DECODE_FAILED';
      fail(code, (cause as Error)?.message ?? '로드 실패', cause);
    }
  }

  void load(options.source);

  // --- handle -------------------------------------------------------------
  return {
    setSource(next) {
      void load(next);
    },
    setFrame: publicSetFrame,
    getFrame: () => currentFrame,
    setAxis(next) {
      if (next === axis) return;
      axis = next;
      // axis re-slice happens in the volume decoder path (future); reload for now.
      void load(options.source);
    },
    setVideoStep() {
      // video source only; wired with the video decoder (future)
    },
    resize: doResize,
    async capture() {
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('capture failed'))), 'image/png');
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      ro?.disconnect();
      if (wheelRaf) cancelAnimationFrame(wheelRaf);
      if (dragRaf) cancelAnimationFrame(dragRaf);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      options.tools?._detach(id);
      options.playback?._detach(id);
      source?.dispose();
      source = null;
      renderer.dispose();
      root.contains(canvas) && root.removeChild(canvas);
      root.contains(overlay) && root.removeChild(overlay);
      root.contains(status) && root.removeChild(status);
      root.classList.remove('bw-view');
    },
  };
}
