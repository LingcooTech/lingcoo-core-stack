ARG NODE_BASE_IMAGE=registry.access.redhat.com/ubi9/nodejs-22@sha256:99cef5d0a64011463c411db508b1570f9edc37219dd38eabbf90bb8c0e45ccc3

FROM ${NODE_BASE_IMAGE} AS deps

USER 0

WORKDIR /app

COPY package*.json .node-version .npmrc ./
COPY scripts/check-toolchain.mjs ./scripts/check-toolchain.mjs
COPY admin-ui/package.json ./admin-ui/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked node scripts/check-toolchain.mjs && npm ci --cache=/root/.npm --ignore-scripts --no-audit --no-fund

FROM ${NODE_BASE_IMAGE} AS production-deps
USER 0
WORKDIR /app
COPY package*.json .node-version .npmrc ./
COPY scripts/check-toolchain.mjs ./scripts/check-toolchain.mjs
COPY admin-ui/package.json ./admin-ui/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked node scripts/check-toolchain.mjs && npm ci --cache=/root/.npm --omit=dev --ignore-scripts --no-audit --no-fund --workspace @lingcoo/contracts --include-workspace-root

FROM deps AS build

COPY scripts/build-shared-package.mjs ./scripts/build-shared-package.mjs
COPY packages ./packages
COPY admin-ui ./admin-ui
RUN npm run build:packages && npm run build:admin

COPY tsconfig.json ./
COPY scripts ./scripts
COPY app-products ./app-products
COPY src ./src
COPY drizzle ./drizzle
RUN npm run build

FROM ${NODE_BASE_IMAGE} AS runtime

ARG APP_VERSION=development

USER 0

WORKDIR /app
ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="fd-core-stack"
LABEL org.opencontainers.image.source="https://github.com/LingcooTech/lingcoo-core-stack"
LABEL org.opencontainers.image.version="${APP_VERSION}"

COPY --from=build /app/package*.json ./
COPY --from=build /app/.node-version /app/.npmrc ./
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/app-products ./app-products
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/admin-ui/dist ./admin-ui/dist

RUN mkdir -p /app/private-handovers /app/private-assets && chmod 700 /app/private-handovers /app/private-assets && chown -R 1001:0 /app

USER 1001

EXPOSE 3000

CMD ["node", "dist/server.js"]
