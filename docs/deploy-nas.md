# NAS 배포

로컬에서 완성/검증한 뒤에 옮긴다. NAS는 "완성품이 도는 곳"이고 개발 장소가 아니다.

**이 프로젝트가 확인한 대상: 시놀로지, x86_64.** ARM 크로스 빌드는 필요 없다. 아래
"시놀로지(x86) 설치 절차"를 그대로 따라가면 된다. 다른 NAS/아키텍처라면 더 아래
"일반 절차"를 본다.

---

## 시놀로지(x86) 설치 절차

레지스트리 계정 없이 **NAS에서 직접 빌드**하는 방식이다. 처음 설치할 때 손이 제일 적게 간다.
Celeron 계열 CPU면 빌드에 5~15분 걸릴 수 있지만, 실패한 게 아니라 원래 그렇다.

### 1) DSM에서 준비

1. **제어판 → 터미널 및 SNMP → SSH 서비스**를 활성화한다
2. **패키지 센터**에서 **Container Manager**(DSM 7.2+) 또는 구버전이면 **Docker** 패키지가
   설치돼 있는지 확인한다. 없으면 설치한다
3. **File Station**에서 공유 폴더를 하나 만든다 — 예: `docker` (아래는 `/volume1/docker` 기준)

### 2) 소스를 NAS로 옮긴다

이 저장소는 아직 GitHub 같은 원격에 올라가 있지 않다. 지금은 로컬(이 PC)에서 압축해
SCP로 보낸다. `node_modules`, `.next`, 로컬 데이터는 뺀다 — NAS에서 새로 설치되고,
데이터도 새로 시작하기 때문이다.

이 PC(Windows, Git Bash)에서:

```bash
cd "D:/work/ScvNote"
tar --exclude=node_modules --exclude=.next --exclude=data --exclude=.git \
    -czf /tmp/scvnote-src.tar.gz .

scp /tmp/scvnote-src.tar.gz <NAS계정>@<NAS주소>:/volume1/docker/
```

NAS에 SSH로 접속해 압축을 푼다:

```bash
ssh <NAS계정>@<NAS주소>
mkdir -p /volume1/docker/scvnote
tar -xzf /volume1/docker/scvnote-src.tar.gz -C /volume1/docker/scvnote
rm /volume1/docker/scvnote-src.tar.gz
cd /volume1/docker/scvnote
```

> 앞으로 코드를 바꿀 때마다 이 tar/scp를 반복하는 건 번거롭다. 자리잡으면
> **GitHub에 푸시해두고 NAS에서 `git clone` / `git pull`로 받는 방식**으로 바꾸는 걸 권한다.
> 그러면 이 2번 단계가 `git pull` 한 줄로 줄어든다.

### 3) NAS 전용 `.env`를 만든다

로컬 `.env`를 그대로 옮기면 안 된다 — 로컬 전용 값(포트 3100/5434, 개발용 토큰)이 들어 있다.
NAS에서 새로 만든다.

```bash
# NAS 쉘에서, /volume1/docker/scvnote 안에서
cp .env.example .env
```

값을 미리 생성해둔다 (이 PC의 Git Bash에서 실행해도 되고, NAS 쉘에서 해도 된다):

```bash
openssl rand -base64 24   # POSTGRES_PASSWORD 용
openssl rand -base64 32   # AUTH_SECRET 용
openssl rand -hex 32      # MCP_TOKEN 용
```

`.env`를 열어(`vi .env` 또는 File Station의 텍스트 편집기) 아래 값을 채운다:

```
POSTGRES_USER=scvnote
POSTGRES_PASSWORD=<위에서 만든 값>
POSTGRES_DB=scvnote

APP_PORT=3000

AUTH_SECRET=<위에서 만든 값>
MCP_TOKEN=<위에서 만든 값>

ADMIN_EMAIL=본인 이메일
```

`DATABASE_URL`과 `ATTACHMENTS_DIR`은 `compose.yaml`이 컨테이너 안에서 직접 채우므로
NAS용 `.env`에는 넣지 않아도 된다 (그 두 값은 로컬 개발 전용이다).

### 4) 빌드하고 기동한다

```bash
# NAS 쉘에서
docker compose version   # v2인지 확인. 없으면 Container Manager를 최신으로 업데이트
docker compose up -d --build
```

`migrate` 컨테이너가 먼저 돌아 마이그레이션을 적용하고 종료한 뒤 `app`이 뜬다. 진행 확인:

```bash
docker compose ps
docker compose logs -f migrate    # "No pending migrations" 또는 적용 로그가 보이면 정상
docker compose logs -f app
```

### 5) 확인

```bash
curl http://localhost:3000/api/health
# {"ok":true,"db":"up","notes":0}
```

