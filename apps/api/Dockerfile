# API server image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t softema-hub-api .
# The API runs through tsx, like in development (a compiled production build is not set up yet).
FROM node:24-slim

RUN npm install -g pnpm@11.25.0 && mkdir -p /app && chown node:node /app
USER node
WORKDIR /app

# Manifests first, so dependencies are cached until they change. Prisma generates its client on install.
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node apps/api/package.json apps/api/
# pnpm needs the manifest of every workspace project, even the ones it does not install.
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node packages/shared/package.json packages/shared/
COPY --chown=node:node packages/db/package.json packages/db/prisma.config.ts packages/db/
COPY --chown=node:node packages/db/prisma packages/db/prisma
RUN pnpm install --frozen-lockfile --filter "@softema/api..."

COPY --chown=node:node packages packages
COPY --chown=node:node apps/api apps/api

ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4100
EXPOSE 4100
WORKDIR /app/apps/api
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4100/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["pnpm", "exec", "tsx", "src/main.ts"]
