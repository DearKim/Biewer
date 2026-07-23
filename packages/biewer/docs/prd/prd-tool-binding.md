# PRD — Tool Binding (headless 도구 + 외부 hook 바인딩)

> 도구는 각 뷰에 직접 연결되고, 외부 hook(ToolController)으로 host 가 원하는 구조로 조합한다.
> 하나의 컨트롤러를 여러 뷰에 동시 적용할 수도, 뷰마다 개별 컨트롤로 쓸 수도 있다.
> 연관: [`../spec.md`](../spec.md) §5, [`prd-view-layout.md`](prd-view-layout.md), [`../reference/types/index.md`](../reference/types/index.md)

---

## 1. 배경 및 문제 정의

### As-Is
기존 뷰어는 툴바 UI·도구 노출 규칙(viewType 별 하드코딩)·도구 로직이 플러그인 안에 결합돼 있다.
제품이 자기 툴바를 만들려면 내장 UI 를 숨기는 옵션으로 깎아내고,
도구 상태·동기화용 외부 제어 prop 을 하나씩 뚫는 패치를 반복해야 했다.

### To-Be
- 도구 **로직**(모드, 조작, 상태)만 플러그인이 소유한다 — **headless**. 툴바 UI 는 host 가 자기 디자인 시스템으로 만든다.
- 입력(드래그/휠)은 **뷰가 수신**하고, 동작은 바인딩된 컨트롤러의 모드/정책을 따른다.
- **바인딩 모델이 곧 제어 구조**: 컨트롤러↔뷰 연결을 host 가 조합해 동기 그룹/개별 제어를 만든다.

## 2. 사용자 목표
- 자기 툴바 버튼으로 뷰의 도구를 제어한다 (플러그인 UI 없이)
- 비교 그리드에서 한 번의 조작(zoom 등)을 모든 뷰에 동시에 적용한다
- 특정 뷰만 다른 도구 상태를 갖게 한다 (뷰별 컨트롤러)

## 3. 범위

### In-Scope — MVP 도구

| 도구 | 동작 | 비고 |
|---|---|---|
| `zoom` | 드래그/`apply` 로 확대·축소 (anchor 기준) | |
| `pan` | 드래그 평행이동 | |
| `rotate` | 90° step (`apply('rotate', ±90)`) | 자유 회전은 후속 |
| `flip` | H/V 반전 | |
| `invert` | 픽셀 반전 | |
| `window-level` | 드래그로 WC/WW 조절 | gray 픽셀 소스에서 유효 |
| `reset` | 뷰 transform·W/L 초기화 | |
| `ruler` `circle` `polygon` | 측정 세트 + undo/redo | 상세: [prd-measurement.md](prd-measurement.md) (D9) |

프레임 이동은 도구가 아니라 [PlaybackController](prd-output-modes.md) 소관.

### Out-of-Scope (후속)
- 각도/화살표/텍스트 주석 — 측정 세트는 In-Scope ([prd-measurement.md](prd-measurement.md))
- 커서 스타일 세트 (기본 커서만)
- 도구 단축키 시스템 — host 가 keydown 에서 `setActiveTool` 호출로 대체 가능

## 4. 기능 요구사항

### ToolController (외부 hook)

- `useBiewerTools(options) → ToolController`. React 외부에서도 `createToolController()` 로 동일 객체 생성 가능(훅은 래퍼).
- 뷰 `tools` prop 으로 바인딩. 바인딩 수 제한 없음. 뷰 unmount 시 자동 해제.
- 상태: `activeTool`(드래그 제스처가 수행할 모드), 뷰별 transform 스냅샷.
- API: `setActiveTool(t)`, `apply(op, payload?)`, `reset()`, `undo()`, `redo()`, `getState()`, `subscribe(fn)` — host 툴바는 `subscribe` 로 렌더한다.
- `enabledTools` 화이트리스트: 목록 밖 도구는 모드 설정·입력 모두 무시 (UI 노출만 막고 입력 경로가 살아 있으면 화이트리스트가 무의미하다).

### 전파 범위 — `scope`

