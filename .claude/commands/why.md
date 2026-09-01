---
description: 방금 수정한 코드의 "왜"를 ScvNote에 기록한다
argument-hint: [수정 이유 (생략하면 대화 내용에서 뽑는다)]
allowed-tools: Bash(git branch:*), Bash(git status:*), Bash(git diff:*), Bash(basename:*), Bash(date:*), mcp__scvnote__list_projects, mcp__scvnote__search_notes, mcp__scvnote__create_note, mcp__scvnote__append_to_note
---

## 지금 변경 상태

- 저장소 폴더: !`basename "$PWD"`
- 오늘 날짜: !`date +%F`
- 변경 파일: !`git status --short 2>/dev/null | head -30`
- 변경 요약: !`git diff --stat 2>/dev/null | tail -20`

## 할 일

코드만 봐서는 알 수 없는 **판단의 근거**를 남긴다. 나중에 이 코드를 보고
"왜 이렇게 했지?"라고 물을 때 답이 되는 내용이다.

사용자가 준 이유: $ARGUMENTS

### 절차

1. `list_projects`로 프로젝트를 고른다. 딱 맞는 것이 없으면 물어본다.
2. `search_notes`로 `kind=WORKLOG`, 오늘 날짜로 오늘 작업일지를 찾는다.
3. 있으면 `append_to_note`, 없으면 `create_note`(제목 `YYYY-MM-DD 작업일지`, `kind=WORKLOG`).

### 본문 형식

각 항목을 이렇게 적는다.

```
[수정 이유] 파일경로:줄번호
무엇을 바꿨나 — 한 줄
왜 — 그렇게 하지 않으면 무엇이 깨지는지, 또는 어떤 선택지를 왜 버렸는지
```

### 규칙

- **diff를 그대로 옮기지 않는다.** 코드는 저장소에 있다. 여기 남길 것은 코드에 없는 정보다
- 되돌리면 안 되는 결정, 손대면 깨지는 자리는 반드시 적는다
- 이유를 모르면 지어내지 말고 사용자에게 묻는다

저장 후 어느 노트에 몇 건을 적었는지만 한 줄로 보고한다.
