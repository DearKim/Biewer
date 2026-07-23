# Architecture Index

> 읽는 순서: boundary → framework-adapters → data-flow. 컴포넌트 트리/상태 전략 문서는 구현 착수 시 추가한다.

| 문서 | 내용 |
|---|---|
| [boundary.md](boundary.md) | **플러그인 ↔ host 책임 경계** — 모든 설계 판정의 기준 (제1원칙) |
| [framework-adapters.md](framework-adapters.md) | **프레임워크 무관 코어 + React/Web Component 어댑터** 구조, 패키지·번들·스타일 배포 |
| [data-flow.md](data-flow.md) | source 주입 → 판별 → 워커 디코딩 → FrameSource → 뷰 렌더 → 도구/재생 파이프라인 |
| component-hierarchy.md | (구현 후 작성) 코어 인스턴스 트리, handle 구조 |
| state-management.md | (구현 후 작성) controlled/uncontrolled 상태 전략, 구독 모델 |
