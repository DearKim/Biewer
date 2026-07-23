# Boundary — 플러그인 ↔ host 책임 경계

> Biewer 의 제1원칙 문서. 모든 기능 요구는 여기의 판정을 먼저 통과해야 한다.
> 연관: [`../../spec.md`](../../spec.md) §1, [`framework-adapters.md`](framework-adapters.md)

---

## 1. 왜 이 문서가 있는가

"제품이 사용하는 뷰어"는 요구가 쌓이면 "제품 기능이 뷰어 안으로 들어오는" 방향으로 쉽게 변질된다.
viewType 프리셋, 제품별 레이아웃, 도메인 특화 뷰, 툴바 구성 규칙이 플러그인 내부에 누적되면 —
제품 요구 하나에 플러그인 릴리스가 필요해지고, 유지보수 표면이 폭발하며, 특정 제품에만 쓰이는 코드가 공용 패키지를 오염시킨다.

Biewer 는 반대 방향을 규칙으로 못 박는다: **출력은 플러그인, 조합은 host.**

## 2. 책임 매트릭스

| 영역 | Biewer 소유 | host 소유 | 경계 장치 |
|---|---|---|---|
| 데이터 조달 | — | 백엔드 계약, 인증, fetch 정책 | `BiewerSource` + `setHttpClient` 주입 ([source-contract](../../source-contract.md)) |
| 포맷 | 판별·디코딩·FrameSource 정규화 | 커스텀 포맷 필요 시 디코더 제공 | `registerDecoder` |
| 뷰 | 단일 뷰 렌더, 리사이즈 추종, dpr | 뷰를 몇 개 어디에 배치할지 | 코어 `createBiewerView(el)` 가 컨테이너를 채울 뿐 |
| 레이아웃 | **없음** | grid/flex/분할/전체화면 전부 | 레이아웃 API 자체를 만들지 않음 |
| 출력 모드 | slice/auto 엔진 | 모드 선택 UI, 재생 버튼 | `PlaybackController` (headless) |
| 도구 | 도구 로직·바인딩 모델 | 툴바 UI, 도구 정책(어떤 뷰에 어떤 도구) | `ToolController` (headless) + `enabledTools` |
| 뷰 위 UI | overlay slot 제공 | slot 에 그릴 내용 전부 | overlay 컨테이너 + `pointer-events` 규약 |
| 프레임워크 | 코어(vanilla TS) + React·WC 어댑터 | 그 외 스택(Vue/Angular/HTML…)의 결합 | Web Component 표준 + imperative 코어 ([framework-adapters](framework-adapters.md)) |
| 도메인 | **없음** | 스터디/환자/판독/AI 결과/워크리스트 | 도메인 개념의 코드 유입 금지 |
| 스타일 | `bw-` prefix 기본 스타일, CSS 변수 | 테마/브랜딩 | `--bw-*` override |

## 3. 요구 수용 판정 절차

새 요구가 오면 순서대로 묻는다:

1. **도메인 지식이 필요한가?** (특정 제품 화면·스터디·병변…을 알아야 하는가)
   → YES: host 구현. 부족한 **일반 확장점**(옵션/slot/hook/registry)만 추가한다.
2. **포맷/렌더/출력/도구 프리미티브로 일반화되는가?**
   → YES: 일반화된 형태로만 수용. 제품 이름·정책이 코드/기본값에 남으면 리뷰에서 거부.
3. **특정 프레임워크에 묶이는가?**
   → 로직은 코어(vanilla TS)에 넣고 어댑터로만 노출한다. 어댑터에만 존재하는 기능 금지.
4. **기본 동작을 바꾸는가?**
   → 신규 기능은 opt-in default OFF. 기존 소비자 무회귀.

### 판정 예시

| 요구 | 판정 |
|---|---|
| "뷰 위에 병변 개수 배지를 띄워달라" | host — overlay slot 으로 직접 그린다 |
| "TIFF 도 열리게 해달라" | 플러그인 — 디코더 추가 (또는 host 가 `registerDecoder`) |
| "우리 제품은 2x2 로 4개 스터디 비교" | host — grid + 컨트롤러 1개 `scope:'all'` 바인딩 |
| "Vue 에서도 쓰고 싶다" | 플러그인 — `<biewer-view>` Web Component 로 이미 커버 (신규 어댑터 불필요) |
| "스크롤 방향을 반대로" | 플러그인 — 일반 옵션(`invertScroll`) 으로 수용, default 기존 유지 |
| "판독 완료 상태면 도구를 잠가달라" | host — 상태는 host 것. `enabledTools: []` 로 조합 |

## 4. 경계가 무너지는 신호 (리뷰 체크리스트)

- 플러그인 코드/기본값에 제품·도메인 명사가 등장한다
- "이 viewType 일 때만" 식의 프리셋 분기가 생긴다
- 내장 UI 를 깎아내는 옵션(`hideX`)이 늘어난다 → UI 를 내장한 것 자체가 잘못된 신호
- 코어 소스에 `react`/`vue` import 가 들어온다 → 어댑터로 내려야 할 로직
- 특정 host 만 쓰는 전역 setter 가 추가된다
