# Bingo Simulator game server: REST API, matchmaking and WebSocket rooms.
#
# Built from the monorepo root because the server imports @bingo/shared as
# TypeScript source; the bundle step inlines it, so the runtime image needs
# neither the workspace nor the shared package.

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# argon2 is a native module. It ships prebuilds for common platforms, but the
# toolchain has to be here in case this architecture is not one of them.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Only the server's dependency tree is needed; the client is deployed
# separately as static files.
RUN pnpm install --frozen-lockfile --filter @bingo/server... --filter @bingo/shared

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server

# Produces dist/index.js, dist/db/migrate.js and dist/package.json - the last
# being a runtime manifest with the workspace dependency stripped, since the
# bundle already inlines it.
RUN pnpm --filter @bingo/server build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Never run the game server as root.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 bingo \
 && useradd --system --uid 1001 --gid bingo bingo

COPY --from=build --chown=bingo:bingo /app/packages/server/dist ./
COPY --from=build --chown=bingo:bingo /app/packages/server/drizzle ./drizzle

# Install only what the bundle actually needs. Copying node_modules from the
# build stage would drag tsup, vitest, drizzle-kit and the whole TypeScript
# toolchain into the runtime image.
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

USER bingo

# The platform injects PORT; this is only the default for a bare `docker run`.
ENV PORT=3001
EXPOSE 3001

# Colyseus answers /health through the mounted Express app.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
