# ScvNote

작업일지 / 노트 / 코드 스니펫 / 할 일 / 비밀번호 보관 앱. 프로젝트 단위로 여러 계정이
노트·할 일·비밀번호를 함께 쓴다 (미분류 항목만 만든 사람에게 분리). 로컬에서 개발하고,
완성되면 같은 이미지를 NAS 도커에 올려 돌린다.

## NAS에 설치하기 (가장 빠른 길)

시놀로지(x86) 기준. SSH로 접속해 세 줄이면 끝난다.

```bash
git clone https://github.com/ikeyo/scvnote.git
cd scvnote
./scripts/setup-nas.sh
```

`.env`(비밀번호·토큰) 생성부터 빌드·기동·헬스체크까지 스크립트가 대신 한다.
자세한 사전 준비(SSH 활성화, Container Manager 등)와 문제 해결은 [docs/deploy-nas.md](docs/deploy-nas.md).

## 스택

| 영역 | 선택 |
|---|---|
| 앱 | Next.js 16 (App Router) + TypeScript + Tailwind 4 |
| DB | PostgreSQL 16 + Prisma 7 (pg 드라이버 어댑터) |
| 에디터 | TipTap 3 (코드블록 하이라이팅, 스크린샷 붙여넣기) |
| 검색 | Postgres `pg_trgm` GIN 인덱스 |
| 구조 | 프로젝트 > 카테고리(작업일지·스니펫·노트) > 문서. 미분류가 기본 |
| 할 일 | 프로젝트별 오류·개선·아이디어 추적. 대기/진행 중/완료 |
| 인증 | 세션 쿠키 (scrypt + JWT). 회원가입 없음 - 관리자 초대로만 계정이 는다 |
| 공유 | 프로젝트 멤버십 기반. 비밀번호는 프로젝트 소속 여부로 공유/개인 결정 (RSA-OAEP 봉투 암호화) |
| Claude 연동 | MCP Streamable HTTP 엔드포인트, 계정마다 자기 토큰 |
| 배포 | Docker Compose (`app` + `db` + 일회성 `migrate`) |

## 기능

| 화면 | 하는 일 |
|---|---|
| `/login` | 최초 1회 계정 생성(자동 관리자), 이후 로그인 |
| `/invite/[token]` | 관리자가 발급한 초대 링크로 새 계정 만들기 (공개, 로그인 불필요) |
| `/admin` | 관리자 전용: 초대 발급, 계정 승격/비활성화 |
| `/settings` | 내 MCP 토큰 발급 |
| `/projects` | 프로젝트 생성·수정·보관·삭제, 멤버 관리 |
| `/todos` | 프로젝트별 할 일. 오류·개선·아이디어를 진행 체크 |
| `/tags` | 태그 이름 변경·합치기·삭제·미사용 정리 |
| `/notes` | 프로젝트/카테고리별 목록 · 검색 |
| `/notes/[id]` | TipTap 에디터. 자동 저장, 태그, 스크린샷 `Ctrl+V` 첨부, 공개 링크 켜기/끄기 |
| `/s/[token]` | 노트의 로그인 없는 읽기 전용 공개 링크 |
| `/secrets` | 비밀번호 보관함. 브라우저에서만 복호화, 계정마다 완전히 독립 |
| `/api/mcp` | Claude Code / Codex 연동, 계정별 토큰 |

## 로컬 개발

```bash
cp .env.example .env      # 최초 1회, 값 채우기
npm install
npm run db:up             # Postgres 컨테이너만 기동 (호스트 5434 포트)
npx prisma migrate dev    # 마이그레이션 적용 + 클라이언트 생성
npm run dev               # http://localhost:3100
```

앱은 컨테이너 밖(호스트)에서 돌린다. Windows 볼륨 마운트를 거치면 HMR이 느려지고
자주 깨지기 때문에, 개발 중에는 DB만 컨테이너에 둔다.

동작 확인: <http://localhost:3100/api/health>

## 프로덕션 이미지 로컬 검증

NAS에 올리기 전에 **NAS에서 돌 것과 동일한 스택**을 로컬에서 한 번 띄워본다.

```bash
npm run prod:test
```

`app` + `migrate` + `db` 전부 기동된다. 여기서 잡히는 것들: 빌드 타임 환경변수 누락,
standalone 출력 설정, 볼륨 권한, DB 호스트명(`localhost` → `db`).

## 스크립트

| 명령 | 하는 일 |
|---|---|
| `npm run db:up` | Postgres 컨테이너 기동 |
| `npm run db:down` | 스택 정지 (데이터 유지) |
| `npm run db:reset` | 볼륨까지 삭제 후 재기동 (**데이터 소멸**) |
| `npm run db:psql` | psql 셸 접속 |
| `npm run prisma:studio` | Prisma Studio (DB GUI) |
| `npm run prod:test` | 프로덕션 스택 로컬 기동 |
| `npm run test:e2e` | API 통합 테스트 (개발 서버가 떠 있어야 한다) |

## 파일 구조에서 알아둘 것

- `compose.yaml` — 베이스. **이 파일만 NAS로 간다**
- `compose.override.yaml` — 로컬 전용, 자동 병합. NAS로 복사 금지
- `prisma.config.ts` — Prisma 7부터 DB 접속 URL이 `schema.prisma`가 아니라 여기에 있다
- `src/generated/prisma` — Prisma 생성물. git에 넣지 않으며 `prisma generate`로 재생성된다
- `src/lib/crypto-client.ts` — **브라우저 전용.** 서버에서 import하면 설계가 깨진다

## 문서

- [계정과 공유](docs/accounts.md)
- [프로젝트와 카테고리](docs/projects.md)
- [할 일](docs/todos.md)
- [태그](docs/tags.md)
- [NAS 배포](docs/deploy-nas.md)
- [비밀번호 저장 설계](docs/security.md)
- [Claude 연동 (MCP)](docs/mcp.md)
