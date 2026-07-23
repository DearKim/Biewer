# Changelog

All notable changes to `@deepnoid/biewer` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This package follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **설계 문서 초판.** 요구사항 SSOT(`docs/spec.md`), 공개 API 초안(`docs/usage.md`),
  소스 주입 계약(`docs/source-contract.md`), 기능별 PRD 5종(포맷 / 출력 모드 / 뷰·레이아웃 / 도구 바인딩 / 측정),
  reference 골격(architecture boundary·framework-adapters·data-flow, types, skills 카탈로그).
- **설계 결정 15건 확정** ([`docs/spec.md`](docs/spec.md) §8 Decision Log): GitLab npm registry 배포 ·
  React `^18 || ^19` · 포맷별 하이브리드 렌더(Canvas 2D + WebGL) · 쇼케이스 M1 병행 ·
  DICOM 코덱 풀 세트 · 볼륨 3축 선택 · animated 이미지 프레임화 · 진행률(onProgress) 포함 ·
  측정 세트 포함 · scope 기본 `'all'` · 스크롤바 opt-in OFF · mp4 video-element seek ·
  프레임워크 무관 코어 + React/Web Component 어댑터 · 단일 패키지 + subpath exports · 런타임 스타일 주입 + 옵트아웃.
- **M1 코어 구현 (동작).** 프레임워크 무관 코어(`src/core/`): 포맷 판별(magic bytes) → 취득(url/file/buffer)
  → 디코더 레지스트리 → 이미지 스택 FrameSource → Canvas 2D 렌더러 → `createBiewerView`.
  `createToolController`(scope all/active, gesture 방송) · `createPlaybackController`(slice/auto, rAF 시간 기준).
  전역 환경 주입(`setHttpClient`/`setWorkerFactory`/`registerDecoder`), 런타임 스타일 주입.
- **어댑터 (동작).** React(`@deepnoid/biewer/react`: `<BiewerView>`, `useBiewerTools`, `useBiewerPlayback`),
  Web Component(`@deepnoid/biewer/wc`: `<biewer-view>`, attribute↔property↔CustomEvent).
- **빌드/검증.** tsup 멀티엔트리(ESM+CJS+d.ts, `dist/style.css`), 헤드리스 브라우저 end-to-end 검증
  (디코드→렌더, slice 이동, 도구 조작, 멀티뷰 컨트롤러 공유 sync 통과).
- **포맷 디코더 4종 직접 구현 (동작, 실데이터 검증).**
  - **NIfTI** (`decode/nifti.ts`): NIfTI-1 헤더 파싱 + 축(native/axial/coronal/sagittal) 슬라이싱 → gray8/16/float32 FrameSource.
  - **DICOM** (`decode/dicom.ts`): 비압축 Explicit/Implicit VR LE, 멀티프레임, W/L·spacing 메타. 압축(JPEG-LS/2000, transfer syntax .4.x)은 `DECODE_FAILED`로 명시 거부(코덱은 후속).
  - **mp4** (`decode/video.ts`): blob URL + video seek 프레임 샘플링(같은 출처 → canvas 비-taint).
  - **Archive** (`decode/archive.ts` + `bytes.ts`): gz(`DecompressionStream`)·zip(EOCD 스캔 + `deflate-raw`) 언랩 후 내부 포맷 재판별(`.nii.gz` 포함). 이미지 zip = N-frame 스택.
  - `DecodeContext.axis` 추가, 뷰가 볼륨 축을 디코더로 전달. 헤드리스에서 실제 원격 데이터(NiiVue nii.gz·pydicom dcm·MDN mp4·이미지 zip) 디코드+렌더 확인.

### 후속 (미구현 — 스텁/계획)

- DICOM 압축 코덱(JPEG-LS/2000, WASM), 볼륨 3축 정확 리샘플(현재 인덱스 기반), animated 이미지 프레임화
- gray 볼륨 WebGL W/L 경로(현재 Canvas 2D 프레임별 min/max 정규화), 디코딩 Web Worker 오프로드
- 측정 세트 렌더·편집·undo/redo (M4)
