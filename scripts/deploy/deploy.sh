#!/bin/sh
set -eu
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${ACR_REGISTRY:?ACR_REGISTRY is required}"
: "${ACR_USERNAME:?ACR_USERNAME is required}"
: "${ACR_PASSWORD:?ACR_PASSWORD is required}"
: "${FD_CORE_IMAGE_NAME:?FD_CORE_IMAGE_NAME is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
case "$IMAGE_TAG" in *[!0-9a-f]*|'') echo 'Release requires a full hexadecimal Git SHA'; exit 1;; esac
[ ${#IMAGE_TAG} -eq 40 ] || { echo 'Release requires a full Git SHA'; exit 1; }
cd "$DEPLOY_PATH"
# Serializes manual runs as well as workflow runs on the server.
exec 9>.deploy.lock
flock -n 9 || { echo 'Another release is running'; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo 'Tracked checkout changes prevent release'; exit 1; }
DEPLOY_COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-docker-compose.prod.yml}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-http://127.0.0.1/ready}"
git fetch origin "$IMAGE_TAG"
[ "$(git rev-parse "$IMAGE_TAG^{commit}")" = "$IMAGE_TAG" ] || exit 1
if [ "${DEPLOY_ROLLBACK:-0}" = 1 ]; then
  [ "${DEPLOY_ROLLBACK_SCHEMA_COMPATIBLE:-0}" = 1 ] || { echo 'Rollback requires an explicit schema compatibility decision'; exit 1; }
  [ -f ".deploy-releases/$IMAGE_TAG/verified" ] || { echo 'Rollback target was not previously verified'; exit 1; }
fi
if [ "${DEPLOY_ROLLBACK:-0}" = 1 ]; then
  FD_CORE_RELEASE_IMAGE=$(cat ".deploy-releases/$IMAGE_TAG/image")
fi
: "${FD_CORE_RELEASE_IMAGE:?An immutable published image digest is required}"
case "$FD_CORE_RELEASE_IMAGE" in "${FD_CORE_IMAGE_NAME}@sha256:"*) ;; *) echo 'Release image must use the expected repository digest'; exit 1;; esac
# Keep the original runtime configuration and verify a real backup before checkout or migration.
export FD_CORE_RUNTIME_IMAGE="$FD_CORE_RELEASE_IMAGE"
backup_database() {
  umask 077
  backup_dir=".deploy-backups/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir -p "$backup_dir"
  chmod 700 .deploy-backups "$backup_dir"
  cp .env "$backup_dir/env"
  cp "$DEPLOY_COMPOSE_FILE" Caddyfile "$backup_dir/"
  docker compose -f "$DEPLOY_COMPOSE_FILE" ps -q api | while read -r id; do
    [ -z "$id" ] || docker inspect "$id" --format '{{.Config.Image}}' > "$backup_dir/previous-image"
  done
  docker compose -f "$DEPLOY_COMPOSE_FILE" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_dir/database.dump"
  [ -s "$backup_dir/database.dump" ] || { echo 'Database backup is empty'; exit 1; }
  restore_db="stack_restore_$(date +%s)_$$"
  cleanup() {
    docker compose -f "$DEPLOY_COMPOSE_FILE" exec -T postgres sh -c 'dropdb --if-exists -U "$POSTGRES_USER" "$1"' sh "$restore_db" >/dev/null
  }
  trap cleanup EXIT HUP INT TERM
  docker compose -f "$DEPLOY_COMPOSE_FILE" exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$restore_db"
  docker compose -f "$DEPLOY_COMPOSE_FILE" exec -T postgres sh -c 'pg_restore --exit-on-error --single-transaction --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"' sh "$restore_db" < "$backup_dir/database.dump"
  tables=$(docker compose -f "$DEPLOY_COMPOSE_FILE" exec -T postgres sh -c 'psql -XAt -U "$POSTGRES_USER" -d "$1" -c "select count(*) from information_schema.tables where table_schema='\''public'\'' and table_type='\''BASE TABLE'\''"' sh "$restore_db")
  [ "$tables" -gt 0 ] || { echo 'Restored database has no application tables'; exit 1; }
  printf '%s\n' "restored-public-tables=$tables" > "$backup_dir/restore-verified"
  cleanup
  trap - EXIT HUP INT TERM
  echo "Database backup and isolated restore verified: $backup_dir"
}
backup_database
git checkout --detach "$IMAGE_TAG"
export FD_CORE_RUNTIME_IMAGE="$FD_CORE_RELEASE_IMAGE"
export APP_VERSION="$IMAGE_TAG"
printf '%s' "$ACR_PASSWORD" | docker login "$ACR_REGISTRY" --username "$ACR_USERNAME" --password-stdin
docker compose -f "$DEPLOY_COMPOSE_FILE" config >/dev/null
docker compose -f "$DEPLOY_COMPOSE_FILE" pull api worker
actual_version=$(docker image inspect "$FD_CORE_RUNTIME_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')
[ "$actual_version" = "$IMAGE_TAG" ] || { echo 'Image version does not match release SHA'; exit 1; }
docker compose -f "$DEPLOY_COMPOSE_FILE" run --rm --no-deps --user 0 --cap-add DAC_OVERRIDE --cap-add CHOWN -v "$DEPLOY_PATH:/release" api node scripts/deploy/prepare-production-env.mjs
release_dir=".deploy-releases/$IMAGE_TAG"
candidate_dir=".deploy-releases/candidates/$IMAGE_TAG-$$"
mkdir -p "$candidate_dir"
cp "$DEPLOY_COMPOSE_FILE" Caddyfile "$candidate_dir/"
printf '%s\n' "$FD_CORE_RUNTIME_IMAGE" > "$candidate_dir/image"
# Old Workers must be drained before migrations and new lease semantics run.
docker compose -f "$DEPLOY_COMPOSE_FILE" stop -t 45 worker
docker compose -f "$DEPLOY_COMPOSE_FILE" up -d --wait postgres redis
if [ "${DEPLOY_ROLLBACK:-0}" != 1 ]; then
  docker compose -f "$DEPLOY_COMPOSE_FILE" run --rm --no-deps -e HOME=/tmp -e npm_config_cache=/tmp/.npm api node scripts/run-migrations.mjs
fi
docker compose -f "$DEPLOY_COMPOSE_FILE" up -d --wait --wait-timeout 120 api worker caddy
attempt=1
while [ "$attempt" -le 30 ]; do
  response=$(curl --connect-timeout 2 --max-time 6 -fsS "$DEPLOY_HEALTHCHECK_URL" || true)
  if printf '%s' "$response" | grep -F "\"version\":\"$IMAGE_TAG\"" >/dev/null; then
    mkdir -p "$release_dir"
    cp "$candidate_dir/"* "$release_dir/"
    touch "$release_dir/verified"
    if [ -f .deploy-releases/current ] && [ "$(cat .deploy-releases/current)" != "$IMAGE_TAG" ]; then
      cp .deploy-releases/current .deploy-releases/previous
    fi
    printf '%s\n' "$IMAGE_TAG" > .deploy-releases/current.pending
    mv .deploy-releases/current.pending .deploy-releases/current
    echo "Verified release $IMAGE_TAG"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 3
done
echo 'Release readiness/version check failed; assets retained for a reviewed rollback'
exit 1
