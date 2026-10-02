ARG NODE_BASE_IMAGE=registry.access.redhat.com/ubi9/nodejs-22

FROM ${NODE_BASE_IMAGE} AS deps

USER 0

WORKDIR /app

COPY package*.json ./
COPY admin-ui/package.json ./admin-ui/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
RUN npm ci --ignore-scripts

FROM deps AS build

COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY scripts ./scripts
COPY app-products ./app-products
COPY src ./src
COPY packages ./packages
COPY drizzle ./drizzle

# Build admin-ui SPA
COPY admin-ui ./admin-ui
RUN npm run build:packages && npm run build:admin

# Build backend
RUN npm run build

FROM ${NODE_BASE_IMAGE} AS runtime

ARG APP_VERSION=development

USER 0

WORKDIR /app
ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="fd-core-stack"
LABEL org.opencontainers.image.source="https://github.com/FutureDecade/fd-core-stack"
LABEL org.opencontainers.image.version="${APP_VERSION}"

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/app-products ./app-products
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages ./packages
COPY --from=build /app/admin-ui/dist ./admin-ui/dist

RUN chown -R 1001:0 /app

USER 1001

EXPOSE 3000

CMD ["node", "dist/server.js"]
