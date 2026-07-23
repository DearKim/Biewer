# PRD — Measurement (측정 도구 세트)

> ruler / circle / polygon 측정 + undo/redo. 표준 의료영상 측정 세트를 Biewer 경계(저장은 host)에 맞게 제공한다.
> 연관: [`prd-tool-binding.md`](prd-tool-binding.md), [`../spec.md`](../spec.md) §5·§8(D9)

---

## 1. 배경 및 문제 정의

### As-Is
기존 뷰어는 ruler/circle/polygon + undo/redo + 저장(save)을 플러그인이 소유하고, 저장이 고정 백엔드 계약에 묶여 있다.

### To-Be
- 측정 **로직·렌더·편집 상태**는 Biewer 가 소유한다 (설계 결정 D9).
- 측정 **저장/불러오기**는 host 가 소유한다 — Biewer 는 직렬화 가능한 `Measurement[]` 를 controlled prop 으로 주고받을 뿐, 백엔드를 모른다.

## 2. 사용자 목표
- 프레임 위에 길이/원/다각형을 그리고 수치(mm 또는 px)를 확인한다
- 실수를 undo/redo 로 되돌린다
- host 는 측정 결과를 자기 백엔드에 저장하고, 다시 열 때 그대로 복원한다

## 3. 범위

### In-Scope

| 도구 | 동작 | 수치 |
|---|---|---|
| `ruler` | 두 점 직선 드래그 | 길이 — spacing 메타 있으면 mm, 없으면 px |
| `circle` | 중심→반경 드래그 | 반지름/지름, 면적 |
| `polygon` | 클릭 다각형(더블클릭 닫기) | 둘레, 면적 |
| undo/redo | 측정 추가/이동/삭제 이력 (뷰 단위 스택) | — |

### Out-of-Scope (후속)
- 각도/화살표/텍스트 주석
- 측정 라벨 스타일 커스터마이징 (v0 은 기본 스타일 + `--bw-*` CSS 변수)
- 저장 백엔드 — host 소유 (경계 원칙, [boundary.md](../reference/architecture/boundary.md))

## 4. 기능 요구사항

- 측정은 **frame 에 귀속**된다: 각 measurement 는 `frame` 인덱스를 갖고 해당 프레임에서만 표시된다.
  동영상 소스는 `videoStep` 재양자화 시 시간(초) 기준으로 가장 가까운 프레임에 재귀속.
- 좌표는 **이미지 좌표계(px)** 로 저장한다 — zoom/pan/rotate/flip 과 무관하게 안정. 표시 시 ViewState 로 변환하며,
  변환은 단일 함수 경로로 유지한다 (변환 경로가 갈라지면 리사이즈/줌 중 좌표가 어긋난다 — 좌표 어긋남은 결함이다).
- mm 환산은 `meta.spacing` 이 있을 때만. 선택된 축(axial/coronal/sagittal)의 평면 내 spacing 을 사용하고, 비등방이면 각 축 값을 따로 적용한다.
- controlled 모델: `measurements` / `defaultMeasurements` / `onMeasurementsChange`. host 는 이 배열을 JSON 직렬화해 저장/복원한다 (왕복 무손실).
- undo/redo 는 ToolController API(`tools.undo()` / `tools.redo()`).
- 그리기 규칙: 측정 도구 활성 시 좌드래그는 측정에 귀속(다른 도구와 충돌 금지), `ESC` 로 진행 중 도형 취소.
- 렌더는 픽셀 레이어와 분리된 뷰 위 오버레이 레이어(canvas/SVG), dpr 반영.
- `scope:'all'` 컨트롤러에서도 **측정 그리기는 활성 뷰에만** 적용된다 — 측정은 조작(transform)이 아니라 뷰 데이터이므로 방송 대상이 아니다.

## 5. 엣지 케이스

- spacing 없는 소스(일반 이미지/동영상): px 단위 표기 + 단위 뱃지 표시.
- 회전/flip 상태에서 그리기: 이미지 좌표로 역변환해 저장 — transform 원복 시 동일 위치.
- polygon 최소 점(3) 미만에서 닫기 시도 → 도형 취소.
- 측정 도중 frame 이동 → 진행 중 도형 취소 (완료된 측정은 각자 frame 에 유지).
- source 교체: 측정은 source 와 함께 리셋. 보존이 필요하면 host 가 `measurements` 를 들고 있다가 재주입.

## 6. 수용 기준 (AC)

1. ruler/circle/polygon 을 그리고 수치가 spacing 유무에 따라 mm/px 로 표기된다.
2. zoom/pan/rotate/flip 후에도 측정이 이미지의 같은 위치에 붙어 있다.
3. undo → redo 가 마지막 편집을 정확히 왕복한다.
4. `onMeasurementsChange` 로 받은 배열을 재주입하면 동일하게 복원된다 (직렬화 왕복 무손실).
5. 다른 프레임으로 이동하면 해당 프레임의 측정만 보인다.
6. `scope:'all'` 비교 그리드에서 측정이 다른 뷰로 복제되지 않는다.

## 7. 미결

- polygon 자기교차 허용 여부(면적 계산 정의)
- 동영상 step 재양자화 시 귀속 규칙(가장 가까운 프레임 vs 시간 range) — 실사용 검증 후 확정
