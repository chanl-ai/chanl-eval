# ---- Build stage ----
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./

# Copy all package.json files needed for workspace resolution
COPY packages/scenarios-core/package.json packages/scenarios-core/package.json
COPY packages/scorecards-core/package.json packages/scorecards-core/package.json
COPY packages/server/package.json packages/server/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code for packages the server depends on
COPY packages/scorecards-core/ packages/scorecards-core/
COPY packages/scenarios-core/ packages/scenarios-core/
COPY packages/server/ packages/server/

# Build all packages in dependency order
RUN pnpm --filter @chanl/scorecards-core build && \
    pnpm --filter @chanl/scenarios-core build && \
    pnpm --filter @chanl/eval-server build

# ---- Runtime stage ----
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

# Copy built packages
COPY --from=builder /app/packages/scorecards-core/package.json packages/scorecards-core/package.json
COPY --from=builder /app/packages/scorecards-core/dist packages/scorecards-core/dist

COPY --from=builder /app/packages/scenarios-core/package.json packages/scenarios-core/package.json
COPY --from=builder /app/packages/scenarios-core/dist packages/scenarios-core/dist

COPY --from=builder /app/packages/server/package.json packages/server/package.json
COPY --from=builder /app/packages/server/dist packages/server/dist

# Install production dependencies only
# --ignore-scripts skips the root `prepare: husky` hook, which is dev-only
# and isn't installed in a --prod tree.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts || pnpm install --prod --ignore-scripts

EXPOSE 18005

ENV PORT=18005
ENV NODE_ENV=production

CMD ["node", "packages/server/dist/main.js"]
