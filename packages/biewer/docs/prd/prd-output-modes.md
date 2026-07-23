# PRD — Output Modes (slice / auto)

> FrameSource 위에서 동작하는 두 가지 출력 모드와 그것을 통합하는 PlaybackController.
> 연관: [`../spec.md`](../spec.md) §3, [`prd-format-support.md`](prd-format-support.md), [`../reference/types/index.md`](../reference/types/index.md)

---

## 1. 배경 및 문제 정의

### As-Is
기존 뷰어는 슬라이스 스크롤(수동)만 제공한다. 동영상 포맷은 다루지 못하고, 스택/볼륨의 자동 재생(cine)도 없다.

### To-Be
- **slice 모드**: 기존 방식의 수동 탐색을 모든 FrameSource 로 일반화. 동영상도 "스크롤로 넘기는 프레임"이 된다.
- **auto 모드**: 영상 재생처럼 시작/중단으로 프레임이 자동 이동. 볼륨/스택도 cine 재생.
- 두 모드는 하나의 컨트롤러에서 전환되며 현재 위치를 공유한다.

## 2. 사용자 목표
- 스크롤 한 칸이 항상 "다음 프레임"으로 예측 가능하게 동작
- 동영상은 원하는 시간 간격(1초, 0.5초, 0.1초…)으로 훑어볼 수 있다
- 재생 버튼 하나로 손을 떼고 관찰할 수 있다 (시작/중단/정지)

## 3. 범위

### In-Scope

| 모드 | 입력/컨트롤 | 대상 |
|---|---|---|
| slice | wheel / 드래그 / 키보드(←→↑↓) / 내장 스크롤바(opt-in) / `step(±n)` API | 모든 FrameSource |
| auto | `play` `pause` `stop` / 속도(fps) / loop / range / 방향 | 모든 FrameSource |

### Out-of-Scope (후속)
- pingpong loop, 구간 북마크
- 오디오 재생 (mp4 는 무음 프레임 소스로 취급)
- 다중 뷰 프레임 오프셋 동기(“+n 프레임 차이로 따라가기”)

## 4. 기능 요구사항

### 공통 — PlaybackController

- `useBiewerPlayback()` 로 생성, 뷰 `playback` prop 에 바인딩. **N개 뷰에 바인딩하면 프레임 이동이 동기화**된다.
- `mode: 'slice' | 'auto'` 전환 시 현재 프레임 인덱스를 유지한다.
- 프레임 인덱스는 controlled(`frame`/`onFrameChange`) 또는 컨트롤러 내부 상태(uncontrolled) 둘 다 지원.
- 컨트롤러 없이 `<BiewerView>` 단독 사용 시에도 기본 slice 탐색(wheel/키보드)은 동작한다.

### slice 모드

- wheel 1 노치 = 1 frame. 경계에서 멈춤(기본) — wrap 은 옵션.
- **고빈도 wheel(트랙패드) coalescing 필수**: 델타를 ref 에 누적하고 rAF 당 1회만 적용/렌더. 인덱스가 실제로 바뀔 때만 렌더 호출. (회귀 마커 대상)
- **동영상 slice 화**: `videoStep`(초) 단위 seek.
  - 허용 범위 `0.1 ~ N`(사용자/host 선택), 기본 `1`.
  - `frameCount = ceil(duration / videoStep)`. step 변경 시 현재 시각과 가장 가까운 인덱스로 재양자화.
  - seek 완료 전 연속 스크롤 시 마지막 목표만 반영(중간 seek 스킵).

### auto 모드

- `play()`: 현재 인덱스부터 자동 진행. `pause()`: 현재 위치 유지. `stop()`: 정지 + range 시작점 복귀.
- 속도: fps 지정 (기본 10fps). 동영상 소스는 배속으로도 지정 가능(`speed: 1.0` = 원속).
- `loop: 'none' | 'loop'` (기본 `none` — 끝에서 pause 상태로 정지).
- `range: [start, end]` 지정 시 그 구간만 재생. 미지정 시 전체.
- 재생 타이밍은 `requestAnimationFrame` 기반으로 프레임 드랍 시 인덱스를 건너뛰어 시간 정확도를 유지한다(고정 setInterval 금지).
- 동영상 + 원속 재생은 `HTMLVideoElement` 네이티브 재생 경로 사용 가능(내부 최적화) — 외부 계약(프레임 통지)은 동일.

## 5. 엣지 케이스

- frameCount = 1 (단일 이미지): slice 입력은 no-op, auto 는 `play()` 즉시 종료 상태.
- 재생 중 source 교체: `stop()` 상태로 리셋 후 새 소스 적용.
- 재생 중 탭 비활성(rAF 지연): 복귀 시 시간 기준으로 인덱스를 따라잡는다.
- `videoStep` 이 duration 보다 큼: frameCount = 1 로 클램프 + 경고 통지.
- controlled `frame` 과 auto 재생 동시 사용: 재생이 `onFrameChange` 를 호출하고 host 가 반영하는 단방향 루프 — 에코 가드 필수 (가드가 없으면 통지→반영→재통지 루프가 생긴다).

## 6. 수용 기준 (AC)

1. NIfTI 200 슬라이스에서 트랙패드 연속 스크롤 시 프레임당 최대 1회 렌더 (rAF coalescing 동작).
2. 60초 mp4 + `videoStep=1` → 60 frames, `videoStep=0.5` 변경 → 120 frames 로 재양자화되고 현재 위치 유지.
3. `play/pause/stop` 이 볼륨·이미지 스택·동영상 세 종류 모두에서 동일하게 동작.
4. 컨트롤러 1개를 2개 뷰에 바인딩하면 재생/스크롤이 두 뷰에서 함께 움직인다.
5. loop off 재생이 끝 프레임에서 멈추고, stop 은 range 시작점으로 복귀한다.

## 7. 미결

- ~~동영상 프레임 추출 경로~~ → **video element seek 로 확정** (D12, [spec §8](../spec.md)). WebCodecs 는 후속 최적화 슬롯.
- 기본 재생 속도는 제안 기본값으로 진행: **스택/볼륨 = 10fps, 동영상 = 원속(1.0x)** — 실사용 피드백으로 조정
