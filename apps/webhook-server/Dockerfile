# syntax=docker/dockerfile:1.7
# Build context: repo root. Referenced by railway.toml via dockerfilePath.

# --- prune stage ---------------------------------------------------------
# turbo prune generates a minimal monorepo subset including both the
# webhook-server and the dashboard. The dashboard's Next.js static export
# gets baked into the runtime image and served by Express at /.
FROM node:20-alpine AS prune
WORKDIR /repo
RUN npm install -g turbo@^2.5.0
COPY . .
RUN turbo prune webhook-server dashboard --docker

# --- build stage ---------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /repo

# better-sqlite3 compiles a native module; alpine needs the toolchain
RUN apk add --no-cache python3 make g++

# Install deps from the pruned lockfile (fast, deterministic).
COPY --from=prune /repo/out/json/ .
RUN npm ci

# Copy sources and build both apps: bot (dist/) + dashboard (out/).
COPY --from=prune /repo/out/full/ .
RUN npx turbo run build --filter=webhook-server --filter=dashboard

# Trim devDependencies for the runtime image.
RUN npm prune --omit=dev

# --- runtime stage -------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Railway mounts the persistent volume at /data. Fallback: /app (ephemeral).
ENV DB_PATH=/data/ledger.db

# Bot runtime.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/webhook-server/dist ./dist
COPY --from=build /repo/apps/webhook-server/package.json ./package.json

# Bundled dashboard — Next.js static export served from /public/dashboard.
COPY --from=build /repo/apps/dashboard/out ./public/dashboard

# Pine reference source — dashboard fetches via /pine-source, injects
# WEBHOOK_SECRET client-side, triggers a Blob download.
COPY --from=build /repo/tradingview-strategy.pine ./tradingview-strategy.pine

# Create /data so SQLite can write even before a volume attaches at runtime.
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "dist/server.js"]
