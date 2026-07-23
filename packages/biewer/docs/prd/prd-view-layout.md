# PRD — View & Layout (단일 뷰 출력, 레이아웃은 host 소유)

> Biewer 는 `<BiewerView>` 하나만 제공하고, 배치는 전적으로 host 가 구성한다.
> 연관: [`../spec.md`](../spec.md) §4, [`../reference/architecture/boundary.md`](../reference/architecture/boundary.md)

---

## 1. 배경 및 문제 정의

### As-Is
기존 뷰어는 15+ viewType(2x2, 3분할, 1x2 …)을 플러그인 내부 레이아웃 테이블로 소유한다.
제품이 새 배치를 원할 때마다 플러그인에 제품 전용 viewType 을 추가해야 했고,
레이아웃·오버레이·인터랙션 히트테스트가 플러그인 내부에서 3중으로 하드코딩되는 부채가 생겼다.

### To-Be
- Biewer 는 **단순 View 출력만** 한다. 레이아웃 개념 자체가 플러그인에 없다.
- host 는 `<BiewerView>` 를 원하는 개수만큼, 원하는 CSS(grid/flex/absolute)로 배치한다.
- 뷰는 컨테이너를 채우고 리사이즈를 스스로 추종한다 — host 는 크기만 정하면 된다.

## 2. 사용자 목표
- 1x1, 2x2, 1x3, 자유 분할… 어떤 배치든 host 코드만으로 즉시 구성
- 창/패널 리사이즈 시 뷰가 어긋나거나 밀리지 않는다

## 3. 범위

### In-Scope
- `<BiewerView>`: FrameSource 1개 렌더, 컨테이너 100% 채움, ResizeObserver 리사이즈 추종
- overlay slot(children): host 커스텀 UI 를 뷰 위에 absolute 합성
- 활성(focus) 상태: 뷰 단위 활성 통지(`onActivate`) — 표시는 host 선택(`showFocusBorder` 류 opt-in)
- imperative handle: `resize()`, `capture()`, `getFrame()/setFrame()`

### Out-of-Scope
- 레이아웃 엔진, viewType/분할 프리셋, 셀 간 드래그 재배치
- 뷰 간 crosshair/좌표 연동 (후속 — 도구 확장으로 검토)
- 전체화면 관리 (host 가 컨테이너를 fullscreen 으로 만들면 뷰는 리사이즈로 따라간다)

## 4. 기능 요구사항

- 뷰 루트는 `width/height: 100%` — 크기 결정권은 항상 host 컨테이너에 있다.
- **ResizeObserver 로 컨테이너 크기 변화를 감지**해 같은 프레임에 캔버스 backing size 를 갱신한다.
  window `resize` 이벤트에만 의존하지 않는다 (window resize 이벤트만으로는 CSS 로 인한 컨테이너 축소를 따라가지 못한다).
- devicePixelRatio 를 반영해 렌더 해상도를 잡는다 (고해상도 디스플레이에서 흐릿함 금지).
- overlay slot:
  - children 은 뷰 캔버스 위 absolute 컨테이너에 렌더된다. 기본 `pointer-events: none`,
    host 가 요소 단위로 `pointer-events: auto` 를 켠다 (뷰 인터랙션과 충돌 방지).
  - 플러그인 CSS 가 slot 내용의 크기/배치를 강제하지 않는다 (catch-all `w/h:100%!important` 류 규칙은 slot 에 넣은 툴팁 등을 의도치 않게 풀사이즈로 만든다).
- 활성 상태:
  - 클릭·wheel 등 모든 인터랙션 시작 시 `onActivate` 통지 (hover 는 활성으로 보지 않는다).
  - 내장 포커스 테두리는 opt-in(`showFocusBorder`, 기본 off). 멀티 뷰 그리드에서 host 가 선택 표시를 소유할 수 있어야 한다 (기본 on 은 멀티 인스턴스에서 stuck border 를 유발한다).
- 뷰 배경/테두리 등 노출 스타일은 CSS 변수(`--bw-*`)로 host 가 덮을 수 있다. 클래스는 전부 `bw-` prefix.

## 5. 엣지 케이스

- 컨테이너가 0px(숨김 탭 등)에서 표시로 전환 → ResizeObserver 발화 시 정상 복구, 그동안 렌더 skip.
- 같은 뷰를 unmount 없이 다른 grid 셀로 이동(reparent) → 다음 리사이즈에서 정합.
- 매우 작은 셀(<100px) → 렌더는 유지, 내장 UI(스크롤바 등)는 자동 축소/숨김.
- source 로딩 중 리사이즈 → 로딩 완료 시 최신 크기로 첫 렌더.

## 6. 수용 기준 (AC)

1. host 가 CSS grid 만으로 1x1 / 2x2 / 1x3 배치를 구성할 수 있고, 플러그인 API 에 레이아웃 개념이 등장하지 않는다.
2. 패널 드래그로 뷰 크기를 연속 변경해도 캔버스가 컨테이너를 벗어나거나 한 프레임 늦게 따라오지 않는다.
3. overlay slot 에 넣은 badge 가 뷰 인터랙션(드래그/휠)을 막지 않는다.
4. 2x2 그리드에서 셀 클릭/휠 시 해당 뷰만 `onActivate` 되고, 내장 테두리는 기본적으로 그려지지 않는다.
5. dpr=2 디스플레이에서 1:1 픽셀 선명도로 렌더된다.

## 7. 미결

- 뷰 간 연동(pan/zoom sync 외 crosshair 등)을 도구 확장으로 넣을지, 별도 계약으로 둘지
- `capture()` 출력 포맷(png 고정 vs 옵션)
