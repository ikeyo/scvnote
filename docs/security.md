# 비밀번호 저장 설계

## 원칙

**서버(NAS)에 평문 비밀번호가 절대 남지 않는다.**
암·복호화는 브라우저에서만 일어나고, 서버는 암호문만 보관한다.
DB가 통째로 유출돼도 비밀번호는 열리지 않는다.

**마스터 패스워드는 계정마다 완전히 독립이다.** 개인(미분류) 항목은 그 계정의 개인 키로만
열리고 다른 계정과 전혀 겹치지 않는다. **프로젝트에 속한 항목은 그 프로젝트 멤버 전원과
자동으로 공유된다** - 개인/공유는 항목을 만들 때 프로젝트 소속 여부로 정해지며 이후 바꿀 수
없다(바꾸려면 새로 만들어야 함). 이유와 전체 계정 구조는 [accounts.md](accounts.md) 참고.

실제 저장 형태 (`Secret` 테이블):

```
        title        | username |                     secretCipher                     |     secretIv         | shared
---------------------+----------+------------------------------------------------------+----------------------+--------
 시놀로지 NAS 관리자 | admin    | D3ozISDEyhD10I5g0MhQNL+PDMbRfzj1QsSpu7ol7gGMFdIHA8c= | +AuDpxba4PirxzRD     | false
```

## 흐름

1. `/secrets` 진입 시 **마스터 패스워드**를 입력받아 **PBKDF2-SHA256 600,000회**로
   32바이트 개인 키를 파생한다 (`src/lib/crypto-client.ts`)
   - 키는 브라우저 메모리(React state)에만 존재한다. 서버 전송 없음, localStorage 저장 없음
   - 탭을 닫거나 "잠그기"를 누르면 사라진다
2. 개인(미분류) 항목은 **AES-GCM 256**으로 이 개인 키를 써서 브라우저에서 암호화 →
   `secretCipher` + `secretIv`만 전송
3. 조회 시에도 암호문을 받아 브라우저에서 복호화
4. 클립보드 복사 시 **30초 후 자동 삭제** (그 사이 다른 값이 복사됐으면 건드리지 않는다)

## 프로젝트 공유 항목 (RSA-OAEP 봉투 암호화)

개인 키는 마스터 패스워드에서 파생되므로 계정마다 다르다 - 그래서 같은 값을 다른 멤버와
그냥 나눠 가질 방법이 없다. Bitwarden/1Password와 같은 방식으로 해결한다:

1. 계정마다 **RSA-OAEP 2048** 키쌍을 하나씩 갖는다(첫 잠금 해제 때 자동 생성).
   공개키는 평문으로 저장하고(`User.vaultPublicKey`), 개인키는 그 계정의 개인 키로
   AES-GCM 암호화해 저장한다(`vaultPrivateKeyCipher`/`vaultPrivateKeyIv`) - 그러니
   본인 마스터 패스워드 없이는 아무도(서버 포함) 열 수 없다.
2. 프로젝트가 "공유 켜기"를 하면 무작위 **AES-256 프로젝트 키**를 하나 만들고, 그 순간
   공개키를 가진 멤버 각각의 공개키로 한 번씩 "봉투 암호화(wrap)"해 `ProjectVaultKey`에
   저장한다. 이후 새로 합류했거나 뒤늦게 보관함을 연 멤버에게는 "키 전달"로 같은 프로젝트
   키를 그 사람 공개키로 다시 wrap해서 건네준다.
3. 프로젝트 항목을 만들 때는 그 프로젝트 키로 암호화하고(`Secret.shared = true`), 열 때는
   각자 자신의 개인키로 프로젝트 키를 풀어서(unwrap) 그 키로 복호화한다.

서버는 wrap된 바이트만 보관할 뿐 프로젝트 키도, 어떤 개인키도 스스로 복원할 수 없다.

**알려진 한계**: 멤버를 프로젝트에서 제거해도 이미 그 사람이 받은 프로젝트 키 자체를
"모르게" 만들 수는 없다 - 재키(rotate) 절차가 없는 대부분의 유사 시스템과 같다. 민감도가
아주 높다면 제거 후 항목을 새로 만들어 옮기는 것이 유일한 대응이다.

## HTTP(비보안 컨텍스트) 폴백

브라우저의 `crypto.subtle`(Web Crypto)은 **보안 컨텍스트**(HTTPS 또는 `http://localhost`)에서만
제공된다. 나스를 LAN에서 `http://192.168.x.x:3000`처럼 평문 HTTP로 접속하면 이 조건을
만족하지 못해 `crypto.subtle`이 아예 `undefined`가 되고, 비밀번호 기능 전체가 동작하지 않는다.

이 앱은 로그인 쿠키(`COOKIE_SECURE`)와 마찬가지로 LAN에서의 평문 HTTP 접속을 지원 대상으로
삼고 있으므로, `crypto.subtle`이 없을 때는 **node-forge로 구현한 순수 JS 폴백**이 자동으로
대신 동작한다(`src/lib/crypto-client.ts`의 `hasSubtle()` 분기). PBKDF2 / AES-GCM / RSA-OAEP
세 알고리즘 모두 브라우저 네이티브와 **바이트 단위로 동일한 결과·같은 SPKI/PKCS8 DER
포맷**을 내도록 맞췄다 - 그래서 HTTPS로 접속한 멤버와 HTTP로 접속한 멤버가 같은 프로젝트
비밀번호를 문제없이 주고받는다(어느 한쪽이 만든 암호문을 다른 쪽이 못 여는 일이 없다).

**트레이드오프**: 순수 JS 구현은 브라우저 내장 구현보다 신뢰 표면이 넓다(외부 의존성 하나
추가, 하드웨어 가속 없음). 그래서 HTTPS + 네이티브 Web Crypto 쪽을 여전히 기본으로 삼고,
폴백은 그게 불가능할 때만 조용히 대신 동작한다 - 이건 사용자가 "보안을 낮추더라도 HTTP와
같이 쓸 수 있게 하자"고 명시적으로 선택한 트레이드오프다.

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
분실 시 방법은 **그 계정 소유**의 `Secret` 행을 비우고 `User.vaultSalt`를 NULL로 되돌린 뒤
다시 시작하는 것뿐이다.

**반드시 이메일로 대상 계정을 좁혀서 실행한다** - 여러 계정이 함께 쓰는 DB에서 `WHERE` 없이
`Secret` 전체를 지우면 다른 모든 사람의 보관함도 같이 날아간다.

```bash
docker compose exec db psql -U scvnote -d scvnote -c "
  DELETE FROM \"Secret\" WHERE \"ownerId\" = (SELECT id FROM \"User\" WHERE email = '분실한계정@example.com');
  UPDATE \"User\" SET \"vaultSalt\"=NULL, \"vaultCheckCipher\"=NULL, \"vaultCheckIv\"=NULL
    WHERE email = '분실한계정@example.com';
"
```
