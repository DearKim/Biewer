# Types — 핵심 타입 정의 초안

> 설계 단계 초안. 구현 시 `src/types/` 가 SSOT 가 되고 이 문서는 요약 인덱스로 유지한다.
> 공개 API 사용법은 [`../../usage.md`](../../usage.md).

---

## Source / Format

```ts
/** host 데이터 주입 — source-contract.md §1 */
type BiewerSource =
  | { kind: 'url';    url: string | string[];  format?: FormatHint }
  | { kind: 'file';   file: File | File[];     format?: FormatHint }
  | { kind: 'buffer'; data: ArrayBuffer | ArrayBuffer[]; name?: string; format?: FormatHint };

type FormatHint = ResolvedFormat;

type ResolvedFormat =
  | 'png' | 'jpeg' | 'webp' | 'jpeg-ls'      // 이미지
  | 'nifti' | 'dicom'                        // 의료 볼륨
  | 'mp4'                                    // 동영상
  | (string & {});                           // registerDecoder 확장

/** 커스텀 디코더 계약 — prd-format-support.md §4 */
interface BiewerDecoder {
  name: string;
  sniff(bytes: Uint8Array, ctx: { filename?: string }): boolean;
  decode(bytes: Uint8Array, ctx: DecodeContext): Promise<FrameSource>;
}
```

## FrameSource (정규화 결과 — 내부 핵심 추상화)

```ts
/** 모든 포맷이 수렴하는 단일 표현. 뷰/도구/재생은 이것만 안다. */
interface FrameSource {
  readonly frameCount: number;
  readonly frameSize: { width: number; height: number };
  readonly pixelType: 'rgba8' | 'gray8' | 'gray16' | 'float32';
  getFrame(index: number): Promise<FramePixels>;   // 캐시 히트 시 동기 resolve
  readonly meta: FrameSourceMeta;
  dispose(): void;
}

interface FrameSourceMeta {
  format: ResolvedFormat;
  spacing?: [number, number, number];      // 의료 볼륨
  dims?: [number, number, number];         // 볼륨 복셀 크기 (i,j,k)
  axis?: VolumeAxis;                       // 현재 슬라이스 축 (볼륨)
  defaultWindow?: { wc: number; ww: number };
  duration?: number;                        // 동영상(초)
  fps?: number;
}

type VolumeAxis = 'native' | 'axial' | 'coronal' | 'sagittal';   // D6, 기본 'native'

/** onSourceReady 로 host 에 전달되는 요약 — source-contract.md §4 */
type FrameSourceInfo = Pick<FrameSource, 'frameCount' | 'frameSize' | 'pixelType'> & { format: ResolvedFormat; meta?: FrameSourceMeta };
```

## Playback — prd-output-modes.md

```ts
type OutputMode = 'slice' | 'auto';

interface PlaybackController {
  readonly mode: OutputMode;
  setMode(m: OutputMode): void;

  // slice
  step(delta: number): void;
  setFrame(index: number): void;

  // auto
  play(): void;
  pause(): void;
  stop(): void;                             // 정지 + range 시작점 복귀
  setSpeed(fps: number): void;
  setLoop(loop: 'none' | 'loop'): void;
  setRange(range: [number, number] | null): void;

  getState(): PlaybackState;
  subscribe(fn: (s: PlaybackState) => void): () => void;
}

interface PlaybackState {
  mode: OutputMode;
  frame: number;
  frameCount: number;
  playing: boolean;
  speed: number;
  loop: 'none' | 'loop';
  range: [number, number] | null;
}
```

## Tools — prd-tool-binding.md

```ts
type BiewerTool =
  | 'zoom' | 'pan' | 'rotate' | 'flip' | 'invert' | 'window-level'
  | 'ruler' | 'circle' | 'polygon';         // 측정 세트 (D9) — prd-measurement.md

type ToolOp =
  | { op: 'zoomIn' | 'zoomOut' | 'flipH' | 'flipV' | 'invert' | 'reset' }
  | { op: 'rotate'; degrees: 90 | -90 }
  | { op: 'windowLevel'; wc: number; ww: number };

interface ToolController {
  readonly scope: 'all' | 'active';         // 기본 'all' (D10)
  readonly activeTool: BiewerTool | null;
  setActiveTool(t: BiewerTool | null): void;
  apply(op: ToolOp): void;                  // scope 에 따라 바인딩 뷰에 전파
  reset(): void;
  undo(): void;                             // 측정 편집 이력 (뷰 단위 스택)
  redo(): void;
  getState(): ToolControllerState;
  subscribe(fn: (s: ToolControllerState) => void): () => void;
}

interface ViewTransformState {
  zoom: number;                             // 1 = fit
  pan: { x: number; y: number };
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  inverted: boolean;
  window?: { wc: number; ww: number };
}

interface ToolControllerState {
  activeTool: BiewerTool | null;
  views: Record<string /* viewId */, ViewTransformState>;
  activeViewId: string | null;
}

/** 측정 — prd-measurement.md. 좌표는 이미지 좌표계(px), frame 에 귀속. JSON 직렬화 왕복 무손실 */
type Point = { x: number; y: number };

type Measurement =
  | { id: string; kind: 'ruler';   frame: number; points: [Point, Point] }
  | { id: string; kind: 'circle';  frame: number; center: Point; radius: number }
  | { id: string; kind: 'polygon'; frame: number; points: Point[] };
```

## View / Error

```ts
interface BiewerViewProps {
  source: BiewerSource;
  tools?: ToolController;
  playback?: PlaybackController;
  frame?: number;                           // controlled
  defaultFrame?: number;
  onFrameChange?(index: number): void;
  videoStep?: number;                       // 초, 0.1~N (동영상 소스)
  axis?: VolumeAxis;                        // 볼륨 슬라이스 축, 기본 'native' (D6)
  scrollbar?: boolean;                      // opt-in, default false (D11)
  showFocusBorder?: boolean;                // opt-in, default false
  measurements?: Measurement[];             // controlled — 저장/복원은 host 소유
  defaultMeasurements?: Measurement[];
  onMeasurementsChange?(list: Measurement[]): void;
  onActivate?(): void;
  onSourceReady?(info: FrameSourceInfo): void;
  onProgress?(p: BiewerProgress): void;     // D8 — source-contract.md §5
  onError?(e: BiewerError): void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;               // overlay slot
}

interface BiewerViewHandle {
  getFrame(): number;
  setFrame(index: number): void;
  resize(): void;
  capture(): Promise<Blob>;
}

interface BiewerError {
  code: 'FETCH_FAILED' | 'UNSUPPORTED_FORMAT' | 'DECODE_FAILED' | 'EMPTY_CONTAINER' | 'ABORTED';
  message: string;
  cause?: unknown;
}

/** 진행률 (D8) — source-contract.md §5. ratio 는 단조 증가 보장 */
interface BiewerProgress {
  phase: 'fetch' | 'decode';
  loaded: number;                           // bytes(fetch) 또는 처리 단위(decode)
  total: number | null;                     // Content-Length 없으면 null
  ratio: number | null;                     // 0~1, total 없으면 null
}
```
