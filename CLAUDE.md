# @deepnoid/biewer — Development Guidelines

> 이 지침은 기본 동작보다 우선한다. 모호한 권고가 아니라 규칙으로 따른다.

## Repository Nature (가장 먼저 알 것)

이 repo 는 **pnpm workspace 모노레포** 다: 배포 패키지 하나(`packages/biewer` = `@deepnoid/biewer`) + 프레임워크 예제들(`examples/*`).

- **소스는 `packages/biewer/src/` 에 있고, `packages/biewer/dist/` 는 빌드로만 생성한다.** 빌드 산출물을 손으로 패치하지 않는다 — 소스와 산출물이 갈라지면 유지보수가 불가능해진다.
- `dist/` 직접 수정 금지. 산출물 diff 가 필요한 상황 자체를 만들지 않는다.
- 배포는 **GitLab npm registry 발행**(`packages/biewer` 의 `publishConfig`) (결정 D1). 루트는 `private` workspace 관리자(배포 안 함).
- 요구사항 SSOT = `packages/biewer/docs/spec.md`(§8 Decision Log 포함). M1 코어(이미지/slice/도구 + React·WC 어댑터)는 동작한다.
- **로컬 서버 유지 규칙**: 예제 dev 서버(`dev.ps1`)는 편집 시 **끄지 않는다** — Vite HMR + `tsup --watch` 로 재시작 없이 반영된다. 작업 중 실행 중인 dev 서버·docker 컨테이너를 임의로 kill 하지 않는다(같은 포트의 stale 서버 정리만 허용). docker 예제는 `restart: unless-stopped`.

## 정체성 — 경계 정책 (이 repo 의 제1원칙)

Biewer 는 **영상 출력 전용 플러그인**이다. 제품 기능이 플러그인 내부로 흡수되는 방향(viewType 프리셋, 제품별 레이아웃,
도메인 특화 뷰, 툴바 구성 규칙의 누적)을 경계한다. 상세: [`packages/biewer/docs/reference/architecture/boundary.md`](packages/biewer/docs/reference/architecture/boundary.md).

- 플러그인 소유: 포맷 디코딩, FrameSource 정규화, 프레임 렌더링, 출력 모드(slice/auto), 도구 프리미티브(headless)
- host 소유: 레이아웃 구성, 툴바/컨트롤 UI, 데이터 소스·인증 정책, 도메인 상태(스터디, 환자, 판독 등)

**기능 요구 수용 기준** — 새 요구가 오면 아래 질문으로 판정한다:

1. 이 요구는 특정 제품/화면/도메인 개념(스터디, 판독 상태, 병변 …)을 알아야 하는가? → **host 구현.** 필요하면 일반 확장점(옵션, slot, hook, decoder registry)만 추가한다.
2. 포맷/렌더/출력/도구 프리미티브로 **일반화**할 수 있는가? → 일반화한 형태로만 수용한다. 제품 이름·정책이 코드/기본값에 남으면 안 된다.
3. 특정 프레임워크에 묶이는가? → 로직은 코어(vanilla TS)에 넣고 어댑터로만 노출한다.
4. 기본값을 바꾸는가? → 신규 기능은 **opt-in, default OFF**. 기존 소비자 무회귀.

## 프레임워크 무관 구조 (핵심 아키텍처)

FE 스택을 가리지 않는 배포 패키지다. 상세: [`packages/biewer/docs/reference/architecture/framework-adapters.md`](packages/biewer/docs/reference/architecture/framework-adapters.md).

- **코어(`packages/biewer/src/core/`) 는 vanilla TypeScript.** `react`/`vue` 를 import 하지 않는다. `HTMLElement` + 표준 DOM/Canvas/WebGL/Worker API 만 쓴다.
- **어댑터는 얇다.** `src/react/`(React 컴포넌트/훅), `src/wc/`(Web Component `<biewer-view>`) 는 코어 인스턴스의 수명 바인딩과 prop↔setter 변환만 한다. 렌더/디코딩/도구 로직이 어댑터에 있으면 결함.
- Web Component 하나로 Vue/Angular/HTML/서버템플릿을 커버한다 — 스택마다 어댑터를 새로 만들지 않는다.
- 새 기능은 **코어에 먼저** 구현하고 두 어댑터에 노출한다. 어댑터에만 존재하는 기능 금지.

