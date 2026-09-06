# Claude 연동 (MCP)

`POST /api/mcp` 하나가 MCP Streamable HTTP 엔드포인트다.
인증은 `Authorization: Bearer <토큰>` — 브라우저 세션과는 별개다.

**계정마다 자기 토큰을 쓴다.** 예전처럼 `.env`의 `MCP_TOKEN` 하나를 모두가 공유하지 않는다.
이 토큰으로 들어오는 모든 요청은 그 계정이 웹 UI에서 보는 것과 정확히 같은 범위로 제한된다 -
본인이 만든 미분류 항목과, 본인이 멤버인 프로젝트의 항목. 자세한 배경은 [accounts.md](accounts.md).

> **이전에 `.env`의 `MCP_TOKEN`으로 등록해뒀다면 더 이상 동작하지 않는다.** 아래 순서대로
> 새 토큰을 받아 다시 등록해야 한다.

## 토큰 발급

1. 로그인한 상태로 `/settings` 접속
2. **"토큰 발급"** 클릭 - 화면에 **한 번만** 표시된다. 안전한 곳에 옮겨 적는다
3. 다시 발급하면 이전 토큰은 그 즉시 무효화된다 (Claude Code/Codex 쪽 등록도 다시 해야 한다)

## Claude Code에 등록

```bash
claude mcp add --transport http scvnote http://localhost:3100/api/mcp --header "Authorization: Bearer <내_토큰>"
```

NAS에 올린 뒤에는 Tailscale 주소로 바꾼다:

```bash
claude mcp add --transport http scvnote http://<nas-tailscale-name>:3000/api/mcp --header "Authorization: Bearer <내_토큰>"
```

Codex는 헤더 대신 환경변수 이름을 받는다 (자세한 절차는 이전 대화 기록 또는 Codex 문서 참고):

```bash
codex mcp add scvnote --url http://localhost:3100/api/mcp --bearer-token-env-var SCVNOTE_MCP_TOKEN
```

## 도구

| 도구 | 용도 |
|---|---|
| `list_projects` | 내가 멤버인 프로젝트 목록과 카테고리별 개수. 저장 전에 이걸로 이름을 확인한다 |
| `create_project` | 프로젝트 생성. 만든 사람이 자동으로 소유자가 된다. 이름 중복 불가 |
| `list_todos` | 내가 볼 수 있는 할 일 조회. 오류/개선/아이디어 구분 |
| `create_todo` | 할 일 추가 |
| `update_todo` | 진행 상태 변경. 완료 처리에 쓴다 |
| `list_tags` | 내가 볼 수 있는 노트에 쓰이는 태그와 개수. 표기 중복을 막는 데 쓴다 |
| `create_note` | 새 노트 저장. 본문은 **마크다운 그대로** 들어간다. `kind`로 카테고리, `project`로 소속 지정 |
| `update_note` | 제목·카테고리·프로젝트·고정 변경. 다른 프로젝트로 옮길 때 쓴다 |
| `append_to_note` | 기존 노트 끝에 마크다운 이어쓰기, 빈 줄로 구분해 붙는다 (작업일지 누적) |
| `search_notes` | 내가 볼 수 있는 노트에서 제목·본문 검색. `project`로 범위 한정 |
| `get_note` | ID로 본문 전문 읽기. 저장된 마크다운 원문을 `body`로 그대로 돌려준다 |
| `list_secrets` | 내 개인 항목 + 내가 멤버인 프로젝트의 공유 항목, 제목/계정/URL만 반환. 값 자체는 절대 안 보인다 |

`project` 인자는 **ID와 이름을 모두** 받는다. `"none"`을 주면 미분류만 대상으로 한다.
내가 멤버가 아닌 프로젝트는 지정할 수 없다. 자세한 계층 구조는 [projects.md](projects.md) 참고.

노트 본문은 **어느 방향으로도 변환하지 않는다.** 클로드 코드에서 만든 마크다운 문서를
`create_note`로 보내면 그 원문이 그대로 저장되고, `get_note`로 읽으면 보낸 그대로 돌아온다.
표시할 때만 HTML로 렌더한다.

## 저장소가 연결된 프로젝트의 작업일지에는 빌드 줄이 붙는다

프로젝트에 **코드 저장소 주소를 연결해두면**(프로젝트 화면에서 만들 때나 수정할 때 입력),
그 프로젝트의 작업일지는 글 첫 줄에 아래 형식이 있어야 저장된다.

```
## 빌드 #13 · 7fdcf61 · 14:20
```

나중에 **"빌드 #13에 뭐가 들어갔나"를 검색 한 번으로 되짚기 위해서다.** 날짜와 프로젝트만으로는
그게 안 된다.

빠뜨리면 서버가 저장을 **거부하고** 무엇을 어떻게 넣어야 하는지 응답으로 돌려준다. 규칙이
서버에 있으므로 클라이언트마다 따로 설정할 필요가 없고, 사용자는 "기록해줘"만 하면 된다 -
거부 메시지를 읽은 클라이언트가 아래 두 값을 구해 다시 보낸다.

```bash
git rev-list --count HEAD    # 커밋수 -> #13
git rev-parse --short HEAD   # 짧은해시 -> 7fdcf61
```

빌드 번호는 커밋 개수라 커밋마다 1씩 오른다(화면 로고 옆에 뜨는 그 번호와 같은 값이다).
서버는 이 값을 만들 수 없다 - 깃 히스토리는 클라이언트 쪽에만 있기 때문이다.

**저장소가 연결되지 않은 프로젝트, 미분류, 그리고 일반 노트·코드 스니펫은 이 규칙과 무관하다.**
회의록처럼 셀 커밋이 없는 일지는 그냥 저장된다.

`list_secrets`는 암호문 필드를 조회하지 않는다 — [security.md](security.md) 참고.
초대/관리자 기능(계정 관리, 초대 발급)은 MCP로 노출하지 않는다 - 웹 UI(`/admin`)에서만 한다.

## 쓰는 법

```
"ScvNote 프로젝트 작업일지에 오늘 한 거 정리해줘"   -> create_note
"NAS 프로젝트에서 도커 관련해서 적어둔 거 찾아줘"    -> search_notes
"거기에 해결 방법도 덧붙여줘"                       -> append_to_note
"방금 그 노트 ScvNote 프로젝트로 옮겨줘"            -> update_note
```

## 클라이언트별 접속 경로

| 클라이언트 | 연결 주체 | Tailscale만으로 되나 |
|---|---|---|
| Claude Code | 로컬 머신 | **된다** |
| Claude 데스크톱 앱 | 로컬 머신 | **된다** |
| Claude 모바일 / claude.ai | Anthropic 서버가 대신 호출 | **안 된다** — 공개 HTTPS(Cloudflare Tunnel) 필요 |

## 동작 확인

```bash
curl -s -X POST http://localhost:3100/api/mcp \
  -H "Authorization: Bearer <내_토큰>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
