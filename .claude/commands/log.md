---
description: 지금까지 한 작업을 ScvNote 작업일지에 저장한다
argument-hint: [요약할 내용 (생략하면 대화 내용에서 알아서 정리)]
allowed-tools: Bash(git branch:*), Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(basename:*), Bash(date:*), mcp__scvnote__list_projects, mcp__scvnote__search_notes, mcp__scvnote__create_note, mcp__scvnote__append_to_note
---

## 지금 상황

- 저장소 폴더: !`basename "$PWD"`
- 오늘 날짜: !`date +%F`
- 브랜치: !`git branch --show-current 2>/dev/null`
- 변경 파일: !`git status --short 2>/dev/null | head -30`
- 최근 커밋: !`git log --oneline -5 2>/dev/null`

## 할 일

위 정보와 이번 대화에서 실제로 한 작업을 바탕으로 ScvNote에 작업일지를 남긴다.

사용자가 준 내용: $ARGUMENTS

### 절차

1. `list_projects`로 프로젝트를 확인한다. 저장소 폴더 이름과 같거나 비슷한 것을 고른다.
   딱 맞는 것이 없으면 **임의로 만들지 말고 어느 프로젝트에 넣을지 물어본다.**
2. `search_notes`로 `kind=WORKLOG`, 검색어를 오늘 날짜(`YYYY-MM-DD`)로 해서 오늘 작업일지가
   이미 있는지 찾는다.
3. 있으면 `append_to_note`로 이어쓴다. 없으면 `create_note`로 만든다.
   - 제목: `YYYY-MM-DD 작업일지`
   - `kind`: `WORKLOG`
   - `tags`: 이번 작업의 성격에 맞는 것 2~4개. `list_tags`로 기존 표기를 먼저 확인해
     `docker` / `Docker` 같은 중복을 만들지 않는다.

### 본문에 쓸 것

- **무엇을 했나** — 바꾼 것을 사실대로. 파일 경로를 같이 적는다
- **왜 그렇게 했나** — 다른 선택지를 버린 이유가 있으면 그것도
- **막힌 것 / 남은 것** — 있으면

추측을 쓰지 않는다. 실제로 한 것만 적는다. 확인하지 못한 것은 "확인 못 함"이라고 적는다.

저장한 뒤에는 노트 제목과 새로 들어간 줄 수만 한 줄로 보고한다. 본문을 다시 늘어놓지 않는다.
