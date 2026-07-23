# PRD — Format Support (포맷 판별·디코딩·정규화)

> 입력 바이트를 판별·디코딩해 **FrameSource** 로 정규화하는 파이프라인. Biewer 의 모든 출력은 이 결과 위에서 동작한다.
> 연관: [`../spec.md`](../spec.md) §2, [`../source-contract.md`](../source-contract.md), [`../reference/architecture/data-flow.md`](../reference/architecture/data-flow.md)

---

## 1. 배경 및 문제 정의

### As-Is
기존 뷰어는 NIfTI + 제품별 PNG(MIP) 에 특화돼 있고, 새 포맷이 필요할 때마다 로더를 개별 추가해야 한다.
포맷마다 렌더 경로가 달라 기능(도구/재생)이 포맷별로 재구현된다.

### To-Be
- 이미지·의료 볼륨·동영상·압축을 **하나의 판별→디코딩→정규화 파이프라인**으로 수용
- 디코딩 결과는 전부 `FrameSource`(N frames) — 뷰/도구/재생은 포맷을 모른다
- 미지원 포맷은 `registerDecoder()` 로 확장 (코어 수정 없이)

## 2. 사용자 목표
- host 는 파일이 무슨 포맷인지 신경 쓰지 않고 `source` 하나만 넘긴다
- 잘못된 파일이 와도 뷰어가 죽지 않고 이유를 알 수 있다

## 3. 범위

### In-Scope

| 분류 | 포맷 | 디코딩 경로 | frames |
|---|---|---|---|
| 이미지 | webp / jpeg / png | 브라우저 네이티브 `createImageBitmap` | 1 (배열 입력 시 N 스택) |
| 이미지 | animated webp / gif | `ImageDecoder` 프레임화 (미지원 브라우저는 폴백 디코더) | N (D7) |
| 이미지 | jpeg-ls | WASM 코덱 워커 (`@cornerstonejs/codec-charls` 계열) | 동일 |
| 의료 볼륨 | nii / nii.gz | `nifti-reader-js` 워커 파싱 | 선택 축 슬라이스 N — `axis: native(기본)/axial/coronal/sagittal` (D6) |
| 의료 볼륨 | dcm (단일 multiframe / 시리즈) | DICOM 파서 + **코덱 풀 세트**: uncompressed·JPEG-LS·JPEG2000·RLE·JPEG Baseline (D5) | N, 축 선택 동일 |
| 동영상 | mp4 | `HTMLVideoElement` seek + canvas 캡처 | `ceil(duration/step)` |
| 압축 | gz | 스트림 해제 후 재판별 | 내부 포맷 따름 |
| 컨테이너 | zip | 엔트리 필터·정렬 → 스택/시리즈 | N |

### Out-of-Scope (후속)
- 3-plane 동시 MPR 뷰, 비직교(oblique) reslice — v0 은 단일 축 뷰(3축 중 선택)까지
- WebCodecs 기반 정밀 프레임 추출 (후속 최적화 — v0 은 video element seek 로 확정, D12)

## 4. 기능 요구사항

규칙:

- 판별 순서: `format` 힌트 → 확장자 → **magic bytes(최종 판정)**. 충돌 시 바이트 우선. ([`source-contract.md`](../source-contract.md) §2)
- 디코딩·파싱은 **Web Worker** 에서 수행하고 transferable 로 반환한다. 메인 스레드 프리즈는 결함.
- 정규화 결과는 `FrameSourceInfo`(frameCount, frameSize, pixelType, meta) 로 `onSourceReady` 통지.
- gray8/gray16/float32 픽셀은 window-level 적용 가능한 형태로 유지한다 (RGBA 로 미리 굽지 않는다).
- 볼륨(nii/dcm)은 `axis: 'native' | 'axial' | 'coronal' | 'sagittal'` 로 슬라이스 축을 선택한다 (기본 `native` = 저장 순서, zero-copy).
  native 외 축은 orientation(NIfTI affine / DICOM IOP) 기준으로 해석하고, 리샘플은 워커에서 수행하며 비등방 spacing 은 표시 종횡비로 보정한다.
- animated webp/gif 는 `ImageDecoder` 로 N frames 정규화한다. 미지원 브라우저(Safari 구버전)는 폴백 디코더 라이브러리로 처리.
- 진행률: fetch(Content-Length 기반)·디코딩 단계를 `onProgress` 로 통지한다 ([source-contract §5](../source-contract.md)).
- `registerDecoder(decoder)`: `{ sniff(bytes): boolean, decode(bytes, ctx): Promise<FrameSource> }` 계약. 내장 디코더보다 나중에 등록된 것이 우선.
- 같은 source 재바인딩 시 재디코딩하지 않는다(캐시). 캐시 키는 source 식별자(url/File identity) — 인덱스류 모호한 키 금지.
- source 교체/언마운트 시 진행 중 fetch·디코딩 abort.

## 5. 엣지 케이스

- 404/오류 페이지(HTML)가 바이트로 오는 경우 → 스니핑 실패 → `UNSUPPORTED_FORMAT` + 힌트 메시지 (포맷 오류로만 보고하면 서버가 오류 페이지를 반환했다는 실제 원인을 알 수 없다)
- zip 안에 지원 포맷이 0개 → `EMPTY_CONTAINER`
- zip 에 혼합 포맷/다중 DICOM 시리즈 → 최다 그룹 채택 + 경고 통지 (silent 선택 금지)
- 손상 파일(헤더 OK, 본문 깨짐) → 디코더 단계 `DECODE_FAILED`, 부분 성공 스택은 성공 프레임만 노출 + 경고
- 초대용량(>500MB) 볼륨 → `onProgress` 로 진행률 통지, OOM 시 명확한 오류
- native 외 축 선택 + orientation 메타 없는 데이터 → native 로 폴백 + 경고 통지

## 6. 수용 기준 (AC)

1. 표의 모든 In-Scope 포맷이 `<BiewerView source>` 만으로 표시된다 (포맷별 전용 prop 없음).
2. 확장자가 틀린 파일(png 를 .jpg 로)도 정상 표시된다.
3. `.nii.gz`, 이미지 zip(100장), DICOM zip(1시리즈) 이 각각 N-frame 스크롤 가능한 소스로 열린다.
4. 300MB NIfTI 디코딩 중 메인 스레드 long task 가 발생하지 않는다 (스크롤/버튼 반응 유지).
5. 미지원 바이트 입력 시 뷰가 크래시 없이 `onError(UNSUPPORTED_FORMAT)` 를 호출한다.
6. `registerDecoder` 로 등록한 가짜 포맷이 내장 파이프라인 수정 없이 표시된다.
7. animated gif 가 N frames 소스로 열려 slice 스크롤과 auto 재생이 동작한다.
8. 같은 볼륨에서 `axis` 를 3축으로 바꿔도 각 축의 종횡비가 spacing 기준으로 올바르다.
9. JPEG2000/JPEG-LS/RLE 압축 DICOM 시리즈가 열린다.
10. 100MB+ 로딩 중 `onProgress` 가 단조 증가로 통지된다.

## 7. 미결

- ~~dcm 코덱 초기 범위~~ → **풀 세트로 확정** (D5, [spec §8](../spec.md))
- ~~진행률 포함 여부~~ → **v0 포함으로 확정** (D8)
- JPEG2000 코덱 구현체 선정(OpenJPEG WASM 계열)과 WASM 번들 크기 상한
- Safari 용 animated 이미지 폴백 디코더 선정