| scope | `apply`/드래그 조작의 대상 | 용도 |
|---|---|---|
| `'all'` (기본, D10) | 바인딩된 모든 뷰 | "같은 컨트롤러에 묶으면 함께 움직인다" — 비교 그리드 동시 적용(sync) |
| `'active'` | 마지막 인터랙션이 일어난(활성) 뷰 | 공유 툴바 + 뷰별 독립 상태 |

- `'all'` 에서 한 뷰에서 시작한 드래그 조작도 바인딩된 전체 뷰에 동일하게 적용된다.
- 단, **측정 그리기는 scope 무관 활성 뷰에만** 적용된다 — 측정은 transform 조작이 아니라 뷰 데이터다 ([prd-measurement.md](prd-measurement.md) §4).
- 활성 뷰 판정은 뷰의 활성 통지(`onActivate`, [prd-view-layout.md](prd-view-layout.md) §4)와 동일 이벤트를 사용한다.

### 입력 라우팅 (뷰 측)

- 좌드래그 = `activeTool` 실행. wheel = 프레임 이동(playback 소관) — 도구와 충돌하지 않는다.
- 컨트롤러 미바인딩 뷰는 도구 입력이 전부 비활성(표시 전용). 프레임 탐색만 가능.
- 드래그가 뷰 경계를 벗어나면 조작을 정지하고, 재진입 시 점프 없이 이어간다.
- mousemove 고빈도 조작(pan/W·L)은 rAF coalescing — 프레임당 1회 적용 (이벤트 빈도대로 적용하면 렌더가 입력에 끌려가 성능이 저하된다).

### 상태 소유

- transform(zoom/pan/rotation/flip/invert/W·L)은 **뷰 단위 상태**다. 컨트롤러는 모드 + 조작 전파 + 조회 창구이고,
  `scope:'all'` 은 "같은 조작을 모든 뷰에 적용"이지 상태 객체 공유가 아니다 (소스 크기가 달라도 각자 올바르게 적용).
- 초기 W/L 은 소스 메타(`defaultWindow`)에서, 없으면 자동 산출.

## 5. 엣지 케이스

- 하나의 뷰에 컨트롤러 2개 바인딩 시도 → 마지막 바인딩이 유효, dev 경고.
- `scope:'all'` 그룹에 프레임 수·크기가 다른 소스 혼재 → zoom/pan 은 정규화 비율로 적용, W/L 은 gray 소스에만 적용.
- 드래그 중 `setActiveTool` 변경 → 진행 중 제스처는 시작 시점 도구로 완료.
- 드래그 중 대상 뷰 unmount → 제스처 안전 종료 (리스너 누수 금지).
- `rotate` 후 flip → 순서 의존 결과를 고정 정의: flip 은 화면 기준(H=좌우) — 문서화된 순서 규칙 하나만 유지 (규칙이 둘 이상이면 회전·반전 조합 결과가 경로마다 달라진다).

## 6. 수용 기준 (AC)

1. 플러그인 UI 없이 host 버튼만으로 zoom/pan/rotate/flip/invert/W·L/reset 이 모두 동작한다.
2. 컨트롤러 1개 + 뷰 4개(`scope:'all'`) 에서 한 뷰의 드래그 zoom 이 4개 뷰에 동시에 적용된다.
3. 같은 그리드에서 뷰마다 컨트롤러를 따로 만들면 각 뷰가 독립적으로 제어된다.
4. `scope:'active'` 공유 툴바 구성에서 마지막 클릭한 뷰에만 `apply('rotate', 90)` 가 적용된다.
5. `enabledTools:['zoom']` 이면 pan 드래그·W/L 드래그가 어떤 입력 경로로도 동작하지 않는다.
6. 도구 상태 변경이 host `subscribe` 콜백으로 통지되어 툴바 active 표시를 렌더할 수 있다.

## 7. 미결

- `scope` 를 컨트롤러 옵션이 아니라 `apply(op, { scope })` 호출 단위로도 허용할지
- 두 컨트롤러 조합(모드는 공유, 조작은 개별) 요구가 실제로 나오는지 — 나오면 계층 바인딩 검토
