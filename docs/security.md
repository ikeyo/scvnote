# 비밀번호 저장 설계

## 원칙

**서버(NAS)에 평문 비밀번호가 절대 남지 않는다.**
암·복호화는 브라우저에서만 일어나고, 서버는 암호문만 보관한다.
DB가 통째로 유출돼도 비밀번호는 열리지 않는다.

실제 저장 형태 (`Secret` 테이블):

```
        title        | username |                     secretCipher                     |     secretIv
---------------------+----------+------------------------------------------------------+------------------
 시놀로지 NAS 관리자 | admin    | D3ozISDEyhD10I5g0MhQNL+PDMbRfzj1QsSpu7ol7gGMFdIHA8c= | +AuDpxba4PirxzRD
```

## 흐름

1. `/secrets` 진입 시 **마스터 패스워드**를 입력받아 **PBKDF2-SHA256 600,000회**로
   32바이트 키를 파생한다 (`src/lib/crypto-client.ts`)
   - 키는 브라우저 메모리(React state)에만 존재한다. 서버 전송 없음, localStorage 저장 없음
   - 탭을 닫거나 "잠그기"를 누르면 사라진다
2. 저장 시 **AES-GCM 256**으로 브라우저에서 암호화 → `secretCipher` + `secretIv`만 전송
3. 조회 시에도 암호문을 받아 브라우저에서 복호화
4. 클립보드 복사 시 **30초 후 자동 삭제** (그 사이 다른 값이 복사됐으면 건드리지 않는다)

### PBKDF2를 쓴 이유

설계 단계에서는 Argon2id를 계획했지만 구현은 **PBKDF2-SHA256 600k**로 했다.
Web Crypto API에 내장돼 있어 WASM 번들도 추가 의존성도 필요 없고, 600k는 OWASP 2023
권고치다. Argon2id가 GPU 공격에 더 강한 것은 맞으므로, 나중에 마스터 패스워드를
재설정(=salt 교체)할 때 함께 올리면 된다.

## 마스터 패스워드 검증 방식

서버는 비밀번호를 모르므로 "맞는지" 판별해줄 수 없다. 대신 최초 설정 시
고정 문자열(probe)을 암호화해 `User.vaultCheckCipher`에 저장해두고,
잠금 해제 때 그것을 복호화해본다. AES-GCM은 인증 암호라 **키가 틀리면 복호화 자체가 실패**한다.

`vaultSalt`는 **한 번 설정되면 덮어쓸 수 없다** (`POST /api/vault` → 409).
salt가 바뀌면 기존 항목이 전부 영구히 열리지 않기 때문이다.

## 암호화되지 않는 필드

`title` / `username` / `url` / `memo` 는 평문이다. 검색이 가능해야 하기 때문이다.
**정말 민감한 정보는 이 필드에 쓰지 않는다.**

## MCP(Claude 연동) 범위

서버가 복호화 키를 모르므로 MCP 도구는 비밀번호를 읽지도 쓰지도 못한다.
이건 제약이 아니라 의도된 설계다 — AI 도구 경로로 비밀 정보가 새지 않는다.

`list_secrets` 도구는 `select`에서 `secretCipher`/`secretIv`를 **명시적으로 제외**한다.
제목·계정·URL·메모만 반환한다.

## 잃어버리면 복구 불가

마스터 패스워드에는 복구 수단이 없다. 이건 설계상 그래야 하는 부분이다.
분실 시 방법은 `Secret` 테이블을 비우고 `User.vaultSalt`를 NULL로 되돌린 뒤 다시 시작하는 것뿐이다.

```bash
docker compose exec db psql -U scvnote -d scvnote -c 'DELETE FROM "Secret"; UPDATE "User" SET "vaultSalt"=NULL,"vaultCheckCipher"=NULL,"vaultCheckIv"=NULL;'
```
