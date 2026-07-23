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
  - `DecodeContext.axis` 추가, 뷰가 볼륨 축을 디코더로 전달. 헤드리스에서 실제 원격 데이터(NiiVue nii.gz·pydicom dcm·OHIF 임상 cine mp4·이미지 zip) 디코드+렌더 확인.
- **Window/Level (CPU LUT).** gray8/16/float32 프레임을 표준 DICOM W/L 램프로 RGBA 변환(`canvas2d`).
  로드 시 기본 window 산출(DICOM 메타 우선, 없으면 중간 슬라이스 min/max), `window-level` 도구가 데이터 범위에 맞춰 드래그로 조절, `reset`이 기본값 복귀. (GPU/WebGL W/L 경로는 후속 perf 최적화.)
- **NIfTI 3축 리샘플 + orientation.** axial/coronal/sagittal 을 물리 extent(`dim·spacing`) 기준 nearest-neighbour 로 등방 픽셀에 리샘플(비등방 볼륨 종횡비 교정) + sform/qform 으로 축별 flip 정규화. float64 datatype 추가.
- **영상 URL 스트리밍.** mp4/webm URL 은 통째 다운로드 대신 `crossOrigin=anonymous` 진행형 스트림(대용량 임상 cine 실용적); webm sniff 추가. 볼륨/cine 은 로드 시 중간 프레임에서 시작.

### 후속 (미구현 — 스텁/계획)

- DICOM 압축 코덱: JPEG-LS(진행 중), JPEG2000/RLE/Baseline
- gray 볼륨 WebGL(GPU) W/L 경로(현재 CPU LUT), 디코딩 Web Worker 오프로드, animated 이미지 프레임화
- 볼륨 오블리크 reslice(현재 직교 3축), 측정 세트 렌더·편집·undo/redo (M4)
