# syntax=docker/dockerfile:1.7
ARG PNPM_VERSION=10.33.2
FROM node:24-bookworm-slim AS build

ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ARG VITE_SWETRIX_PROJECT_ID=vN8owpoxr4NW
ARG VITE_SWETRIX_API_URL=https://swetrix.pureportal.io/backend/v1/log
ARG VITE_SWETRIX_DEV_MODE=false
ARG VITE_SWETRIX_ERROR_SAMPLE_RATE=1
ARG VITE_SWETRIX_SESSION_REPLAY_ENABLED=false
ARG VITE_SWETRIX_SESSION_REPLAY_SAMPLE_RATE=0.1
ARG VITE_SWETRIX_SESSION_REPLAY_MAX_DURATION_MS=900000
ARG VITE_SWETRIX_SESSION_REPLAY_IDLE_TIMEOUT_MS=300000
ENV VITE_SWETRIX_PROJECT_ID=$VITE_SWETRIX_PROJECT_ID
ENV VITE_SWETRIX_API_URL=$VITE_SWETRIX_API_URL
ENV VITE_SWETRIX_DEV_MODE=$VITE_SWETRIX_DEV_MODE
ENV VITE_SWETRIX_ERROR_SAMPLE_RATE=$VITE_SWETRIX_ERROR_SAMPLE_RATE
ENV VITE_SWETRIX_SESSION_REPLAY_ENABLED=$VITE_SWETRIX_SESSION_REPLAY_ENABLED
ENV VITE_SWETRIX_SESSION_REPLAY_SAMPLE_RATE=$VITE_SWETRIX_SESSION_REPLAY_SAMPLE_RATE
ENV VITE_SWETRIX_SESSION_REPLAY_MAX_DURATION_MS=$VITE_SWETRIX_SESSION_REPLAY_MAX_DURATION_MS
ENV VITE_SWETRIX_SESSION_REPLAY_IDLE_TIMEOUT_MS=$VITE_SWETRIX_SESSION_REPLAY_IDLE_TIMEOUT_MS
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/client/package.json apps/client/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY apps/client apps/client
COPY packages/contracts packages/contracts
RUN pnpm --filter @mimorii/contracts build \
    && pnpm --filter @mimorii/api build \
    && pnpm --filter @mimorii/client build \
    && pnpm --filter @mimorii/api --prod deploy /prod/mimorii

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV MIMORII_API_PORT=4310
ENV MIMORII_CLIENT_DIST=/app/client

WORKDIR /app
COPY --from=build --chown=node:node /prod/mimorii ./
COPY --from=build --chown=node:node /app/apps/client/dist ./client

EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "--eval", "fetch('http://127.0.0.1:4310/api/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"]
USER node
CMD ["node", "dist/main.js"]
