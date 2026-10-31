#!/usr/bin/env bash
# OWNER-INVOKED synthetic-only GoTrue signed-JWT E2E. Never targets staging.
# Requires the existing dedicated CafeOS E2E Docker Compose stack. Docker
# containers and their persistent volumes are NEVER removed.
set -euo pipefail
umask 077

[[ $# == 0 && "$(id -u)" != 0 ]] || { echo 'STOP: no args; nonroot local owner only' >&2; exit 12; }
[[ "${CAFEOS_LOCAL_E2E_ACK:-}" == "ONLY_SYNTHETIC" ]] || {
  echo 'STOP: set CAFEOS_LOCAL_E2E_ACK=ONLY_SYNTHETIC after reviewing local stack' >&2; exit 12;
}
for bin in docker curl python3 flock; do
  command -v "$bin" >/dev/null || { echo "STOP: required local tool unavailable: $bin" >&2; exit 12; }
done
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
test -r "$here/run-local-cafeos-signed-jwt-e2e.py" || {
  echo 'STOP: local signed-JWT test source missing' >&2; exit 12;
}
db='supabase_db_cafeos-e2e-isolated-20261030'
auth='supabase_auth_cafeos-e2e-isolated-20261030'
rest='supabase_rest_cafeos-e2e-isolated-20261030'
kong='supabase_kong_cafeos-e2e-isolated-20261030'
names=("$db" "$auth" "$rest" "$kong")
for name in "${names[@]}"; do
  project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null)" || {
    echo 'STOP: dedicated local E2E container absent' >&2; exit 12;
  }
  [[ "$project" == "cafeos-e2e-isolated-20261030" ]] || {
    echo 'STOP: Docker project identity unexpected' >&2; exit 12;
  }
  [[ "$(docker inspect --format '{{.State.Running}}' "$name")" == false ]] || {
    echo 'STOP: dedicated E2E container already active; refusing to take ownership' >&2; exit 12;
  }
done
# Existing Docker Desktop test containers may bind 55321/55322 on 0.0.0.0.
# This is short-lived only, and requires an explicit network-risk acknowledgement.
bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$kong")"
if [[ "$bindings" == *'0.0.0.0'* || "$bindings" == *'"::"'* ]]; then
  [[ "${CAFEOS_LOCAL_E2E_WILDCARD_PORT_ACK:-}" == 'YES' ]] || {
    echo 'STOP: synthetic Docker gateway binds wildcard interfaces; network ACK required' >&2; exit 12;
  }
  echo 'LOCAL_SYNTHETIC_NETWORK_WARNING: Docker test ports temporarily bind all interfaces'
fi
lockdir="$HOME/.local/share/cafeos-synthetic-e2e"
mkdir -p -- "$lockdir"
chmod 700 "$lockdir"
exec 9>"$lockdir/active.lock"
flock -n 9 || { echo 'STOP: another local E2E test owns this lock' >&2; exit 12; }

started=0
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$started" == 1 ]]; then
    if ! docker stop --time 8 "${names[@]}" >/dev/null; then
      echo 'STOP: synthetic test containers could not all be stopped' >&2
      status=14
    else
      echo 'CAFEOS_SYNTHETIC_E2E_CONTAINERS_STOPPED_VOLUMES_PRESERVED'
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
started=1
docker start "$db" >/dev/null
docker start "$auth" "$rest" "$kong" >/dev/null
ready=0
for i in $(seq 1 20); do
  if curl -fsS --max-time 2 -o /dev/null http://127.0.0.1:55321/auth/v1/health 2>/dev/null; then
    ready=1; break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'STOP: local GoTrue E2E gateway unhealthy' >&2; exit 13; }
python3 "$here/run-local-cafeos-signed-jwt-e2e.py"
echo 'CAFEOS_SIGNED_JWT_GO_TRUE_E2E_LOCAL_PASS_STAGING_NOT_ACCESSED'
