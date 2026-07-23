# Data Flow — source 주입에서 화면 출력까지

> 파이프라인 한 장 요약. 각 단계의 요구/AC 는 해당 PRD 가 SSOT.
> 연관: [`../../prd/prd-format-support.md`](../../prd/prd-format-support.md), [`../../prd/prd-output-modes.md`](../../prd/prd-output-modes.md), [`../../prd/prd-tool-binding.md`](../../prd/prd-tool-binding.md)

---

## 1. 전체 파이프라인

```text
host
 │  source={ kind: 'url' | 'file' | 'buffer' }
 ▼
[1] Acquire        url → httpClient fetch / file → read / buffer → 그대로   (abortable)
 ▼
[2] Unwrap         gz 해제, zip 엔트리 열람·필터·정렬 → 바이트(들)          (컨테이너만 해당)
 ▼
[3] Sniff          format 힌트 → 확장자 → magic bytes(최종 판정)
 ▼
[4] Decode         내장/등록 디코더가 Web Worker 에서 픽셀 생산 (transferable)
 ▼
[5] Normalize      FrameSource { frameCount, getFrame(i), pixelType, meta }
 │                     이미지=1 · animated/스택/시리즈=N · 볼륨=선택 축(native|3축) 슬라이스 N
 │                     동영상=ceil(duration/step)
 ▼                     └─ onSourceReady(FrameSourceInfo) · onProgress(fetch/decode) → host
[6] Render         <BiewerView> — 이미지/동영상=Canvas 2D · gray 볼륨=WebGL(W/L 셰이더) — ViewState 합성
 ▲        ▲
 │        └── [7] ToolController   드래그/조작 → ViewState 변경 (scope: all/active)
 └──────────  [8] PlaybackController  slice(wheel/키, rAF coalesce) / auto(play·pause·stop)
                                      → frame index 변경 → onFrameChange → host
```

## 2. 단계별 계약 요점

| 단계 | 요점 | 근거 |
|---|---|---|
| [1] Acquire | fetch 정책(인증/재시도)은 주입된 httpClient 소관. source 교체/unmount 시 abort. 진행률 통지(onProgress) | [source-contract](../../source-contract.md) §1·§5·§6 |
| [2] Unwrap | zip 혼합 포맷은 최다 그룹 채택 + 경고. silent 선택 금지 | source-contract §3 |
| [3] Sniff | 확장자↔바이트 충돌 시 바이트 우선 | source-contract §2 |
| [4] Decode | 메인 스레드 long task 금지. 워커 URL 은 `setWorkerFactory` | prd-format-support §4 |
| [5] Normalize | gray 픽셀은 W/L 적용 가능 형태 유지(RGBA 로 미리 굽지 않음) | prd-format-support §4 |
| [5] Normalize+ | 볼륨 3축 선택은 워커 리샘플(orientation 해석, 비등방 보정) | prd-format-support §4 |
| [6] Render | 포맷별 하이브리드(D3): 이미지/동영상=Canvas 2D, gray 볼륨=WebGL. ResizeObserver 추종, dpr, overlay slot 불간섭 | prd-view-layout §4 |
| [7] Tools | headless. 입력은 뷰가 수신, 전파는 컨트롤러 scope 정책 | prd-tool-binding §4 |
| [8] Playback | 모드 공용 frame index. wheel rAF coalescing, auto 는 rAF 시간 기준 | prd-output-modes §4 |

## 3. 캐싱/수명

- 디코딩 결과는 source 식별자 키로 인스턴스 캐시 — 같은 source 재바인딩 시 재디코딩 없음.
- 프레임 픽셀은 LRU 로 상한 관리(대용량 동영상 step 프레임). 볼륨은 통짜 유지(슬라이스 조회가 zero-copy).
- unmount 시: 진행 중 작업 abort → 워커 참조 해제 → 캐시는 소유 인스턴스와 함께 소멸(모듈 전역 캐시 금지).

## 4. 스레드 경계

```text
main thread          │ worker(s)
─────────────────────┼──────────────────────────
Acquire(fetch)       │
Unwrap(zip 목록)     │ gz/대형 해제, entry 디코딩
Sniff                │
                     │ Decode (nifti parse, jpeg-ls, dicom pixel …)
Normalize(래핑)      │
Render/Tools/Playback│
```

원칙: **픽셀을 만드는 일은 워커, 픽셀을 그리는 일은 메인.** 경계는 transferable 로만 넘는다.
