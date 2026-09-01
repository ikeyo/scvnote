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
warn() { printf '\033[1;33m! %s\033[0m\n' "$1"; }

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
  sed_inplace "s#^MCP_TOKEN=.*#MCP_TOKEN=$(openssl rand -hex 32)#"
  sed_inplace "s#^APP_PORT=.*#APP_PORT=${APP_PORT:-3000}#"

  warn ".env의 ADMIN_EMAIL은 기본값(you@example.com)입니다 - 실제 로그인 이메일은 첫 접속 시 화면에서 직접 정합니다"
fi

log "빌드 + 기동 (NAS CPU에 따라 5~15분 걸릴 수 있습니다)"
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

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
log "완료"
echo "  로컬:  http://localhost:${PORT}"
[ -n "${IP:-}" ] && echo "  LAN:   http://${IP}:${PORT}"
echo "  첫 접속 시 화면에서 계정을 만드세요 (회원가입은 이 한 번뿐입니다)."
echo
echo "MCP 토큰 (Claude Code / Codex 등록용, 한 번만 표시):"
grep '^MCP_TOKEN=' .env