## Project Structure

```text
<repo-root>/                  # pnpm workspace (private)
├── CLAUDE.md                 # 이 파일 (repo 가이드)
├── README.md                 # repo/모노레포 개요
├── pnpm-workspace.yaml       # workspace: packages/* + examples/*
├── package.json              # workspace 루트 스크립트 (build / dev / typecheck)
├── dev.ps1                   # 로컬 개발/테스트 런처 (install → build → watch + dev / -Docker)
├── docker-compose.yml        # 예제 nginx 정적 서빙 (docs :8080, react :8081)
├── docker/                   # Dockerfile(멀티스테이지) + nginx.conf
├── packages/
│   └── biewer/               # @deepnoid/biewer (배포 패키지)
│       ├── package.json      # exports(., /react, /wc, /style.css), publishConfig
│       ├── src/{core,react,wc}/  # core=vanilla TS, 어댑터 2종
│       ├── dist/             # 빌드 산출물 — 직접 수정 금지
│       ├── docs/             # spec / usage / source-contract / prd / reference
│       ├── brand/            # 로고/favicon/app-icon/banner (svg·png), biewer.html
│       ├── README.md / CHANGELOG.md
│       ├── tsconfig.json / tsup.config.ts
└── examples/
    ├── docs/                 # 코어 + Web Component 쇼케이스 (Vite, verify.cjs 헤드리스 검증)
    └── react/                # React 어댑터 데모 (Vite + @vitejs/plugin-react)
```

- 예제는 `@deepnoid/biewer` 를 `workspace:*` 로 의존하고, Vite alias 로 `packages/biewer/dist` 를 직접 참조한다(실 소비자와 동일 + `tsup --watch` 시 HMR).

## 브랜드 자산

`brand/` 가 SSOT: `logos/`(horizontal svg), `icons/`(favicon·app-icon svg), `png/`(favicon 16/32, app-icon, app-icon-512, banner), `banners/`(banner svg), `biewer.html`(랜딩/쇼케이스). 팔레트 = deep-teal `#0F6E56` + scan-cyan `#4EC5DC` + scanner-black `#04342C`. 모티프 = MPR 슬라이스 바 + 크로스헤어.

- 쇼케이스는 `examples/docs/public/` 의 사본을 쓴다(favicon, 헤더 로고). 원본 변경 시 사본도 갱신.
- README 배너는 `brand/png/biewer-banner.png` 를 참조하고, `brand/` 는 배포(`files`)에 포함된다.
- ⚠️ banner/`biewer.html` 의 "by BLAH", "v1.0" 은 placeholder — 실제 배포 문구는 host 조직/버전으로 확정 필요.

## Docs 규칙

- **LF 줄바꿈 유지.** CRLF 유입 금지 (`.gitattributes` 로 강제; Windows 에서는 에디터 설정도 확인).
- 문서 내 파일/코드 참조는 마크다운 링크(`[text](relative/path)`), repo root 기준 상대경로.
- 문서는 **자기완결**: 외부 프로젝트를 참조하지 않는다.
- PRD 포맷: `배경 및 문제 정의(As-Is/To-Be) → 사용자 목표 → 범위(In/Out-of-Scope) → 기능 요구사항 → 엣지 케이스 → 수용 기준(AC) → 미결`.
- skill 문서는 기능 단위 자기완결 가이드로 작성하고 `docs/reference/skills/index.md` 카탈로그에 등록한다. 구현 없는 상상 가이드 선작성 금지.
- 문서와 구현이 어긋나면 함께 고친다.

## API 설계 규칙

