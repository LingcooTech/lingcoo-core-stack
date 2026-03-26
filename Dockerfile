FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle

RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/tsconfig.json ./
COPY --from=base /app/drizzle.config.ts ./
COPY --from=base /app/drizzle ./drizzle
COPY --from=base /app/dist ./dist

EXPOSE 3000

CMD ["npm", "run", "start"]
