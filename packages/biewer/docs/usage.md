# Usage — @deepnoid/biewer

공개 API 참조 초안. **설계 단계** — 시그니처는 구현과 함께 확정되며, 확정 전 변경은 이 문서에 먼저 반영한다.

install & quick start 는 [`../README.md`](../README.md), 타입 상세는 [`reference/types/index.md`](reference/types/index.md),
프레임워크 무관 구조는 [`reference/architecture/framework-adapters.md`](reference/architecture/framework-adapters.md).

---

## 진입점 3종

동작은 전부 vanilla TS **코어**에 있고, React·Web Component 는 얇은 어댑터다. 어느 것으로 써도 기능은 동일하다.

| 진입점 | import | 대상 스택 |
|---|---|---|
| 코어 | `@deepnoid/biewer` | 프레임워크 없음 / 커스텀 통합 |
| React | `@deepnoid/biewer/react` | React 18/19 |
| Web Component | `@deepnoid/biewer/wc` | Vue · Angular · Svelte · 순수 HTML · 서버 템플릿 |

### 코어 (vanilla TS)

```ts
import { createBiewerView, createToolController, createPlaybackController } from '@deepnoid/biewer';

const view = createBiewerView(document.getElementById('slot')!, {
  source: { kind: 'url', url: '/data/brain.nii.gz' },
  onSourceReady: (info) => console.log(info.frameCount),
});
view.setFrame(10);
// 정리
view.dispose();
```

- 상태 변경 = setter(`setSource`/`setFrame`/`setAxis`/`resize`), 이벤트 = 콜백, 구독 = `controller.subscribe(fn)`.
- 컨트롤러(`createToolController`/`createPlaybackController`)는 순수 객체 — 여러 view 에 바인딩한다.

### Web Component

```html
<biewer-view id="v" video-step="0.5"></biewer-view>
<script type="module">
  import '@deepnoid/biewer/wc';               // <biewer-view> 등록
  const el = document.getElementById('v');
  el.source = { kind: 'url', url: '/clip.mp4' };   // 객체는 property
  el.addEventListener('bw-frame-change', (e) => console.log(e.detail));
  el.tools = sharedToolController;             // 비교 그리드 sync 시 컨트롤러 공유
</script>
```

- 원시값은 attribute(`axis`, `video-step`, `scrollbar`), 객체(`source`/`tools`/`playback`)는 property.
- 콜백은 `CustomEvent`: `bw-frame-change` · `bw-source-ready` · `bw-progress` · `bw-error` · `bw-activate`.

---

## React 컴포넌트

### `<BiewerView>` — 단일 뷰포트

FrameSource 1개를 렌더링한다. 부모 컨테이너 크기를 채우고 리사이즈를 추종한다.
레이아웃(배치/분할)은 host 가 구성한다 — Biewer 는 레이아웃 컴포넌트를 제공하지 않는다.

```tsx
<BiewerView
  source={{ kind: 'url', url: '/data/brain.nii.gz' }}
  tools={tools}          // useBiewerTools() 컨트롤러 (선택)
  playback={playback}    // useBiewerPlayback() 컨트롤러 (선택)
>
  {/* overlay slot — host 커스텀 UI (라벨, 배지, 도메인 오버레이) */}
  <div className="my-badge">Study A</div>
</BiewerView>
```

Props:

