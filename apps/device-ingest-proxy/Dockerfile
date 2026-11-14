FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS pruner

WORKDIR /app

RUN npm install -g turbo@2.9.14

COPY . .

RUN turbo prune --scope=@stepwhere/device-ingest-proxy --docker

FROM base AS builder

WORKDIR /app

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

RUN --mount=type=cache,id=pnpm-device-ingest-proxy-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./

RUN pnpm --filter @stepwhere/device-ingest-proxy build

FROM node:24-slim AS runner

WORKDIR /app/apps/device-ingest-proxy

ENV NODE_ENV=production
ENV PORT=8290

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs stepwhere

COPY --from=builder --chown=stepwhere:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=stepwhere:nodejs /app/apps/device-ingest-proxy/package.json /app/apps/device-ingest-proxy/package.json
COPY --from=builder --chown=stepwhere:nodejs /app/apps/device-ingest-proxy/dist /app/apps/device-ingest-proxy/dist
# OTA releases served under /fw. They come from the firmware S3 bucket behind
# CloudFront, published by Smartshoe24/Stepwhere-Firmware release.yml on v*
# tags; the proxy re-encodes image ranges as hex for the N706B (?enc=hex).
# Set in the image because the host compose file is managed by Ansible.
# FIRMWARE_UPSTREAM_URL="" in the compose environment falls back to the
# bundled files below.
ENV FIRMWARE_UPSTREAM_URL=https://d1e6333g4g5fxj.cloudfront.net
COPY --from=builder --chown=stepwhere:nodejs /app/apps/device-ingest-proxy/firmware /srv/firmware

USER stepwhere

EXPOSE 8290

CMD ["node", "dist/index.js"]
