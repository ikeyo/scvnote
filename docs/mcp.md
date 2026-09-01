# Claude 연동 (MCP)

`POST /api/mcp` 하나가 MCP Streamable HTTP 엔드포인트다.
인증은 `Authorization: Bearer <MCP_TOKEN>` — 브라우저 세션과는 별개다.

## 토큰 만들기

```bash
openssl rand -hex 32
```

`.env`의 `MCP_TOKEN=` 에 넣는다. 비어 있으면 엔드포인트는 **모든 요청을 401로 거부**한다.

## Claude Code에 등록

```bash
claude mcp add --transport http scvnote http://localhost:3100/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

NAS에 올린 뒤에는 Tailscale 주소로 바꾼다:

```bash
claude mcp add --transport http scvnote http://<nas-tailscale-name>:3000/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

## 도구

| 도구 | 용도 |
|---|---|
| `list_todos` | 남은 할 일 조회. 오류/개선/아이디어 구분 |
| `create_todo` | 할 일 추가 |
| `update_todo` | 진행 상태 변경. 완료 처리에 쓴다 |
| `list_tags` | 쓰이고 있는 태그와 노트 개수. 표기 중복을 막는 데 쓴다 |
| `list_projects` | 프로젝트 목록과 카테고리별 개수. 저장 전에 이걸로 이름을 확인한다 |
| `create_project` | 프로젝트 생성. 이름 중복 불가 |
| `create_note` | 새 노트 저장. `kind`로 카테고리, `project`로 소속 지정 |
| `update_note` | 제목·카테고리·프로젝트·고정 변경. 다른 프로젝트로 옮길 때 쓴다 |
| `append_to_note` | 기존 노트 끝에 이어쓰기 (작업일지 누적) |
| `search_notes` | 제목·본문 검색. `project`로 범위 한정 |
| `get_note` | ID로 본문 전문 읽기 |
| `list_secrets` | 비밀번호 항목의 **제목/계정/URL만** 반환 |

`project` 인자는 **ID와 이름을 모두** 받는다. `"none"`을 주면 미분류만 대상으로 한다.
자세한 계층 구조는 [projects.md](projects.md) 참고.

`list_secrets`는 암호문 필드를 조회하지 않는다. 비밀번호 값은 구조상 MCP로 나갈 수 없다 —
[security.md](security.md) 참고.

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
  -H "Authorization: Bearer <MCP_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