| Prop | Type | 기본값 | 설명 |
|---|---|---|---|
| `source` | `BiewerSource` | (필수) | 데이터 주입. [`source-contract.md`](source-contract.md) 참조 |
| `tools?` | `ToolController` | — | 도구 컨트롤러 바인딩. 같은 컨트롤러를 N개 뷰에 바인딩 가능 |
| `playback?` | `PlaybackController` | — | 출력 모드 컨트롤러 바인딩. 미지정 시 뷰 내장 slice 탐색만 동작 |
| `frame?` | `number` | — | controlled 프레임 인덱스 (`onFrameChange` 와 쌍) |
| `defaultFrame?` | `number` | `0` | uncontrolled 초기 프레임 |
| `onFrameChange?` | `(i: number) => void` | — | 프레임 변경 통지 |
| `videoStep?` | `number` | `1` | 동영상 소스의 slice step(초). `0.1 ~ N` |
| `axis?` | `'native' \| 'axial' \| 'coronal' \| 'sagittal'` | `'native'` | 볼륨(nii/dcm) 슬라이스 축 선택 (D6) |
| `measurements?` / `defaultMeasurements?` / `onMeasurementsChange?` | `Measurement[]` | — | 측정 controlled 모델 — 저장/복원은 host 소유 ([prd-measurement](prd/prd-measurement.md)) |
| `onSourceReady?` | `(info: FrameSourceInfo) => void` | — | 정규화 완료(프레임 수, 메타) 통지 |
| `onProgress?` | `(p: BiewerProgress) => void` | — | fetch/decode 진행률 통지 — 로딩 UI 는 host 가 그림 (D8) |
| `onError?` | `(e: BiewerError) => void` | — | 판별/디코딩/렌더 오류 통지 |
| `scrollbar?` | `boolean` | `false` | 내장 슬라이스 스크롤바 표시 (opt-in, D11) |
| `className?` / `style?` | | — | 컨테이너 커스터마이징 |
| `children?` | `ReactNode` | — | overlay slot (뷰 위에 absolute 합성) |

Imperative handle (`ref`): `getFrame()`, `setFrame(i)`, `resize()`, `capture(): Promise<Blob>`.

---

## 3D 볼륨 렌더링

의료 볼륨(nii/dcm/`.nii.gz`)을 WebGL2 레이캐스터로 **3D**로 렌더한다 — VTK.js 무의존, 프레임워크 무관.
DVR(입체 합성) / MIP(최대강도투영), 드래그=오빗·휠=줌. 2D 뷰(FrameSource)와 별개의 진입점이다.
상세: [reference/skills/skill-22-volume-3d.md](reference/skills/skill-22-volume-3d.md).

```typescript
// 코어 (vanilla TS)
import { createVolume, createBiewerVolumeView } from '@deepnoid/biewer';

const view = createBiewerVolumeView(el, {
  source: { kind: 'url', url: '/studies/case.nii.gz' },
  mode: 'dvr',                          // 'dvr' | 'mip'
  onReady: (v) => console.log(v.dims, v.spacing),
});
view.setMode('mip');                    // DVR ⇄ MIP
view.setInvert(true);
view.setCamera({ azimuth: 0.6, elevation: 0.35, distance: 2.4 }); // reset view

// 볼륨을 미리/공유로 디코드하고 싶으면:
const vol = await createVolume({ kind: 'url', url: '/studies/case.nii.gz' });
createBiewerVolumeView(el2, { volume: vol, mode: 'mip' });
```

```html
<!-- Web Component -->
<biewer-volume mode="dvr"></biewer-volume>
<script type="module">
  import '@deepnoid/biewer/wc';          // <biewer-volume> 등록
  const el = document.querySelector('biewer-volume');
  el.source = { kind: 'url', url: '/studies/case.nii.gz' };
  el.addEventListener('bw-ready', (e) => console.log(e.detail.dims));
  el.setMode('mip'); el.resetCamera();   // imperative
</script>
```

```tsx
// React
import { BiewerVolume } from '@deepnoid/biewer/react';
<BiewerVolume source={{ kind: 'url', url: '/studies/case.nii.gz' }} mode={mode} onReady={(v) => …} />
```

`createBiewerVolumeView(el, opts)` 핸들: `setMode('dvr'|'mip')` · `setWindow(lo,hi)` · `setOpacity(o)` ·
`setInvert(b)` · `setCamera({azimuth,elevation,distance})` · `getCamera()` · `getVolume()` · `resize()` ·
`capture(): Promise<Blob>` · `dispose()`. WebGL2 미지원 환경은 `onError`(`DECODE_FAILED`)로 명확히 실패한다.

---

## Hooks

### `useBiewerTools(options?) → ToolController`

headless 도구 컨트롤러. 뷰의 `tools` prop 에 바인딩한다.
**바인딩 모델이 제어 구조다**: 1개 컨트롤러 ↔ N개 뷰 = 동시 적용, 뷰마다 별도 컨트롤러 = 개별 제어.