같은 네트워크의 다른 기기에서 `http://<NAS의 LAN IP>:3000`으로 접속해 첫 계정을 만든다.
Container Manager 앱(DSM 7.2+)을 쓴다면 좌측 **프로젝트** 메뉴에서 같은 컨테이너들이
GUI로도 보인다 — 다만 이 프로젝트는 SSH + CLI 기준으로 검증했다.

### 시놀로지에서 자주 걸리는 것

- **`docker compose`가 없고 `docker-compose`(구버전, 하이픈)만 있다** — Container Manager
  패키지를 최신으로 올리면 Compose v2가 같이 들어온다. 구버전 v1은 이 프로젝트가 쓰는
  `condition: service_completed_successfully`(migrate 완료 후 app 시작)를 지원하지 않을 수 있다
- **포트 3000이 이미 다른 패키지가 쓰고 있다** — `.env`의 `APP_PORT`를 다른 값(예: 3800)으로
  바꾸고 `docker compose up -d`를 다시 실행한다
- **빌드가 느리다** — Celeron 계열은 `npm run build` 단계가 특히 느리다. 기다리면 끝난다.
  급하면 아래 "일반 절차"의 B안(로컬 빌드 → tar로 옮기기)으로 바꾼다

### 다음 단계

- 계정을 하나 만들었다면 `/notes`에서 실제로 써본다
- 외부(집 밖)에서 접속하려면 아래 **4. 외부 접속**을 본다 — 포트포워딩으로 그냥 열지 않는다
- 정기 백업은 아래 **5. 백업**을 본다

---

## 일반 절차 (참고용 — 시놀로지 x86이 아닌 경우)

### 0. 사전 확인 — CPU 아키텍처

NAS가 ARM 계열(일부 시놀로지 DS/J 모델 등)이면 이 PC(x86_64)에서 만든 이미지가 실행되지 않는다.

```bash
ssh nas 'uname -m'
```

- `x86_64` → 위 "시놀로지(x86) 설치 절차"를 그대로 쓴다
- `aarch64` / `armv7l` → 아래 빌드 명령에 `--platform linux/arm64`를 붙인다

### 1. 이미지 전달 — 세 가지 방법

#### A. 레지스트리 경유 (권장, 업데이트가 잦아질 때)

한 번 세팅해두면 이후 업데이트가 `pull && up -d`로 끝난다.

```bash
docker build --platform linux/amd64 -t ghcr.io/<user>/scvnote-app:latest --target runner .
docker build --platform linux/amd64 -t ghcr.io/<user>/scvnote-migrator:latest --target migrator .
docker push ghcr.io/<user>/scvnote-app:latest
docker push ghcr.io/<user>/scvnote-migrator:latest
```

NAS 쪽 `compose.yaml`에서는 `build:` 블록을 지우고 `image:`만 남긴다.

#### B. tar 파일로 직접 옮기기 (레지스트리 없이, NAS CPU가 약할 때)

```bash
docker save scvnote-app:latest scvnote-migrator:latest -o scvnote-images.tar
```

NAS로 복사한 뒤:

```bash
docker load -i scvnote-images.tar
```

#### C. NAS에서 직접 빌드

소스를 옮기고 `docker compose up -d --build`. 시놀로지 x86 절차가 바로 이 방식이다.

### 2. NAS에 올릴 것

```
compose.yaml       # override 는 제외
.env               # NAS 전용 값으로 새로 작성
```

`.env`에서 반드시 바꿀 값:

```
POSTGRES_PASSWORD=<강한 임의 문자열>
AUTH_SECRET=<openssl rand -base64 32 결과>
MCP_TOKEN=<openssl rand -hex 32 결과>
APP_PORT=3000
```

### 3. 기동

```bash
docker compose up -d
```

`migrate` 컨테이너가 먼저 돌면서 마이그레이션을 적용하고 종료한 뒤 `app`이 뜬다.

**로컬 DB 데이터는 옮기지 않는다.** 테스트 데이터는 버리고 빈 DB로 시작한다.

## 4. 외부 접속

포트포워딩으로 인터넷에 그대로 열지 않는다. 비밀번호를 보관하는 앱이다.

- **Tailscale** — NAS와 기기들을 개인 VPN으로 묶는다. 포트 개방 0개. PC/폰 브라우저에서만
  쓸 거면 이걸로 충분
- **Cloudflare Tunnel** — 공개 도메인이 필요할 때. Claude 모바일 앱에서 MCP로 접속하려면
  이쪽이 필요하다 (Anthropic 서버가 대신 호출하므로 공개 HTTPS가 있어야 한다)

## 5. 백업

백업 대상은 두 개다.

```bash
docker compose exec -T db pg_dump -U scvnote scvnote > scvnote-$(date +%F).sql
docker run --rm -v scvnote_attachments:/data -v "$PWD:/out" alpine \
  tar czf /out/attachments-$(date +%F).tar.gz -C /data .
```

NAS 스냅샷 기능을 쓴다면 도커 볼륨 경로를 포함시키는 편이 간단하다.
