# Skills Index

> Each skill doc is a self-contained guide for implementing a specific feature.
> Read only the skill(s) you need.
>
> **상태: 카탈로그만 확정.** 각 skill 본문은 해당 기능 구현과 함께 작성한다 —
> 구현 없는 상상 가이드를 미리 쓰지 않는다. 작성 시 이 표의 상태를 갱신할 것.

## Pipeline & Formats

| Skill | What it covers | 연관 PRD | 상태 |
|-------|---------------|---------|------|
| skill-01-source-acquire.md | url/file/buffer 취득, httpClient, abort 수명, onProgress(fetch) | [source-contract](../../source-contract.md) | 계획 |
| skill-02-format-sniffing.md | 힌트→확장자→magic bytes 판별, 충돌 규칙 | [prd-format-support](../../prd/prd-format-support.md) | 계획 |
| skill-03-container-unwrap.md | gz 스트림 해제, zip 엔트리 필터·정렬(스택/시리즈) | prd-format-support | 계획 |
| skill-04-decode-workers.md | 워커 프로토콜, transferable, jpeg-ls/nifti/dicom 코덱 | prd-format-support | 계획 |
| skill-05-frame-source.md | FrameSource 정규화, 캐시(LRU/식별자 키), dispose | prd-format-support | 계획 |
| skill-06-video-source.md | mp4 seek 프레임화(video element — D12), videoStep 재양자화, seek 스킵 | [prd-output-modes](../../prd/prd-output-modes.md) | 계획 |
| skill-18-dicom-codecs.md | DICOM transfer syntax 코덱 풀 세트(JPEG-LS/JPEG2000/RLE/Baseline WASM) | prd-format-support | 계획 |
| skill-19-volume-axis-reslice.md | 볼륨 3축 선택 리샘플(affine/IOP 해석, 비등방 종횡비 보정) | prd-format-support | 계획 |
| skill-20-animated-image.md | animated webp/gif 프레임화(ImageDecoder + Safari 폴백) | prd-format-support | 계획 |

## Rendering & View

| Skill | What it covers | 연관 PRD | 상태 |
|-------|---------------|---------|------|
| skill-07-view-canvas.md | Canvas 2D 렌더 경로(이미지/동영상), dpr, ViewState(transform) 합성 | [prd-view-layout](../../prd/prd-view-layout.md) | 계획 |
| skill-21-webgl-gray-pipeline.md | gray 의료 볼륨 WebGL 경로(16bit 텍스처, W/L 셰이더) — Canvas 경로와 결과 동일 보장 | prd-view-layout / prd-tool-binding | 계획 |
| skill-08-resize-contract.md | ResizeObserver 동기 리사이즈 (window resize 만으로는 CSS 축소 미추종) | prd-view-layout | 계획 |
| skill-09-overlay-slot.md | children 합성, pointer-events 규약, 크기 불간섭 | prd-view-layout | 계획 |
| skill-10-window-level.md | gray8/16/float32 W/L LUT | [prd-tool-binding](../../prd/prd-tool-binding.md) | 계획 |

## Interaction

| Skill | What it covers | 연관 PRD | 상태 |
|-------|---------------|---------|------|
| skill-11-input-routing.md | 드래그 제스처→activeTool, 경계 이탈 정지, 활성(onActivate) | prd-tool-binding | 계획 |
| skill-12-wheel-coalescing.md | 고빈도 wheel rAF coalescing (프레임당 1회 적용/렌더) | prd-output-modes | 계획 |
| skill-13-tool-controller.md | headless 컨트롤러, scope(all/active) 전파, subscribe | prd-tool-binding | 계획 |
| skill-14-playback-controller.md | slice/auto 통합, play/pause/stop, rAF 시간 기준 재생 | prd-output-modes | 계획 |
| skill-22-measurement.md | ruler/circle/polygon 렌더·편집, 이미지 좌표 저장, undo/redo, 직렬화 왕복 | [prd-measurement](../../prd/prd-measurement.md) | 계획 |

## Infra

| Skill | What it covers | 연관 PRD | 상태 |
|-------|---------------|---------|------|
| skill-15-worker-factory.md | setWorkerFactory, 번들러(?url) 가이드 | [usage](../../usage.md) | 계획 |
| skill-16-decoder-registry.md | registerDecoder 확장 계약 | prd-format-support | 계획 |
| skill-17-abort-unmount-guard.md | source 교체/unmount 시 abort·리스너 정리 | source-contract | 계획 |
| skill-23-core-lifecycle.md | 코어 imperative 수명(create/setter/dispose), 프레임워크 무관 계약 | [framework-adapters](../architecture/framework-adapters.md) | 계획 |
| skill-24-react-adapter.md | React 컴포넌트/훅 = 코어 수명 바인딩 + controlled/uncontrolled 정규화 | framework-adapters | 계획 |
| skill-25-web-component.md | `<biewer-view>` Custom Element, attribute↔property↔CustomEvent 매핑 | framework-adapters | 계획 |
| skill-26-style-injection.md | 런타임 `<style>` 1회 주입 + injectStyles 옵트아웃, `--bw-*` 변수 | framework-adapters | 계획 |

## 작성 규칙

- 파일명 `skill-XX-name.md`, 이 표에 등록 후 본문 작성.
- 본문 구조: 목적 → 핵심 코드 경로 → 계약/불변식 → 함정(회귀 마커) → 검증 방법.
- 구현과 어긋난 skill 은 결함으로 취급하고 코드와 함께 고친다.
