# syntax=docker/dockerfile:1.7

# --- build stage ---------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# better-sqlite3 compiles a native module; alpine needs the toolchain
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY scripts ./scripts
RUN npm run build

# Trim devDependencies for the runtime image
RUN npm prune --omit=dev

# --- runtime stage -------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

# Railway mounts the persistent volume at /data. Fallback if no volume:
# ledger.db ends up in /app (ephemeral on redeploy).
ENV NODE_ENV=production
ENV DB_PATH=/data/ledger.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Create /data so SQLite can write even before a volume attaches at runtime.
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "dist/server.js"]
