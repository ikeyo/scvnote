# NAS 배포

로컬에서 완성/검증한 뒤에 옮긴다. NAS는 "완성품이 도는 곳"이고 개발 장소가 아니다.

**이 프로젝트가 확인한 대상: 시놀로지, x86_64.** ARM 크로스 빌드는 필요 없다. 아래
"시놀로지(x86) 설치 절차"를 그대로 따라가면 된다. 다른 NAS/아키텍처라면 더 아래
"일반 절차"를 본다.

---

## 시놀로지(x86) 설치 절차

저장소가 공개돼 있어 NAS에서 바로 `git clone`으로 받는다. 레지스트리 계정도,
파일을 따로 전송할 필요도 없다.

### 1) DSM에서 준비

1. **제어판 → 터미널 및 SNMP → SSH 서비스**를 활성화한다
2. **패키지 센터**에서 **Container Manager**(DSM 7.2+) 또는 구버전이면 **Docker** 패키지가
   설치돼 있는지 확인한다. 없으면 설치한다
3. **File Station**에서 공유 폴더를 하나 만든다 — 예: `docker` (아래는 `/volume1/docker` 기준)

### 2) 빠른 설치 — 클론 + 스크립트 한 번

NAS에 SSH로 접속해서:

```bash
ssh <NAS계정>@<NAS주소>
cd /volume1/docker
git clone https://github.com/ikeyo/scvnote.git
cd scvnote
./scripts/setup-nas.sh
```

`scripts/setup-nas.sh`가 하는 일:

1. `docker`/`docker compose(v2)`가 있는지 확인
2. `.env`가 없으면 `POSTGRES_PASSWORD` / `AUTH_SECRET` / `MCP_TOKEN`을
   `openssl rand`로 **자동 생성**해 채운다 (이미 있으면 건드리지 않는다 — 여러 번 돌려도 안전)
3. `docker compose up -d --build`로 빌드·기동
4. 마이그레이션 로그와 `/api/health`를 확인
5. 접속 주소와 **MCP 토큰을 화면에 출력**한다 (Claude Code/Codex 등록에 필요, 이때만 보인다)

Celeron 계열 CPU면 빌드에 5~15분 걸릴 수 있다 — 실패한 게 아니라 원래 그렇다.
끝나면 뜨는 주소로 브라우저에서 접속해 첫 계정을 만들면 끝이다.

이후 코드가 바뀌면 업데이트는 이 두 줄이다:

```bash
git pull
./scripts/setup-nas.sh
```

`.env`는 그대로 재사용되고, 컨테이너만 새로 빌드된다.

### 3) 확인

```bash
curl http://localhost:3000/api/health
# {"ok":true,"db":"up","notes":0}
```

같은 네트워크의 다른 기기에서 `http://<NAS의 LAN IP>:3000`으로 접속한다.

Container Manager는 도커 엔진 위의 GUI일 뿐, 뒤에서 도는 컨테이너는 SSH로 띄운 것과 동일하다.
설치가 끝나면 좌측 **프로젝트** 메뉴에서 같은 컨테이너들이 그대로 보이고, 이후 시작/정지/로그
확인은 GUI로 해도 된다 — **최초 설치와 `.env` 생성만 SSH + `setup-nas.sh`로 하는 걸 권한다.**
Container Manager의 compose 파서가 이 프로젝트가 쓰는 `depends_on.condition:
service_completed_successfully`(migrate 완료 후 app 시작) 같은 문법을 버전에 따라 못 받을 수
있어서다.

### 시놀로지에서 자주 걸리는 것

- **`docker compose`가 없고 `docker-compose`(구버전, 하이픈)만 있다** — Container Manager
  패키지를 최신으로 올리면 Compose v2가 같이 들어온다. 구버전 v1은 이 프로젝트가 쓰는
  `condition: service_completed_successfully`(migrate 완료 후 app 시작)를 지원하지 않을 수 있다
- **포트 3000이 이미 다른 패키지가 쓰고 있다** — 스크립트 실행 전에
  `APP_PORT=3800 ./scripts/setup-nas.sh` 처럼 환경변수로 넘기거나, `.env` 생성 후
  `APP_PORT`를 고쳐 `docker compose up -d`를 다시 실행한다
- **빌드가 느리다** — Celeron 계열은 `npm run build` 단계가 특히 느리다. 기다리면 끝난다.
  급하면 아래 "일반 절차"의 B안(로컬 빌드 → tar로 옮기기)으로 바꾼다
- **스크립트 실행 권한 오류(`Permission denied`)** — `chmod +x scripts/setup-nas.sh` 후 다시 실행

### 수동으로 하고 싶을 때

스크립트가 하는 일을 손으로 그대로 해도 된다.

```bash
cd /volume1/docker/scvnote
cp .env.example .env
# .env를 열어 POSTGRES_PASSWORD / AUTH_SECRET / MCP_TOKEN을 채운다
#   openssl rand -hex 24      (POSTGRES_PASSWORD - base64는 쓰지 않는다. "/" 가 섞이면
#                              compose.yaml이 만드는 DATABASE_URL이 깨진다)
#   openssl rand -base64 32   (AUTH_SECRET)
#   openssl rand -hex 32      (MCP_TOKEN)
docker compose up -d --build
docker compose logs -f migrate
```

`DATABASE_URL`과 `ATTACHMENTS_DIR`은 `compose.yaml`이 컨테이너 안에서 직접 채우므로
NAS용 `.env`에는 넣지 않아도 된다 (그 두 값은 로컬 개발 전용이다).

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
POSTGRES_PASSWORD=<openssl rand -hex 24 결과 - base64는 쓰지 않는다, "/" 가 섞이면 DATABASE_URL이 깨진다>
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
