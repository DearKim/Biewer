// Public types for @deepnoid/biewer core.
// Framework-agnostic: no React/Vue imports here or anywhere under src/core.

// ---------------------------------------------------------------------------
// Source / Format
// ---------------------------------------------------------------------------

export type ResolvedFormat =
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'gif'
  | 'jpeg-ls'
  | 'nifti'
  | 'dicom'
  | 'mp4'
  | (string & {}); // registerDecoder extensions

export type FormatHint = ResolvedFormat;

/** How the host injects data. Arrays = stack/series. */
export type BiewerSource =
  | { kind: 'url'; url: string | string[]; format?: FormatHint }
  | { kind: 'file'; file: File | File[]; format?: FormatHint }
  | { kind: 'buffer'; data: ArrayBuffer | ArrayBuffer[]; name?: string; format?: FormatHint };

export type VolumeAxis = 'native' | 'axial' | 'coronal' | 'sagittal';

export type PixelType = 'rgba8' | 'gray8' | 'gray16' | 'float32';

// ---------------------------------------------------------------------------
// FrameSource — the single abstraction every format normalizes into.
// ---------------------------------------------------------------------------

export interface FrameSourceMeta {
  format: ResolvedFormat;
  /** medical volume voxel spacing (mm) */
  spacing?: [number, number, number];
  /** volume voxel dims (i, j, k) */
  dims?: [number, number, number];
  /** current slice axis for volumes */
  axis?: VolumeAxis;
  defaultWindow?: { wc: number; ww: number };
  /** video duration (seconds) */
  duration?: number;
  fps?: number;
}

/** Decoded pixels for one frame, ready for a renderer. */
export interface FramePixels {
  width: number;
  height: number;
  pixelType: PixelType;
  /**
   * rgba8: ImageBitmap or Uint8ClampedArray(w*h*4).
   * gray8/gray16/float32: typed array of length w*h (single channel), window-leveled at render.
   */
  data: ImageBitmap | Uint8ClampedArray | Uint8Array | Uint16Array | Int16Array | Float32Array;
}

export interface FrameSource {
  readonly frameCount: number;
  readonly frameSize: { width: number; height: number };
  readonly pixelType: PixelType;
  readonly meta: FrameSourceMeta;
  getFrame(index: number): Promise<FramePixels>;
  dispose(): void;
}

export type FrameSourceInfo = Pick<FrameSource, 'frameCount' | 'frameSize' | 'pixelType'> & {
  format: ResolvedFormat;
  meta: FrameSourceMeta;
};

/** A decoded 3D volume (for MPR / MIP / volume rendering). */
export interface VolumeData {
  dims: [number, number, number];          // nx, ny, nz
  spacing: [number, number, number];       // mm per voxel
  pixelType: PixelType;
  data: Uint8Array | Int16Array | Uint16Array | Float32Array; // length nx*ny*nz
  min: number;
  max: number;
  format?: ResolvedFormat;
}

// ---------------------------------------------------------------------------
// Errors / progress
// ---------------------------------------------------------------------------

export type BiewerErrorCode =
  | 'FETCH_FAILED'
  | 'UNSUPPORTED_FORMAT'
  | 'DECODE_FAILED'
  | 'EMPTY_CONTAINER'
  | 'ABORTED';

export interface BiewerError {
  code: BiewerErrorCode;
  message: string;
  cause?: unknown;
}

export interface BiewerProgress {
  phase: 'fetch' | 'decode';
  loaded: number;
  total: number | null;
  ratio: number | null;
}

// ---------------------------------------------------------------------------
// Decoder registry contract
// ---------------------------------------------------------------------------

export interface DecodeContext {
  format: ResolvedFormat;
  filename?: string;
  signal?: AbortSignal;
  onProgress?: (p: BiewerProgress) => void;
  /** volume slice axis (nii/dcm) */
  axis?: VolumeAxis;
  /** decode additional inputs of a multi-file source (stack/series) */
  extra?: Uint8Array[];
}

export interface BiewerDecoder {
  name: string;
  /** true if this decoder handles the given bytes */
  sniff(bytes: Uint8Array, ctx: { filename?: string; hint?: FormatHint }): boolean;
  decode(bytes: Uint8Array, ctx: DecodeContext): Promise<FrameSource>;
}

// ---------------------------------------------------------------------------
// HTTP client (host-injected fetch policy)
// ---------------------------------------------------------------------------

export interface HttpClient {
  fetchBytes(url: string, opts?: { signal?: AbortSignal; onProgress?: (p: BiewerProgress) => void }): Promise<ArrayBuffer>;
}

// ---------------------------------------------------------------------------
// Worker factory (bundler-agnostic override)
// ---------------------------------------------------------------------------

export interface WorkerFactory {
  decode?: () => Worker;
}