- **per-instance 우선, 모듈 전역 최소화.** 전역이 허용되는 것은 환경 주입뿐: `setHttpClient`, `setWorkerFactory`, `registerDecoder`. 그 외 상태는 인스턴스/컨트롤러 소유(전역 setter 남발 시 multi-instance 에서 last-render-wins 문제 발생).
- 코어는 imperative(`create*` → setter → `dispose`). 상태 변경=setter, 이벤트=콜백, 구독=`subscribe(fn):()=>void`.
- 상태 prop 은 어댑터 레벨에서 **controlled + uncontrolled 겸용**(`value` + `onChange` + `defaultValue`) 패턴.
- 신규 기능은 opt-in default OFF. 파괴적 변경은 major 에서만.
- CSS 는 처음부터 **prefix(`bw-`) 통일**, `--bw-*` CSS 변수로 host override. 런타임 주입 + `injectStyles:false` 옵트아웃.
- 렌더 경로는 **포맷별 하이브리드**(결정 D3): 이미지/동영상 = Canvas 2D, gray 의료 볼륨 = WebGL(W/L 셰이더).
  공개 API 는 렌더 기술을 노출하지 않는다 — 내부 교체 가능해야 하고, 두 경로의 ViewState 합성 결과는 동일해야 한다.
- 무거운 작업(디코딩/리샘플)은 Web Worker. 워커 URL 은 `setWorkerFactory` 로 host 번들러에 위임.
- 입력 이벤트 고빈도 경로(wheel/mousemove)는 **rAF coalescing** 필수 — 프레임당 최대 1회 적용/렌더.
- 캐시 키는 source 식별자(url/File identity) 기준. 인덱스류 모호한 키 금지(데이터 교체 시 충돌).

## Commands

로컬 개발은 `dev.ps1`(Windows/PowerShell)로 통일한다 — 항상 install 후 실행되고, 편집 중 서버가 유지된다.

```powershell
./dev.ps1                  # docs 예제: pnpm install → 패키지 빌드 → tsup watch + vite dev (HMR)
./dev.ps1 -Example react   # React 어댑터 예제 (:5191)
./dev.ps1 -Build           # 패키지만 빌드하고 종료
./dev.ps1 -Docker          # 예제를 nginx 컨테이너로 서빙 (docs :8080, react :8081, detached)
./dev.ps1 -Down            # docker 예제 컨테이너 정지
./dev.ps1 -NoInstall       # install 스킵(빠른 재시작)  /  -NoWatch  watch 없이
```

pnpm workspace 직접 명령(루트):

```bash
pnpm install                              # 전 workspace 설치
pnpm --filter @deepnoid/biewer build      # 패키지 빌드 (tsup → dist/, ESM+CJS+d.ts+style.css)
pnpm --filter @deepnoid/biewer build --watch   # watch 재빌드
pnpm --filter @deepnoid/biewer typecheck  # tsc --noEmit
pnpm --filter @biewer/example-docs dev    # 예제 dev 서버
pnpm --filter @biewer/example-docs verify # 헤드리스 end-to-end 검증(빌드+preview 필요)
```

- `dev.ps1` 은 같은 포트의 **stale vite 만** 정리하고 정상 서버는 건드리지 않는다. tsup watch 자식은 종료 시 트리 kill.
- esbuild 설치 스크립트는 `pnpm-workspace.yaml` 의 `allowBuilds` 로 허용(vite/tsup 의존).

## 절대 하지 말 것

- `dist/` 직접 패치 금지 (빌드 산출물은 빌드로만).
- 코어 소스에 `react`/`vue` 등 프레임워크 import 금지.
- 특정 제품 이름/정책/도메인 개념을 플러그인 코드·기본값에 넣지 않는다.
- 레이아웃 엔진/viewType 프리셋을 만들지 않는다 — 레이아웃은 host 의 것.
- 신규 기능을 default ON 으로 넣지 않는다.
- docs 에 CRLF 유입 금지 (LF 유지).
- 예제에서 default 가 아닌 기능을 임의 활성화 금지 (default 동작만 노출).
- 실행 중인 dev 서버·docker 컨테이너를 임의로 kill 금지 (같은 포트의 stale 정리만). 편집은 HMR/watch 로 반영한다.
