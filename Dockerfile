ARG NODE_BASE_IMAGE=registry.access.redhat.com/ubi9/nodejs-22

FROM ${NODE_BASE_IMAGE} AS deps

USER 0

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json ./
COPY drizzle.config.ts ./
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
LABEL org.opencontainers.image.source="https://github.com/FutureDecade/fd-core-stack"
LABEL org.opencontainers.image.version="${APP_VERSION}"

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist ./dist

RUN chown -R 1001:0 /app

USER 1001

EXPOSE 3000

CMD ["node", "dist/server.js"]