```tsx
const tools = useBiewerTools();                      // scope 기본 'all' — 바인딩된 전체 뷰에 방송 (D10)
const perView = useBiewerTools({ scope: 'active' }); // 'active' = 마지막 인터랙션(활성) 뷰에만

tools.setActiveTool('zoom');   // 이후 드래그는 zoom 으로 동작
tools.apply('rotate', 90);     // imperative 조작 — scope 에 따라 전파
tools.undo(); tools.redo();    // 측정 편집 이력 왕복
tools.reset();                 // transform 초기화
const state = tools.getState(); // { activeTool, views: … } 구독형 스냅샷
```

| 옵션/멤버 | 설명 |
|---|---|
| `scope: 'all' \| 'active'` | 조작 전파 범위. 기본 `'all'` (D10) |
| `enabledTools?: BiewerTool[]` | 허용 도구 화이트리스트. 미지정 시 전체 |
| `setActiveTool(t)` / `activeTool` | 드래그 제스처가 수행할 도구 모드 |
| `apply(op, payload?)` | `zoomIn/zoomOut/rotate/flipH/flipV/invert/reset` 등 즉시 조작 |
| `undo()` / `redo()` | 측정 편집 이력 왕복 (뷰 단위 스택) |
| `subscribe(fn)` | 상태 구독 (host 툴바 UI 렌더용) |

MVP 도구: `zoom` `pan` `rotate` `flip` `invert` `window-level` `reset` + 측정 `ruler` `circle` `polygon`
(undo/redo 포함 — [prd-measurement](prd/prd-measurement.md). 측정 그리기는 scope 무관 활성 뷰에만 적용).

### `useBiewerPlayback(options?) → PlaybackController`

출력 모드(slice/auto) 컨트롤러. 여러 뷰에 바인딩하면 프레임 이동이 동기화된다.

```tsx
const playback = useBiewerPlayback({ mode: 'slice' });

playback.setMode('auto');
playback.play();               // auto 모드 재생
playback.pause();
playback.stop();               // 정지 + 시작점 복귀
playback.setSpeed(12);         // fps
playback.setLoop('loop');      // 'none' | 'loop'
playback.setRange([10, 80]);   // 재생 구간
playback.step(+1);             // slice 모드 1칸 이동
```

---

## 전역 환경 주입 (module-level, 최소한만)

> per-instance 가 원칙이다. 전역은 환경(번들러/네트워크/코덱) 주입 3종만 허용한다. ([framework-adapters.md](reference/architecture/framework-adapters.md) §8)

```ts
import { setHttpClient, setWorkerFactory, registerDecoder } from '@deepnoid/biewer';

// 1) URL source 의 fetch 정책 (인증 헤더 등) — host 소유
setHttpClient(createDefaultHttpClient({ baseURL, getToken }));

// 2) 워커 URL — 번들러가 플러그인을 pre-bundle 하는 경우
setWorkerFactory({
  decode: () => new Worker(decodeWorkerUrl, { type: 'module' }),
});

// 3) 커스텀 포맷 디코더 등록
registerDecoder(myTiffDecoder);
```

---

## Exports (계획)

| Subpath | 내용 |
|---|---|
| `@deepnoid/biewer` | `createBiewerView`, `createVolume`, `createBiewerVolumeView`, 컨트롤러, 전역 주입 함수, 타입 |
| `@deepnoid/biewer/react` | `<BiewerView>`, `<BiewerVolume>`, `useBiewerTools`, `useBiewerPlayback` |
| `@deepnoid/biewer/wc` | `<biewer-view>`, `<biewer-volume>` 등록 |
| `@deepnoid/biewer/style.css` | 컴파일된 스타일 (`bw-` prefix) |
| `@deepnoid/biewer/workers/decodeWorker.js` | 디코딩 워커 — `?url` 로 사용 |

---

## Troubleshooting (설계 시점 예상 항목)

| 증상 | 원인 | 대응 |
|---|---|---|
| "지원하지 않는 포맷" 오류인데 파일은 정상 | 확장자만 보고 판단하지 않음 — magic bytes 불일치(예: 404 HTML 응답) | 네트워크 탭에서 실제 바이트 확인 |
| 워커 404 | 번들러 pre-bundle 시 워커 URL 미해석 | `setWorkerFactory` + `?url` import |
| 동영상 스크롤이 듬성듬성 이동 | `videoStep` 이 큼 | `videoStep` 을 줄인다 (0.1s 까지) |