// ---------------------------------------------------------------------------
// View transform / tool state
// ---------------------------------------------------------------------------

export type BiewerTool =
  | 'zoom'
  | 'pan'
  | 'rotate'
  | 'flip'
  | 'invert'
  | 'window-level'
  | 'ruler'
  | 'circle'
  | 'polygon';

export type ToolOp =
  | { op: 'zoomIn' | 'zoomOut' | 'flipH' | 'flipV' | 'invert' | 'reset' }
  | { op: 'rotate'; degrees: 90 | -90 }
  | { op: 'windowLevel'; wc: number; ww: number };

export interface ViewTransformState {
  zoom: number; // 1 = fit
  pan: { x: number; y: number };
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  inverted: boolean;
  window?: { wc: number; ww: number };
}

export function defaultTransform(): ViewTransformState {
  return { zoom: 1, pan: { x: 0, y: 0 }, rotation: 0, flipH: false, flipV: false, inverted: false };
}

// ---------------------------------------------------------------------------
// Measurement (image-space coords, bound to a frame)
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number };

export type Measurement =
  | { id: string; kind: 'ruler'; frame: number; points: [Point, Point] }
  | { id: string; kind: 'circle'; frame: number; center: Point; radius: number }
  | { id: string; kind: 'polygon'; frame: number; points: Point[] };

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

export type ToolScope = 'all' | 'active';

export interface ToolControllerState {
  activeTool: BiewerTool | null;
  views: Record<string, ViewTransformState>;
  activeViewId: string | null;
}

/** A continuous drag increment routed through the controller (for scope broadcast). */
export interface ToolGesture {
  tool: BiewerTool;
  /** screen-pixel deltas for this increment */
  dx: number;
  dy: number;
  /** view-local anchor 0..1 (zoom focus) */
  ax?: number;
  ay?: number;
}

export interface ToolController {
  readonly scope: ToolScope;
  readonly activeTool: BiewerTool | null;
  setActiveTool(t: BiewerTool | null): void;
  apply(op: ToolOp): void;
  reset(): void;
  undo(): void;
  redo(): void;
  getState(): ToolControllerState;
  subscribe(fn: (s: ToolControllerState) => void): () => void;
  /** internal: view binding. Adapters/view call these. */
  _attach(viewId: string, view: ToolBindable): void;
  _detach(viewId: string): void;
  _setActiveView(viewId: string): void;
  /** internal: a view reports a drag increment; controller broadcasts per scope. */
  _gesture(sourceViewId: string, g: ToolGesture): void;
  /** internal: view reports its transform changed (for state snapshot). */
  _notifyTransform(viewId: string, t: ViewTransformState): void;
}

/** What a view exposes to a ToolController. */
export interface ToolBindable {
  applyOp(op: ToolOp): void;
  applyGesture(g: ToolGesture): void;
  reset(): void;
  getTransform(): ViewTransformState;
}

export type OutputMode = 'slice' | 'auto';

export interface PlaybackState {
  mode: OutputMode;
  frame: number;
  frameCount: number;
  playing: boolean;
  speed: number; // fps
  loop: 'none' | 'loop';
  range: [number, number] | null;
}

export interface PlaybackController {
  readonly mode: OutputMode;
  setMode(m: OutputMode): void;
  step(delta: number): void;
  setFrame(index: number): void;
  play(): void;
  pause(): void;
  stop(): void;
  setSpeed(fps: number): void;
  setLoop(loop: 'none' | 'loop'): void;
  setRange(range: [number, number] | null): void;
  getState(): PlaybackState;
  subscribe(fn: (s: PlaybackState) => void): () => void;
  /** internal: view binding */
  _attach(viewId: string, view: PlaybackBindable): void;
  _detach(viewId: string): void;
}

export interface PlaybackBindable {
  setFrame(index: number): void;
  getFrameCount(): number;
}

// ---------------------------------------------------------------------------
// View options / handle
// ---------------------------------------------------------------------------

export interface BiewerViewOptions {
  source: BiewerSource;
  tools?: ToolController;
  playback?: PlaybackController;
  frame?: number;
  defaultFrame?: number;
  videoStep?: number;
  axis?: VolumeAxis;
  scrollbar?: boolean;
  injectStyles?: boolean;
  onFrameChange?: (index: number) => void;
  onSourceReady?: (info: FrameSourceInfo) => void;
  onProgress?: (p: BiewerProgress) => void;
  onError?: (e: BiewerError) => void;
  onActivate?: () => void;
}

export interface BiewerView {
  setSource(source: BiewerSource): void;
  setFrame(index: number): void;
  getFrame(): number;
  setAxis(axis: VolumeAxis): void;
  setVideoStep(step: number): void;
  resize(): void;
  capture(): Promise<Blob>;
  dispose(): void;
}
