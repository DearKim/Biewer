# PRD Index

> 기능별 요구/범위/수용 기준 추적의 SSOT. 상위 요구사항 총론은 [`../spec.md`](../spec.md).
> PRD 포맷: 배경 및 문제 정의(As-Is/To-Be) → 사용자 목표 → 범위(In/Out) → 기능 요구사항 → 엣지 케이스 → 수용 기준 → 미결.

| PRD | 스펙 대응 | 내용 |
|---|---|---|
| [prd-format-support.md](prd-format-support.md) | spec §2 (요구 1) | 이미지/의료 볼륨/동영상/압축 포맷 판별·디코딩·FrameSource 정규화 |
| [prd-output-modes.md](prd-output-modes.md) | spec §3 (요구 2) | slice 모드(동영상 step seek 포함) + auto 재생 모드 |
| [prd-view-layout.md](prd-view-layout.md) | spec §4 (요구 3) | 단일 뷰 출력, host 소유 레이아웃, overlay slot, 리사이즈 계약 |
| [prd-tool-binding.md](prd-tool-binding.md) | spec §5 (요구 4) | headless 도구 컨트롤러, 뷰 바인딩(1:1 / 1:N), scope 정책 |
| [prd-measurement.md](prd-measurement.md) | spec §5·§8(D9) | ruler/circle/polygon 측정 세트 + undo/redo — 저장은 host 소유 |

새 PRD 추가 시: 파일 생성 → 이 표에 등록 → `spec.md` 에서 링크.
