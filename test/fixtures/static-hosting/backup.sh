#!/bin/sh
set -eu
mkdir -p "$3"
docker run --rm -v "$2_pages:/data:ro" --entrypoint tar "$(sed -n 's/^APP_IMAGE=//p' "$1/.env")" -C /data -cf - . > "$3/pages.tar"
(cd "$3" && sha256sum pages.tar > SHA256SUMS)
