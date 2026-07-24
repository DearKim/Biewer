# Biewer Spec — 범용 영상 출력 플러그인

> 이 문서는 Biewer 요구사항의 **SSOT** 다. 각 영역의 상세 요구/엣지/수용 기준은 [`prd/`](prd/index.md) 의 PRD 가 이어받는다.
> 연관: [`reference/architecture/boundary.md`](reference/architecture/boundary.md), [`reference/types/index.md`](reference/types/index.md)

---

## 1. 정체성

### 배경 — 문제의식

뷰어 플러그인은 "제품이 사용하는 뷰어"로 출발해도, 실제 운영에서 **각 제품에 필요한 기능을 뷰어 안에 새로
추가하는** 방식으로 쉽게 변질된다. viewType 프리셋, 제품별 레이아웃, 도메인 특화 뷰, 툴바 구성까지 플러그인이
소유하기 시작하면 — 제품 요구가 생길 때마다 플러그인 배포가 필요해지고, 공용 패키지가 특정 제품 코드로 오염되며,
경계가 무너진다.

### Biewer 의 정의

Biewer 는 **단순 영상 출력 플러그인**이다.

> **우리는 포맷·도구 등 영상 출력만 맡는다. 그 외 모든 사용 방식은 사용자/제품이 온전히 커스터마이징한다.**

| | Biewer(플러그인)가 소유 | host(제품/사용자)가 소유 |
|---|---|---|
| 데이터 | 포맷 판별·디코딩, FrameSource 정규화 | 데이터가 어디서 오는지(백엔드 계약, 인증, fetch 정책) |
| 화면 | 단일 뷰(`<BiewerView>`) 렌더링 | 레이아웃 구성(몇 개를 어떻게 배치할지), 페이지/라우팅 |
| 재생 | 출력 모드 엔진(slice / auto) | 어떤 모드를 언제 쓸지, 재생 UI |
| 도구 | 도구 프리미티브 + 바인딩 모델(headless) | 툴바/버튼 UI, 도구 정책(어떤 뷰에 어떤 도구) |
| 도메인 | — (없음) | 스터디/환자/판독/AI 결과 등 모든 도메인 개념 |

### 설계 원칙

- **P1. 출력만 소유한다.** 도메인 개념(스터디, 병변, 판독 상태…)이 플러그인 코드·기본값에 들어오면 안 된다. 요구는 일반 프리미티브/확장점으로만 수용한다. ([boundary.md](reference/architecture/boundary.md) §3 수용 판정)
- **P2. 모든 입력은 FrameSource 로 정규화한다.** 이미지 1장도, NIfTI 볼륨도, mp4 도 "프레임 시퀀스" 하나로 수렴한다. 뷰·도구·재생은 FrameSource 위에서만 동작한다 → 포맷이 늘어도 출력 경로는 하나.
- **P3. 레이아웃은 만들지 않는다.** viewType/분할 프리셋 없음. `<BiewerView>` 는 부모 컨테이너를 채울 뿐, 배치는 host 의 CSS/컴포넌트다.
- **P4. 도구는 headless + 바인딩.** 도구 로직(상태/조작)만 제공하고 UI 는 제공하지 않는다. 컨트롤러 하나를 여러 뷰에 바인딩하면 동시 적용, 뷰마다 만들면 개별 제어.
- **P5. 신규 기능은 opt-in default OFF.** 기존 소비자 무회귀가 기본값보다 우선한다.

---

## 2. 지원 포맷 (요구 1)

모든 포맷은 디코딩 후 **FrameSource** 로 정규화된다. 상세: [`prd/prd-format-support.md`](prd/prd-format-support.md)

| 분류 | 포맷 | 디코딩 경로(계획) | FrameSource 해석 |
|---|---|---|---|
| 이미지 | `webp` `jpeg` `png` | 브라우저 네이티브(`createImageBitmap`). animated webp/gif 는 `ImageDecoder` 프레임화(+폴백) | 1 frame. 스택 입력·애니메이션은 N frames |
| 이미지 | `jpeg-ls` | WASM codec 워커(charls 계열) | 동일 |
| 의료 볼륨 | `nii` `nii.gz` | `nifti-reader-js` 워커 파싱 | **선택 축** 기준 N frames — `axis: native(기본) \| axial \| coronal \| sagittal` |
| 의료 볼륨 | `dcm` | DICOM 파서 + **코덱 풀 세트**(uncompressed·JPEG-LS·JPEG2000·RLE·JPEG Baseline) | 단일 multiframe 또는 시리즈 정렬 후 N frames, 축 선택 동일 |
| 동영상 | `mp4` | `HTMLVideoElement` seek 기반 (WebCodecs 는 후속 최적화) | 시간 축 샘플 N frames — `frameCount = ceil(duration / step)` |
| 압축/컨테이너 | `gz` | 스트림 해제(`DecompressionStream`/fflate) → 내부 바이트 재판별 | 내부 포맷을 따름 |
| 압축/컨테이너 | `zip` | 엔트리 열람 → 지원 포맷 필터·정렬 | 이미지 zip = 스택, DICOM zip = 시리즈 |

