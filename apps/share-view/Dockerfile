FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS pruner

WORKDIR /app
RUN npm install -g turbo@2.9.14
COPY . .
RUN turbo prune --scope=@stepwhere/share-view --docker

FROM base AS builder

WORKDIR /app

ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_APP_STORE_URL
ARG VITE_PLAY_STORE_URL
ARG APPLE_TEAM_ID
ARG ANDROID_CERT_SHA256_FINGERPRINTS

ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_APP_STORE_URL=$VITE_APP_STORE_URL
ENV VITE_PLAY_STORE_URL=$VITE_PLAY_STORE_URL
ENV APPLE_TEAM_ID=$APPLE_TEAM_ID
ENV ANDROID_CERT_SHA256_FINGERPRINTS=$ANDROID_CERT_SHA256_FINGERPRINTS

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

RUN --mount=type=cache,id=pnpm-share-view-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./
RUN pnpm --filter @stepwhere/share-view build

RUN test -s /app/apps/share-view/dist/.well-known/apple-app-site-association \
  && test -s /app/apps/share-view/dist/.well-known/assetlinks.json

FROM caddy:2.10-alpine AS runner

COPY apps/share-view/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/share-view/dist /srv/share-view

EXPOSE 80
