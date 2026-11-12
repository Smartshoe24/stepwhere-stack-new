FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS pruner

WORKDIR /app

RUN npm install -g turbo@2.9.14

COPY . .

RUN turbo prune --scope=@stepwhere/server --docker

FROM base AS prod-deps

WORKDIR /app

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

RUN --mount=type=cache,id=pnpm-prod-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod

FROM base AS builder

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libgif-dev \
    libjpeg-dev \
    libpango1.0-dev \
    librsvg2-2 \
    librsvg2-dev \
    pkg-config \
    python3 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

RUN --mount=type=cache,id=pnpm-build-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./

RUN pnpm --filter @stepwhere/server build

FROM base AS runner

WORKDIR /app/apps/server

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
    libcairo2 \
    libgif7 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*

RUN curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
  && apt-get update -y \
  && apt-get install -y --no-install-recommends infisical \
  && rm -rf /var/lib/apt/lists/*

# Amazon RDS CA bundle (all regions). Production DATABASE_URL uses
# sslmode=verify-full; postgres.js then verifies the server certificate and
# hostname with Node's TLS defaults, and NODE_EXTRA_CA_CERTS adds the RDS CAs
# to Node's trust store.
ARG RDS_CA_BUNDLE_URL=https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
RUN mkdir -p /etc/ssl/rds \
  && curl -fsSL --retry 3 -o /etc/ssl/rds/global-bundle.pem "$RDS_CA_BUNDLE_URL" \
  && grep -q "BEGIN CERTIFICATE" /etc/ssl/rds/global-bundle.pem \
  && chmod 0644 /etc/ssl/rds/global-bundle.pem

ENV NODE_ENV=production
ENV PORT=8223
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/rds/global-bundle.pem

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs stepwhere

COPY --from=prod-deps --chown=stepwhere:nodejs /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=stepwhere:nodejs /app/apps/server/node_modules /app/apps/server/node_modules
COPY --from=prod-deps --chown=stepwhere:nodejs /app/apps/server/package.json /app/apps/server/package.json
COPY --from=prod-deps --chown=stepwhere:nodejs /app/packages/types/package.json /app/packages/types/package.json
COPY --from=builder --chown=stepwhere:nodejs /app/packages/types/dist /app/packages/types/dist
COPY --from=builder --chown=stepwhere:nodejs /app/apps/server/dist /app/apps/server/dist
# SQL migrations for `node dist/scripts/migrate.js` (resolved as ../../drizzle).
COPY --from=builder /app/apps/server/drizzle /app/apps/server/drizzle

USER stepwhere

EXPOSE 8223

CMD ["sh", "-c", "infisical run --env=\"$INFISICAL_ENV\" --projectId=\"$INFISICAL_PROJECT_ID\" --path=\"${INFISICAL_PATH:-/}\" -- node dist/index.js"]