- **판별 규칙**: 확장자 힌트 → **magic bytes 스니핑**이 최종 판정. (백엔드가 content-type 을 틀리거나 404 HTML 이 와도 오판하지 않아야 한다.)
- **확장 규칙**: 목록에 없는 포맷은 `registerDecoder()` 레지스트리로 host/후속 버전이 추가한다. 코어는 판별·정규화 파이프라인만 소유.

---

## 3. 출력 모드 (요구 2)

하나의 **PlaybackController** 가 두 모드를 통합한다. 모드는 언제든 전환 가능하며, 현재 프레임 인덱스를 공유한다.
상세: [`prd/prd-output-modes.md`](prd/prd-output-modes.md)

### 3.1 slice 모드 (수동 탐색)

- 스크롤(wheel) / 드래그 / 키보드 / 스크롤바로 프레임 인덱스를 이동한다.
- **동영상 소스의 slice 화**: 스크롤 1 step = 사용자 설정 시간 step 만큼 seek.
  - `videoStep`(초)은 host/사용자 선택: `0.1s ~ N s` 범위. (예: 1초 → 60초 영상 = 60 frames)
  - step 변경 시 frameCount 를 재양자화하고 현재 시간과 가장 가까운 인덱스를 유지한다.
- 고빈도 wheel(Mac 트랙패드)은 rAF coalescing 필수 — 프레임당 최대 1회 렌더.

### 3.2 auto 모드 (자동 재생)

- 영상 재생처럼 프레임을 자동 이동한다: **play / pause / stop**(stop = 정지 + 시작점 복귀).
- 옵션: 속도(fps 또는 배속), loop(`none | loop`), 재생 구간(range), 방향(정/역).
- 모든 FrameSource 에 동작한다 — 이미지 스택/볼륨은 cine 재생, 동영상은 네이티브 재생(또는 step 양자화 재생).

---

## 4. 뷰와 레이아웃 (요구 3)

Biewer 는 **단순 View 출력만** 제공한다. 상세: [`prd/prd-view-layout.md`](prd/prd-view-layout.md)

- 제공: 단일 뷰(코어 `createBiewerView`, React `<BiewerView>`, WC `<biewer-view>`) — FrameSource 1개를 그리는 뷰포트. 부모 컨테이너 크기를 채우고 리사이즈를 추종한다(ResizeObserver — window resize 이벤트만으로는 CSS 축소를 못 따라간다).
- 비제공: 레이아웃 엔진, viewType 프리셋, 분할 규칙. **몇 개의 뷰를 어떻게 배치할지는 전적으로 host 선택.**
- 뷰 위 커스텀 UI 는 **overlay slot**(children)으로 host 가 직접 그린다 (라벨, 배지, 도메인 오버레이 등).

---

## 5. 도구 (요구 4)

도구는 **각 뷰에 직접 연결**되고, **외부 hook 으로** host 가 원하는 구조로 조합한다. 상세: [`prd/prd-tool-binding.md`](prd/prd-tool-binding.md)

- `useBiewerTools()` → **ToolController** (headless). 뷰의 `tools` prop 에 바인딩한다.
- **바인딩 모델이 곧 제어 구조다:**
  - 컨트롤러 1개 ↔ 뷰 N개 = **여러 레이아웃(뷰)에 동시 적용** (비교 그리드 sync 등)
  - 컨트롤러 1개 ↔ 뷰 1개 = **레이아웃별 개별 컨트롤**
  - `scope: 'all'(기본) | 'active'` — 조작을 바인딩된 전체 뷰에 방송(기본)할지, 활성 뷰에만 적용할지 선택 (공유 툴바 + 활성 뷰 조작 패턴 지원)
- MVP 도구: `zoom` `pan` `rotate` `flip(H/V)` `invert` `window-level` `reset` + **측정 세트** `ruler` `circle` `polygon` + undo/redo ([prd-measurement.md](prd/prd-measurement.md) — 저장은 host). 프레임 이동은 PlaybackController 소관.
- 툴바 UI 는 제공하지 않는다. 컨트롤러가 상태 구독/imperative API 를 노출하고, host 가 자기 디자인 시스템으로 버튼을 만든다.

