FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS pruner

WORKDIR /app

RUN npm install -g turbo@2.9.14

COPY . .

RUN turbo prune --scope=shadcn-admin --docker

FROM base AS builder

WORKDIR /app

ARG VITE_STEPWHERE_API_URL
ARG VITE_STEPWHERE_AUTH_URL
ARG VITE_GOOGLE_MAPS_API_KEY

ENV VITE_STEPWHERE_API_URL=$VITE_STEPWHERE_API_URL
ENV VITE_STEPWHERE_AUTH_URL=$VITE_STEPWHERE_AUTH_URL
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

RUN --mount=type=cache,id=pnpm-admin-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./

RUN pnpm --filter shadcn-admin build

FROM caddy:2.10-alpine AS runner

COPY apps/admin/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/admin/dist /srv/admin

EXPOSE 80
