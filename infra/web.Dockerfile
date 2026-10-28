# standfolk-web: the Node API and the built dashboard in one container (port 8080).
# Build from the repository root: docker build -f infra/web.Dockerfile -t standfolk-web .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps ./apps
RUN npm run build -w apps/api && npm run build -w apps/web

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 WEB_DIR=/app/web CATALOG_DIR=/app/data/catalog
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w apps/api && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist web
COPY data/catalog data/catalog
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
