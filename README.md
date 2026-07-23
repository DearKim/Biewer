# Biewer — monorepo

`@deepnoid/biewer` 패키지와 프레임워크 예제들을 담는 **pnpm workspace 모노레포**.

Biewer 는 **영상 출력만 담당하는** 범용 뷰어 플러그인이다 — 포맷 해석(이미지/의료 볼륨/동영상/압축),
프레임 렌더링, 출력 모드(slice/auto), headless 도구. 레이아웃·툴바 UI·데이터 정책은 host 소유.
프레임워크 무관 코어 + React / Web Component 어댑터로 어떤 FE 스택에서도 쓸 수 있다.

- 패키지 문서·정체성·API: [`packages/biewer/README.md`](packages/biewer/README.md)
- 요구사항 SSOT: [`packages/biewer/docs/spec.md`](packages/biewer/docs/spec.md)

---

## 구조

```text
packages/biewer/     @deepnoid/biewer — 배포 패키지 (core + react + wc 어댑터)
examples/docs/       코어 + Web Component 쇼케이스 (Vite)
examples/react/      React 어댑터 데모 (Vite)
dev.ps1              로컬 개발/테스트 런처
docker/              예제 nginx 정적 서빙 (멀티스테이지 빌드)
docker-compose.yml   docs :8080 · react :8081
```

## 요구사항

- Node ≥ 18, **pnpm ≥ 9** (`corepack enable` 로 활성화 권장)
- (선택) Docker — 프로덕션 유사 로컬 테스트용

## 개발 (Windows / PowerShell)

로컬 실행은 `dev.ps1` 로 통일한다. **항상 `pnpm install` 후 실행되고, 편집 중 서버가 유지된다**
(Vite HMR + `tsup --watch` — 패키지 소스를 고쳐도 dev 서버를 재시작하지 않는다).

```powershell
./dev.ps1                   # docs 예제:  install → 패키지 빌드 → watch + vite dev  → http://localhost:5190
./dev.ps1 -Example react    # React 어댑터 예제                                      → http://localhost:5191
./dev.ps1 -Build            # 패키지만 빌드
./dev.ps1 -NoInstall        # install 스킵(빠른 재시작)
```

편집 흐름: `packages/biewer/src` 수정 → `tsup --watch` 가 `dist` 재빌드 → Vite HMR 로 예제 갱신. **서버는 계속 떠 있다.**

## 로컬 Docker 테스트

예제를 nginx 정적 사이트로 빌드·서빙한다(실제 배포 유사 환경). 컨테이너는 `restart: unless-stopped` 로 유지된다.

```powershell
./dev.ps1 -Docker           # 두 예제 빌드 + 서빙 (detached)
#   example-docs   → http://localhost:8080
#   example-react  → http://localhost:8081
./dev.ps1 -Down             # 컨테이너 정지
```

CLI 로 직접:

```bash
docker compose up -d --build      # 전체
docker compose up -d example-docs # docs 만
docker compose down
```

## pnpm 직접 명령

```bash
pnpm install
pnpm --filter @deepnoid/biewer build          # 패키지 빌드
pnpm --filter @deepnoid/biewer build --watch  # watch
pnpm --filter @biewer/example-docs dev        # 예제 dev
pnpm --filter @biewer/example-docs verify     # 헤드리스 end-to-end 검증
```

## 검증

`examples/docs` 는 헤드리스 Chrome 으로 실제 뷰어를 구동하는 `verify.cjs` 를 포함한다
(디코드→렌더, slice 이동, 도구 조작, 멀티뷰 컨트롤러 sync). 빌드+preview 후 `pnpm --filter @biewer/example-docs verify`.

## License

Proprietary — internal use at Deepnoid only.
