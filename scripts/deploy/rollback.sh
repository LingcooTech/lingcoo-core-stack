#!/bin/sh
set -eu
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${DEPLOY_ROLLBACK_SCHEMA_COMPATIBLE:?Confirm the target image supports the current schema}"
IMAGE_TAG="${IMAGE_TAG:-$(cat "$DEPLOY_PATH/.deploy-releases/previous")}"
export IMAGE_TAG DEPLOY_ROLLBACK=1
exec sh "$(dirname "$0")/deploy.sh"
