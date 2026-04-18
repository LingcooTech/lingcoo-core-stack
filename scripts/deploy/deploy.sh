#!/bin/sh

set -eu

: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${ACR_REGISTRY:?ACR_REGISTRY is required}"
: "${ACR_USERNAME:?ACR_USERNAME is required}"
: "${ACR_PASSWORD:?ACR_PASSWORD is required}"
: "${FD_CORE_IMAGE_NAME:?FD_CORE_IMAGE_NAME is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

DEPLOY_COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-docker-compose.prod.yml}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-http://127.0.0.1/ready}"
FD_CORE_RUNTIME_IMAGE="${FD_CORE_IMAGE_NAME}:${IMAGE_TAG}"
APP_VERSION="${IMAGE_TAG}"

cleanup_fd_core_images() {
  docker image prune -af \
    --filter "label=org.opencontainers.image.title=fd-core-stack" \
    >/dev/null 2>&1 || true
}

cleanup_stale_docker_state() {
  docker container prune -f >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
}

pull_runtime_images() {
  if docker compose -f "${DEPLOY_COMPOSE_FILE}" pull api worker; then
    return 0
  fi

  echo "image pull failed, pruning unused Docker images and retrying once"
  docker image prune -af >/dev/null 2>&1 || true
  cleanup_fd_core_images
  docker compose -f "${DEPLOY_COMPOSE_FILE}" pull api worker
}

cd "${DEPLOY_PATH}"

git fetch --prune origin
git checkout main
# The deploy checkout is treated as a disposable mirror of origin/main.
git reset --hard origin/main

printf '%s' "${ACR_PASSWORD}" | docker login "${ACR_REGISTRY}" --username "${ACR_USERNAME}" --password-stdin

export FD_CORE_RUNTIME_IMAGE
export APP_VERSION

cleanup_fd_core_images
cleanup_stale_docker_state

docker compose -f "${DEPLOY_COMPOSE_FILE}" config >/dev/null
pull_runtime_images
docker compose -f "${DEPLOY_COMPOSE_FILE}" up -d postgres redis
docker compose -f "${DEPLOY_COMPOSE_FILE}" run --rm --no-deps \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  api npm run db:migrate
docker compose -f "${DEPLOY_COMPOSE_FILE}" up -d --remove-orphans api worker caddy
cleanup_fd_core_images
cleanup_stale_docker_state

attempt=1
max_attempts=30

while [ "${attempt}" -le "${max_attempts}" ]; do
  if curl -fsS "${DEPLOY_HEALTHCHECK_URL}" >/dev/null; then
    echo "health check passed on attempt ${attempt}"
    exit 0
  fi

  echo "health check pending (${attempt}/${max_attempts})"
  attempt=$((attempt + 1))
  sleep 5
done

echo "deployment health check failed"
exit 1
