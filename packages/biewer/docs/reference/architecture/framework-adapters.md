# Framework Adapters — 프레임워크 무관 코어 + 얇은 어댑터

> Biewer 는 배포 패키지다. FE 스택(React / Vue / Angular / 순수 HTML / 서버 템플릿)을 가리지 않고 쓸 수 있어야 한다.
> 그래서 **동작은 전부 vanilla TypeScript 코어**에 두고, 프레임워크별 어댑터는 코어를 감싸는 얇은 층으로만 둔다.
> 연관: [`boundary.md`](boundary.md), [`../../usage.md`](../../usage.md), [`../types/index.md`](../types/index.md)

---

## 1. 왜 이 구조인가

특정 프레임워크에 로직을 묶으면 그 프레임워크 소비자에게만 가치가 있고, 다른 스택은 전부 재구현해야 한다.
Biewer 는 **출력 엔진**이므로 프레임워크와 무관한 관심사(디코딩, 프레임 관리, 렌더, 도구 상태)만 갖는다.
따라서 로직을 코어로 내리고 어댑터는 "코어 인스턴스를 만들고, 라이프사이클에 맞춰 붙였다 떼는" 일만 한다.

## 2. 레이어

```text
┌─────────────────────────────────────────────────────────────┐
│  Adapters (얇음 — 라이프사이클 바인딩만)                      │
│                                                              │
│  @deepnoid/biewer/react   <BiewerView>, useBiewerTools …     │  React 전용 (idiomatic)
│  @deepnoid/biewer/wc      <biewer-view> Custom Element        │  표준 Web Component (Vue/Angular/HTML/서버템플릿)
│  (직접 사용)              코어 API 그대로                     │  어댑터 없는 스택
└───────────────────────────────┬─────────────────────────────┘
                                 │  createBiewerView / createToolController / createPlaybackController
┌───────────────────────────────▼─────────────────────────────┐
│  Core (@deepnoid/biewer) — vanilla TS, 프레임워크 0 의존      │
│  판별 · 디코딩(worker) · FrameSource · 렌더(Canvas2D/WebGL)   │
│  · PlaybackController · ToolController · 측정 · 스타일 주입   │
└──────────────────────────────────────────────────────────────┘
```

- **코어**는 DOM 엘리먼트 하나(`HTMLElement`)를 받아 그 안에 캔버스를 만들고 그린다. React·Vue 를 import 하지 않는다.
- **어댑터**는 프레임워크의 마운트/언마운트 시점에 코어 인스턴스를 `create*` → `dispose()` 한다.

## 3. 코어 API 형태 (imperative)

프레임워크 무관이려면 명령형이어야 한다. 모든 코어 팩토리는 동일한 수명 계약을 따른다:

```ts
// 뷰
const view = createBiewerView(el /* HTMLElement */, {
  source, tools, playback, axis, videoStep, scrollbar,
  onFrameChange, onSourceReady, onProgress, onError, onActivate,
});
view.setSource(next);      // prop 갱신은 setter 로
view.setFrame(i);
view.resize();
await view.capture();
view.dispose();            // 리스너/워커/GL 컨텍스트/캐시 해제

// 컨트롤러 (headless — 여러 view 에 바인딩)
const tools = createToolController({ scope: 'all', enabledTools });
const playback = createPlaybackController({ mode: 'slice' });
```

- **상태 변경 → setter**, **이벤트 → 콜백**, **구독 → `subscribe(fn): () => void`**. 프레임워크의 반응성에 기대지 않는다.
- 컨트롤러는 순수 객체다. React 훅(`useBiewerTools`)은 이 객체를 만들어 참조를 안정적으로 유지하는 래퍼일 뿐이다.

## 4. React 어댑터 (`/react`)

