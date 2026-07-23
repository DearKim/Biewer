# Source Contract — host 가 Biewer 에 데이터를 주입하는 계약

> **Biewer 는 의도적으로 백엔드 엔드포인트를 정의하지 않는다** — 데이터가 어디서 오는지는 host 소유이고,
> 이 문서는 "host 가 무엇을 어떤 형태로 넘기면 Biewer 가 출력을 보장하는가"만 정의한다.

---

## 1. `BiewerSource` — 주입 형태 3종

```ts
type BiewerSource =
  | { kind: 'url';    url: string | string[];  format?: FormatHint }   // Biewer 가 httpClient 로 fetch
  | { kind: 'file';   file: File | File[];     format?: FormatHint }   // 업로드/드롭 입력
  | { kind: 'buffer'; data: ArrayBuffer | ArrayBuffer[]; name?: string; format?: FormatHint }; // host 가 직접 로드한 바이트
```

- 배열 입력 = **스택/시리즈** (이미지 N장, DICOM 시리즈 등). 정렬 규칙은 §3.
- `format` 힌트는 선택 — 최종 판정은 항상 magic bytes 스니핑이 한다 (§2).
- `url` fetch 는 전역 `setHttpClient` 로 주입된 클라이언트를 사용한다. 인증 헤더/재시도/베이스 URL 은 host 정책.

## 2. 포맷 판별 규칙

판별 순서 (앞 단계가 실패하면 다음으로):

1. `format` 힌트 (host 가 확신할 때)
2. 파일명/URL 확장자
3. **magic bytes 스니핑 — 최종 판정** (예: `89 50 4E 47`=png, `1F 8B`=gzip, `DICM`@128=dcm, `ftyp`=mp4, NIfTI magic `n+1`/`ni1`)

확장자와 바이트가 충돌하면 바이트를 믿고, `onError` 대신 **경고 통지 후 진행**한다.
어떤 단계로도 판별 불가면 `BiewerError{ code: 'UNSUPPORTED_FORMAT' }` 를 `onError` 로 전달한다.

## 3. 컨테이너/다중 입력 해석 규칙

| 입력 | 해석 |
|---|---|
| `gz` | 스트림 해제 → 내부 바이트를 §2 로 재판별 (`.nii.gz` 는 NIfTI 경로에서 자동 처리) |
| `zip` | 엔트리 열람 → 지원 포맷만 필터 → 단일 시퀀스로 정렬. 혼합 포맷 zip 은 **최다 포맷 그룹**을 채택하고 경고 통지 |
| 이미지 배열/zip | 파일명 natural sort → N frames 스택 |
| animated webp/gif | `ImageDecoder` 프레임화 → N frames (미지원 브라우저는 폴백 디코더 — D7) |
| DICOM 배열/zip | `InstanceNumber` → 없으면 `ImagePositionPatient` 투영 정렬 → N frames 시리즈. 다중 시리즈 혼입 시 최다 시리즈 채택 + 경고 |
| 동영상 | 단일 파일만. `videoStep`(초) 으로 시간 축을 양자화해 `frameCount = ceil(duration / step)` |

## 4. 정규화 결과 — `FrameSourceInfo`

판별·디코딩이 끝나면 `onSourceReady` 로 통지한다. host 는 이 정보로 스크롤바 범위, 재생 UI 등을 구성한다.

```ts
type FrameSourceInfo = {
  format: ResolvedFormat;          // 'png' | 'jpeg' | 'webp' | 'jpeg-ls' | 'nifti' | 'dicom' | 'mp4' | …
  frameCount: number;
  frameSize: { width: number; height: number };
  pixelType: 'rgba8' | 'gray8' | 'gray16' | 'float32';
  meta?: {
    spacing?: [number, number, number];  // 의료 볼륨
    dims?: [number, number, number];     // 볼륨 복셀 크기 (i,j,k)
    axis?: 'native' | 'axial' | 'coronal' | 'sagittal';  // 현재 슬라이스 축 (D6)
    defaultWindow?: { wc: number; ww: number };
    duration?: number;                   // 동영상(초)
    fps?: number;
  };
};
```

## 5. 진행률 계약 (D8)

대용량 로딩(수백 MB 볼륨) UX 를 위해 fetch/decode 진행률을 `onProgress` 로 통지한다. 로딩 UI 는 host 가 그린다.

```ts
type BiewerProgress = {
  phase: 'fetch' | 'decode';
  loaded: number;                  // bytes(fetch) 또는 처리 단위(decode)
  total: number | null;            // Content-Length 없으면 null
  ratio: number | null;            // 0~1, total 없으면 null
};
```

- `ratio` 는 단조 증가를 보장한다 (되돌아가는 progress bar 금지).
- 다중 파일(시리즈/zip)은 파일 수·크기 기준으로 합산한 전체 진행률을 통지한다.

## 6. 오류 계약

```ts
type BiewerError = {
  code: 'FETCH_FAILED' | 'UNSUPPORTED_FORMAT' | 'DECODE_FAILED' | 'EMPTY_CONTAINER' | 'ABORTED';
  message: string;
  cause?: unknown;
};
```

- 오류는 throw 하지 않고 `onError` 로 전달한다. 뷰는 host 가 덮을 수 있는 최소 오류 표시(문구)만 렌더한다.
- 언마운트/source 교체 시 진행 중 fetch·디코딩은 abort 된다.

## 7. 성능 계약

- 디코딩/파싱은 Web Worker 에서 수행한다 — 메인 스레드 블로킹으로 인터랙션이 끊기면 결함이다.
- 대용량(수백 MB 볼륨)은 transferable 로 전달하고, 같은 source 재사용 시 재디코딩하지 않는다(인스턴스 캐시).
- 캐시 키는 source 식별자(url/파일 identity) 기준 — 인덱스 같은 모호한 키 금지 (모호한 키는 데이터 교체 시 이전 데이터를 잘못 재사용한다).
