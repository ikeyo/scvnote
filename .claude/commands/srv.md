---
description: 테스트 서버 접속 정보를 ScvNote에 코드 스니펫으로 저장한다
argument-hint: [예 - 스테이징 API, https://staging.example.com, 계정 deploy, 22번 포트]
allowed-tools: Bash(basename:*), mcp__scvnote__list_projects, mcp__scvnote__search_notes, mcp__scvnote__create_note, mcp__scvnote__append_to_note, mcp__scvnote__list_secrets
---

저장소 폴더: !`basename "$PWD"`

## 할 일

테스트/스테이징 서버의 접속 정보를 찾기 쉽게 남긴다.

사용자가 준 정보: $ARGUMENTS

## 반드시 지킬 것 — 비밀번호는 여기 저장하지 않는다

**비밀번호·API 키·토큰·개인키는 노트에 적지 않는다.** 노트 본문은 평문으로 저장된다.

사용자가 준 내용에 그런 값이 섞여 있으면:

1. 그 값을 **노트에 쓰지 말고**
2. `<보관함 참조>` 로 대체해 저장한 뒤
3. "비밀번호는 웹 UI(`/secrets`)에 직접 넣으세요. 거기서만 암호화됩니다"라고 알린다

MCP로는 비밀번호를 저장할 수도 읽을 수도 없다. 이건 제약이 아니라 설계다.
자세한 내용은 `docs/security.md`.

## 저장 형식

1. `list_projects`로 프로젝트를 고른다. 딱 맞는 것이 없으면 물어본다.
2. `search_notes`로 `kind=SNIPPET`, 검색어 `접속 정보`로 기존 노트를 찾는다.
   - 있으면 `append_to_note`로 이어쓴다
   - 없으면 `create_note` — 제목 `접속 정보`, `kind=SNIPPET`, `tags: ["접속정보", "서버"]`
3. 항목마다 이 형식으로 적는다.

```
[서버 이름]
용도    : 스테이징 API / 테스트 DB 등
주소    : https://... 또는 host:port
계정    : 사용자명
접속    : 실제로 치는 명령 한 줄 (ssh / psql / curl 등)
비밀번호: <보관함 참조>
메모    : 만료일, 주의사항, 누가 관리하는지
```

모르는 항목은 지어내지 말고 `확인 못 함`이라고 적는다.

저장 후 어느 노트에 어떤 서버를 추가했는지 한 줄로 보고하고,
비밀번호를 걸러낸 경우 그 사실을 반드시 같이 알린다.