- `<BiewerView>` = `createBiewerView` 를 `useEffect` 로 마운트/언마운트하고, prop 변화를 setter 로 전달하는 컴포넌트.
- `useBiewerTools()` / `useBiewerPlayback()` = `create*Controller` 를 `useRef` 로 1회 생성해 안정 참조로 반환.
- controlled/uncontrolled prop(`frame`/`defaultFrame`, `measurements`/`defaultMeasurements`)은 어댑터가 해석해 코어 setter 로 정규화한다.
- React 는 **optional peerDependency** — 코어만 쓰는 소비자는 React 를 설치하지 않는다.

## 5. Web Component 어댑터 (`/wc`)

- `<biewer-view>` Custom Element. 속성(attribute)/프로퍼티(property)로 코어 옵션을 받고, `CustomEvent` 로 콜백을 방출한다.
  - 원시값은 attribute(`axis="axial"`, `video-step="0.5"`), 객체(`source`, `tools`)는 property 로 설정.
  - 이벤트: `bw-frame-change`, `bw-source-ready`, `bw-progress`, `bw-error`, `bw-activate` (`detail` 에 payload).
- `connectedCallback` → `createBiewerView`, `disconnectedCallback` → `dispose`, `attributeChangedCallback` → setter.
- 컨트롤러 공유(비교 그리드 sync)는 `viewEl.tools = controller` property 로 바인딩한다. 이 controller 는 코어 객체 그대로라 여러 `<biewer-view>` 에 물릴 수 있다.
- 이 하나로 Vue / Angular / Svelte / 순수 HTML / 서버사이드 템플릿이 별도 어댑터 없이 커버된다 (커스텀 엘리먼트는 웹 표준).

## 6. 패키지·번들 구성 (D1, D2)

- **단일 패키지 `@deepnoid/biewer` + subpath exports** (결정: 단일 패키지 + subpath).

```jsonc
// package.json exports (요지)
{
  ".":            "./dist/index.js",        // 코어 (vanilla TS)
  "./react":      "./dist/react.js",        // React 어댑터
  "./wc":         "./dist/wc.js",           // Web Component 정의(+ 자동 등록 subpath /wc/define)
  "./style.css":  "./dist/style.css",       // 스타일 파일 (주입 대신 명시 import 하고 싶을 때)
  "./workers/*":  "./dist/workers/*"        // 디코딩 워커 — ?url 로 사용
}
```

- `react` 는 `peerDependencies`(optional) + `peerDependenciesMeta.optional`. 코어/WC 소비자는 React 없이 설치.
- 어댑터를 import 하지 않으면 번들러 트리셰이킹으로 제거된다 (코어만 남음).
- ESM + CJS + `.d.ts` 를 subpath 마다 발행. React 는 `^18 || ^19` (결정: peer 범위).

## 7. 스타일 배포 (D: 런타임 주입 + 옵트아웃)

- 코어가 최소 스타일(`bw-` 클래스, `--bw-*` CSS 변수)을 **첫 인스턴스 생성 시 `<style>` 1회 주입**한다 → 어떤 스택이든 css import 없이 바로 동작.
- 중복 주입 방지(모듈 전역 플래그), 주입된 스타일은 idempotent.
- 엄격한 CSP 환경: `createBiewerView(el, { injectStyles: false })` + 소비자가 `@deepnoid/biewer/style.css` 를 직접 로드.
- WC 어댑터도 기본은 라이트 DOM + 런타임 주입(테마 override 경로를 단일하게 유지). shadow DOM 캡슐화는 후속 옵션.

## 8. 불변식 (리뷰 체크리스트)

- 코어 소스에 `react` / `vue` import 가 있으면 결함. 코어는 `HTMLElement` 와 표준 DOM/Canvas/WebGL/Worker API 만 쓴다.
- 어댑터에 렌더/디코딩/도구 **로직**이 있으면 결함 — 어댑터는 수명 바인딩과 prop↔setter 변환만.
- 새 기능은 코어에 먼저 구현하고, 그다음 두 어댑터에 노출한다. 어댑터에만 있는 기능 금지.
- 코어 콜백/구독은 프레임워크 중립 시그니처(순수 함수/CustomEvent)로 유지.
