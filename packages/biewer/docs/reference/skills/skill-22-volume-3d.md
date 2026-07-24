# Skill 22: 3D Volume Rendering (WebGL2 raycaster)

> Files: `core/volume.ts`, `core/render/volume3d.ts`, `core/render/mat4.ts`,
> `core/volumeView.ts`, `wc/volume.ts`, `react/BiewerVolume.tsx`
> 연관 PRD: prd-view-layout · prd-format-support · 상태: **구현됨(동작)**

## What This Does

의료 볼륨(nii / dcm / `.nii.gz`)을 **진짜 3D**로 렌더한다 — VTK.js 같은 무거운 의존성 없이
표준 WebGL2 레이캐스터로 직접. 두 모드: **DVR**(front-to-back 합성, 입체감) / **MIP**(최대강도투영, angio/bone).
입력은 드래그=오빗, 휠=줌. per-instance(전역 없음), opt-in.

경계: 이것도 **출력 프리미티브**다. "3D 뷰타입/제품 레이아웃"을 만들지 않는다 —
host 가 `createBiewerVolumeView` 를 원하는 셀에 마운트하고 tool 을 바인딩한다.

## 1) Volume 취득 — `createVolume(source)`

볼륨을 **한 번** 디코드해 스칼라 그리드로 만든다. 디코더 내부를 복제하지 않고 기존
파이프라인(acquire → sniff → decoder registry)을 재사용한 뒤 gray FrameSource 의 프레임을 스택한다.
→ gz 언랩·DICOM 멀티프레임·NIfTI 가 모두 균일 처리된다.

```typescript
const vol = await createVolume({ kind: 'url', url: '/studies/case.nii.gz' });
// vol: { dims:[nx,ny,nz], spacing:[sx,sy,sz], data:Float32Array, min, max }
```

- 최장변이 `maxEdge`(기본 192) 이하가 되도록 정수 스트라이드로 다운샘플(종횡비는 spacing 으로 유지).
- rgba/단일프레임 소스는 거부(3D 는 스칼라 볼륨 전용).

## 2) 렌더러 — `createVolumeRenderer(canvas, volume)`

- 볼륨을 `R8` **3D 텍스처**로 업로드(강도를 min/max 로 [0,255] 정규화).
- 전체화면 쿼드 1개. 프래그먼트에서 `uInvViewProj` 로 월드 레이를 복원 → 물리 AABB
  (dims·spacing, 최장변=1 정규화, 원점 중심) 교차 → `t0..t1` 마칭 → 합성.
  - **MIP**: `maxv = max(maxv, win(sample))`.
  - **DVR**: `col += (1-acc)*a*vec3(w); acc += (1-acc)*a;` (a = w·w·opacity).
- `win(v)=clamp((v-lo)/(hi-lo))` 로 transfer window 적용. `invert` 지원.
- 카메라 수학은 `mat4.ts`(perspective/lookAt/multiply/invert/orbitEye) — gl-matrix 무의존.
- **`preserveDrawingBuffer:true`** — capture/헤드리스 픽셀 판독 신뢰성.

## 3) 뷰 조립 — `createBiewerVolumeView(el, opts)`

캔버스 + 렌더러 + 입력 + 리사이즈를 묶는다. 상태 변경은 setter, 렌더는 **rAF 병합**(상호작용 중 프레임당 1회).

```typescript
const view = createBiewerVolumeView(el, {
  source: { kind: 'url', url: '/studies/case.nii.gz' }, // 또는 volume: VolumeData
  mode: 'dvr',                       // 'dvr' | 'mip'
  onReady: (v) => console.log(v.dims),
});
view.setMode('mip');
view.setInvert(true);
view.setCamera({ azimuth: 0.6, elevation: 0.35, distance: 2.4 }); // reset
```

- 드래그 → `azimuth += dx·k`, `elevation` 은 ±85° clamp. 휠 → `distance *= exp(dy·k)`, [0.6,6] clamp.
- `capture()` 는 렌더 직후 `canvas.toBlob`.

## 4) 어댑터

- **Web Component** `<biewer-volume>` — `mode`/`invert`/`opacity` attribute, `source`/`volume` property,
  `bw-ready`/`bw-error`/`bw-progress`/`bw-camera` 이벤트, `setMode`/`setInvert`/`resetCamera`/`getView` imperative.
- **React** `<BiewerVolume source mode window opacity invert onReady … />` — prop→setter 재조정, ref = core view.

## Gotchas

- **WebGL2 필수**(sampler3D/texImage3D). 미지원 시 `DECODE_FAILED` 로 명확히 실패.
- 헤드리스 검증은 ANGLE/SwiftShader(`--use-gl=angle --use-angle=swiftshader`)에서 WebGL2 3D 텍스처 동작.
- WebGL 캔버스 픽셀 판독은 2D 캔버스에 `drawImage` 후 `getImageData`(preserveDrawingBuffer 전제).
- 소스가 바뀌면 볼륨 뷰는 **재생성**(볼륨 텍스처는 소스별 불변).

## 후속

오블리크/컷플레인 · transfer-function(색·불투명도 커브) 에디터 · 3D 측정 · 서피스 메시(marching cubes) · 워커 디코드 오프로드.
