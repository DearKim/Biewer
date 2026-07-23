# Biewer Reference Documentation

> **MUST READ FIRST** — reference 문서의 진입점. 이 파일을 읽고 필요한 카테고리 index 로 이동한다.

## Module Overview

범용 영상 출력 React 플러그인. **React 18/19 + TypeScript + Canvas 2D·WebGL 하이브리드 + Web Worker.**
입력(이미지/의료 볼륨/동영상/압축)을 FrameSource 로 정규화해 단일 뷰(`<BiewerView>`)로 출력하고,
출력 모드(slice/auto)와 headless 도구 컨트롤러를 제공한다. 레이아웃·툴바 UI·도메인은 host 소유.

- 요구사항 SSOT: [`../spec.md`](../spec.md)
- 상태: **설계 단계** — 아래 구조는 구현 착수 시 실제 경로로 갱신한다.

## How to Use This Documentation

### 새 기능을 구현할 때
1. 이 파일 (완료)
2. [`architecture/boundary.md`](architecture/boundary.md) — 이 기능이 플러그인 소관인지부터 판정
3. [`architecture/data-flow.md`](architecture/data-flow.md) — 파이프라인 내 위치 파악
4. [`types/index.md`](types/index.md) — 계약 타입
5. 해당 [`skills/`](skills/index.md) 문서

### 기존 코드를 수정할 때
1. 이 파일 (완료)
2. 해당 skill 문서 → 연결된 PRD 의 수용 기준(AC) 확인

## Directory Map

| 경로 | 내용 |
|---|---|
| [`architecture/`](architecture/index.md) | 경계 정책, 데이터 플로우, (구현 후) 컴포넌트 트리 |
| [`types/`](types/index.md) | `BiewerSource` / `FrameSource` / `ToolController` / `PlaybackController` 타입 초안 |
| [`skills/`](skills/index.md) | 기능 단위 자기완결 구현 가이드 — 구현과 함께 작성 |
