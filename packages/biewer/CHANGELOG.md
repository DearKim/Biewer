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

- **3D 볼륨 렌더링 (WebGL2 레이캐스터 — from scratch, VTK.js 무의존).**
  `core/volume.ts` `createVolume(source)` 가 볼륨 소스(nii/dcm/`.nii.gz`)를 기존 디코드 파이프라인으로
  **한 번** 디코드해 gray FrameSource 를 스칼라 그리드(`VolumeData`: dims·spacing·min/max)로 스택(최장변 ≤192 로 스트라이드 다운샘플).
  `core/render/volume3d.ts` 가 이를 R8 3D 텍스처로 올리고 전체화면 쿼드 + inverse-view-projection 레이로
  물리 AABB 를 교차·마칭·합성(`mat4.ts` 자체 카메라 수학). 두 모드: **DVR**(front-to-back 합성) / **MIP**(최대강도투영).
  `core/volumeView.ts` `createBiewerVolumeView(el,{source|volume,mode})` 가 캔버스+렌더러+입력(드래그=오빗, 휠=줌, rAF 병합)+리사이즈를 조립.
  어댑터: Web Component `<biewer-volume>`(mode/invert/opacity attribute, `bw-ready`/`bw-error`/`bw-camera` 이벤트, `setMode`/`resetCamera` 등 imperative), React `<BiewerVolume>`.
  헤드리스(ANGLE/SwiftShader WebGL2)에서 실제 CT 볼륨(NiiVue `CT_Abdo.nii.gz`) 디코드→3D 렌더 확인: 비어있지 않은 페인트 · 카메라 오빗 시 픽셀 변화 · DVR⇄MIP 재렌더 검증. per-instance(전역 없음), opt-in.
  (오블리크/컷플레인·transfer-function 에디터·3D 측정·서피스 메시는 후속.)

- **다중 파일 DICOM 시리즈 → 볼륨 + 임의 축 MPR.** DICOM 디코더가 `ctx.extra`(폴더/zip 의 단일프레임 슬라이스들)를
  하나의 볼륨으로 스택한다 — ImagePositionPatient 를 슬라이스 법선에 투영해 정렬(없으면 InstanceNumber, 없으면 입력 순),
  z-spacing 은 슬라이스 간격 중앙값. gray 볼륨은 연속 그리드로 조립해 **공용 리샘플러**(`volumeFrameSource`, 기존 NIfTI 3축 경로)로
  통과시켜 axial/coronal/sagittal 어느 축이든 **진짜 리슬라이스**된다(NIfTI 뿐 아니라 DICOM 시리즈도 MPR 가능). IOP 로 축 방향 정규화.
  zip 아카이브도 다중 DICOM 엔트리를 같은 경로로 스택. 단일 multiframe(cine)의 native/axial 은 기존 경로 유지(무회귀).
  헤드리스 검증: 합성 8슬라이스(순서 섞고 InstanceNumber 동일)를 위치순으로 정렬해 8프레임 볼륨으로 스택 + 3축이 서로 다르게 리슬라이스됨 확인.

- **JPEG-LS (compressed DICOM) 디코더 — from scratch (LOCO-I).** `decode/jpegls.ts` 가 T.87
  lossless 를 직접 디코드(regular/run/run-interruption 모드, Golomb-Rice, 컨텍스트 모델링, 0xFF de-stuffing).
  `dicom.ts` 가 encapsulated pixel data(Basic Offset Table + fragment items)를 파싱해 transfer syntax
  `.4.80`/`.4.81`(NEAR=0) 를 프레임별 디코드. **독립 오라클 검증**: pydicom `emri_small_jpeg_ls_lossless.dcm`
  10프레임 × 4096샘플이 비압축 twin(`emri_small.dcm`)과 **byte-exact 일치**. 8/16-bit·signed 지원.
  (near-lossless NEAR>0·다중성분·interleave 1/2·restart interval 은 미지원 → 깨끗이 DECODE_FAILED. 기타 압축 syntax 도 여전히 거부.)

### 후속 (미구현 — 스텁/계획)

- DICOM 압축 코덱 나머지: JPEG2000/RLE/JPEG Baseline, JPEG-LS near-lossless(NEAR>0)/color
- gray 볼륨 WebGL(GPU) W/L 경로(현재 CPU LUT), 디코딩 Web Worker 오프로드, animated 이미지 프레임화
- 볼륨 오블리크 reslice(현재 직교 3축), 측정 세트 렌더·편집·undo/redo (M4)