---

## 6. Out of Scope (v0 기준)

| 항목 | 이유 / 대안 |
|---|---|
| 레이아웃 엔진, viewType 프리셋 | P3. host 가 CSS 로 구성 |
| 툴바/컨트롤 UI 컴포넌트 | P4. headless 컨트롤러만 제공 |
| 인증, 백엔드 엔드포인트 계약 | host 소유. [`source-contract.md`](source-contract.md) 의 주입 계약만 정의 |
| 3-plane 동시 MPR 뷰·crosshair 연동 | 후속 검토. v0 은 단일 축 슬라이스 뷰(3축 중 선택, D6) + 3D VR(아래) |
| ~~VR(볼륨 렌더)~~ → **In-Scope (구현됨)** | WebGL2 레이캐스터(DVR/MIP)로 구현. `createBiewerVolumeView` / `<biewer-volume>` / `<BiewerVolume>`. VTK.js 무의존. transfer-function 에디터·컷플레인·3D 측정은 후속 |
| 비직교(oblique) reslice | 후속 |
| SEG/AI 결과 오버레이, 각도/화살표/텍스트 주석 | 후속. overlay slot 으로 host 가 우선 대응 (측정 세트는 In-Scope — D9) |

---

## 7. 로드맵

| 마일스톤 | 내용 |
|---|---|
| M0 (현재) | 스펙/PRD/reference 문서 확정 + 설계 결정 12건(§8) |
| M1 | 코어: 판별→디코딩(워커)→FrameSource(+진행률 D8), `<BiewerView>` 이미지/nii 렌더(Canvas 2D), slice 모드. **쇼케이스 사이트 병행 시작(D4)** |
| M2 | dcm 시리즈 + 코덱 풀 세트(D5)·zip/gz·animated 이미지(D7), 볼륨 3축 선택 리샘플(D6), gray 볼륨 WebGL 경로(D3), auto 모드 완성 |
| M3 | ToolController + 바인딩 모델(scope 기본 'all', D10), mp4 slice/auto(D12), jpeg-ls 워커 코덱 |
| M4 | 측정 세트(D9: ruler/circle/polygon + undo/redo), registry 발행 파이프라인(D1), 안정화 → `0.1.0` |

---

## 8. 결정 기록 (Decision Log)

2026-07-21 설계 Q&A 로 확정. 각 결정의 대안·트레이드오프는 해당 PRD 의 "미결" 항목에 남아 있다.

| # | 결정 사항 | 선택 |
|---|---|---|
| D1 | 배포 방식 | **GitLab npm registry 발행** (`publishConfig`) |
| D2 | React peer 범위 | **`^18 \|\| ^19`** |
| D3 | 렌더링 기술 | **포맷별 하이브리드** — 이미지/동영상 = Canvas 2D, gray 의료 볼륨 = WebGL(W/L 셰이더). 공개 API 는 렌더 기술 비노출 |
| D4 | 쇼케이스 사이트 | **M1 부터 병행** (examples/docs — 살아있는 스펙) |
| D5 | DICOM 코덱 범위 | **풀 세트** — uncompressed·JPEG-LS·JPEG2000·RLE·JPEG Baseline |
| D6 | 볼륨 슬라이스 축 | **3축 선택 포함** — `axis: 'native'(기본) \| 'axial' \| 'coronal' \| 'sagittal'` |
| D7 | animated webp/gif | **v0 프레임화 포함** — `ImageDecoder` + Safari 폴백 |
| D8 | 진행률 통지 | **v0 포함** — `onProgress` (fetch/decode 단계, UI 는 host) |
| D9 | 측정 도구 | **표준 측정 세트 제공** — ruler/circle/polygon + undo/redo. 저장은 host ([prd-measurement.md](prd/prd-measurement.md)) |
| D10 | ToolController scope 기본값 | **`'all'`** — "같은 컨트롤러에 묶으면 함께 움직인다" |
| D11 | 내장 스크롤바 | **opt-in, default OFF** (`scrollbar` prop) |
| D12 | mp4 프레임 추출 | **video element seek** — WebCodecs 는 후속 최적화 슬롯 |

제안 기본값(마이너 — 이의 시 조정): auto 기본 속도 = 스택/볼륨 10fps·동영상 원속(1.0x) / `capture()` 출력 = PNG / `apply()` 호출 단위 scope override 미지원(컨트롤러 단위만).
