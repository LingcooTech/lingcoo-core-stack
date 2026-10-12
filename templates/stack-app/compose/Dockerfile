FROM node:22.23.2-alpine
WORKDIR /app
COPY --chown=node:node server.mjs ./server.mjs
USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
