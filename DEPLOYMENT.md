# Deployment

## Target flow

`git push -> CI -> Docker build in GitHub -> push GHCR + Aliyun ACR -> server pull -> migrate -> start -> health check`

The production server must not build images locally.

## Registries

- GHCR: `ghcr.io/futuredecade/fd-core-stack`
- Aliyun ACR: configured by GitHub Secrets

The deploy workflow pushes both `latest` and the immutable Git SHA tag.
The server deploys the immutable SHA tag from ACR.

## Required GitHub Secrets

- `ACR_REGISTRY`
- `ACR_NAMESPACE`
- `ACR_USERNAME`
- `ACR_PASSWORD`
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_SSH_KNOWN_HOSTS`
- `DEPLOY_HEALTHCHECK_URL`

## Server bootstrap

1. Install Docker Engine and Docker Compose plugin.
2. Clone the repo to the deployment path.
3. Create the production `.env`.
4. Ensure `docker`, `git`, and `curl` are available on the server.
5. Open the configured public ports in the firewall or security group.

Example:

```bash
sudo mkdir -p /opt/fd-core-stack
sudo chown -R "$USER":"$USER" /opt/fd-core-stack
git clone git@github.com:FutureDecade/fd-core-stack.git /opt/fd-core-stack
cd /opt/fd-core-stack
cp .env.example .env
```

## Production compose

`docker-compose.prod.yml` only references prebuilt images:

- `api` and `worker` use `FD_CORE_RUNTIME_IMAGE`
- `postgres`, `redis`, and `caddy` use upstream images
- `caddy` publishes `${FD_CORE_HTTP_PORT}` and `${FD_CORE_HTTPS_PORT}` so the stack does not have to own host `80/443`

`FD_CORE_RUNTIME_IMAGE` is injected at deploy time by the workflow.

## Migration strategy

Deploys run `npm run db:migrate` inside the pulled runtime image before the app is restarted.

This keeps schema changes versioned and tied to the image release instead of using `db:push` against production.

## Rollback

On the server, redeploy the previous immutable image tag:

```bash
export FD_CORE_RUNTIME_IMAGE="your-acr.example.com/namespace/fd-core-stack:<previous-git-sha>"
export APP_VERSION="<previous-git-sha>"
docker compose -f docker-compose.prod.yml pull api worker
docker compose -f docker-compose.prod.yml up -d --remove-orphans api worker caddy
```
