#!/usr/bin/env bash
# ScvNote NAS 설치 스크립트.
#
# 처음 설치:
#   git clone https://github.com/ikeyo/scvnote.git
#   cd scvnote
#   ./scripts/setup-nas.sh
#
# 업데이트 (코드가 바뀐 뒤):
#   git pull
#   ./scripts/setup-nas.sh
#
# .env가 이미 있으면 새로 만들지 않고 그대로 재사용한다 - 비밀번호/토큰이
# 실행할 때마다 바뀌면 안 되기 때문에, 이 스크립트는 여러 번 돌려도 안전하다.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }

log "설정 확인"
if [ -f compose.override.yaml ]; then
  echo "compose.override.yaml 이 남아 있습니다. 이 파일은 app/migrate를 prod-test" >&2
  echo "프로필 뒤에 가둬서, 이 상태로는 db만 뜨고 app이 절대 시작되지 않습니다." >&2
  echo "지워도 되는 파일입니다 (로컬 개발 전용, .gitignore 대상):" >&2
  echo "  rm compose.override.yaml" >&2
  exit 1
fi
log "도커 확인"
if ! command -v docker >/dev/null 2>&1; then
  echo "docker 명령을 찾을 수 없습니다. 패키지 센터에서 Container Manager를 설치하세요." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose(v2)를 찾을 수 없습니다. Container Manager를 최신 버전으로 올려주세요." >&2
  echo "구버전 docker-compose(v1, 하이픈)는 이 프로젝트가 쓰는 compose 문법을 지원하지 않습니다." >&2
  exit 1
fi
# 위 두 검사는 명령이 있는지만 본다 - 도커 데몬에 실제로 닿는지는 별개다.
# 시놀로지 SSH 계정은 기본적으로 docker.sock 권한이 없어서 여기서 걸린다.
if ! docker info >/dev/null 2>&1; then
  echo "도커 데몬에 접속할 수 없습니다 (docker.sock 권한 없음)." >&2
  echo "둘 중 하나로 해결하세요:" >&2
  echo "  1) sudo $0        <- 이렇게 다시 실행 (간단, 패스워드를 물어봅니다)" >&2
  echo "  2) sudo synogroup --member docker $(id -un) 로 docker 그룹에 추가한 뒤 SSH 재접속" >&2
  exit 1
fi

if [ -f .env ]; then
  log ".env 이미 있음 - 새로 만들지 않고 그대로 씁니다"
else
  log ".env 생성 - 비밀번호·토큰을 자동으로 만듭니다"
  cp .env.example .env

  # macOS/BSD sed와 GNU sed 둘 다에서 동작하도록 -i.bak 뒤 바로 지운다
  sed_inplace() { sed -i.bak "$1" .env && rm -f .env.bak; }

  # hex, not base64: this value gets embedded unescaped into DATABASE_URL by
  # compose.yaml. base64's "/" breaks URL parsing there ("invalid port number").
  sed_inplace "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(openssl rand -hex 24)#"
  sed_inplace "s#^AUTH_SECRET=.*#AUTH_SECRET=$(openssl rand -base64 32)#"
  sed_inplace "s#^APP_PORT=.*#APP_PORT=${APP_PORT:-3000}#"
fi

# 화면 로고 옆에 찍히는 빌드 번호. 커밋 개수라 커밋할 때마다 저절로 하나씩 올라간다.
# git을 못 읽는 환경(압축 해제로 받은 경우 등)에서는 날짜로 대신한다.
if BUILD_NO=$(git rev-list --count HEAD 2>/dev/null); then
  BUILD_ID="#${BUILD_NO}"
  BUILD_INFO="$(git rev-parse --short HEAD) · $(date +"%Y-%m-%d %H:%M")"
else
  BUILD_ID=$(date +%y%m%d)
  BUILD_INFO=$(date +"%Y-%m-%d %H:%M")
fi
export BUILD_ID BUILD_INFO

log "빌드 + 기동 (빌드 $BUILD_ID, NAS CPU에 따라 5~15분 걸릴 수 있습니다)"
docker compose up -d --build

log "마이그레이션 확인"
docker compose logs migrate | tail -5

log "헬스체크"
PORT=$(grep '^APP_PORT=' .env | cut -d= -f2)
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    curl -s "http://localhost:${PORT}/api/health"
    echo
    break
  fi
  sleep 2
done

# `hostname -I` is a GNU/coreutils extension - Synology's BusyBox shell
# doesn't have it, so it silently returns nothing there. `ip addr` works on
# both; try it first and fall back for non-BusyBox systems that lack `ip`.
IP=$(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4, a, "/"); print a[1]; exit}')
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
log "완료"
if [ -n "${IP:-}" ]; then
  echo "  같은 네트워크의 다른 기기에서 이 주소로 접속하세요: http://${IP}:${PORT}"
else
  echo "  LAN 주소를 자동으로 찾지 못했습니다 - DSM 제어판에서 NAS의 IP를 확인해"
  echo "  http://<NAS IP>:${PORT} 로 접속하세요."
fi
echo "  (NAS 콘솔에서만 되는 주소: http://localhost:${PORT})"
echo "  첫 접속 시 화면에서 계정을 만드세요 - 그 계정이 자동으로 관리자가 됩니다."
echo "  이후 새 계정은 관리자가 /admin 에서 만드는 초대 링크로만 늘어납니다."
echo "  MCP(Claude Code/Codex) 연동 토큰은 로그인 후 /settings 에서 각자 발급합니다."
