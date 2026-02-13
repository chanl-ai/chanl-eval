# ---- Build stage ----
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./

# Copy all packages (needed for workspace resolution)
COPY packages/scenarios-core/package.json packages/scenarios-core/package.json
COPY packages/scorecards-core/package.json packages/scorecards-core/package.json
COPY packages/server/package.json packages/server/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/scenarios-core/ packages/scenarios-core/
COPY packages/scorecards-core/ packages/scorecards-core/
COPY packages/server/ packages/server/

# Build all packages in order
RUN pnpm --filter @chanl-ai/scenarios-core build && \
    pnpm --filter @chanl-ai/scorecards-core build && \
    pnpm --filter @chanl-ai/eval-server build

# ---- Runtime stage ----
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

# Copy built packages
COPY --from=builder /app/packages/scenarios-core/package.json packages/scenarios-core/package.json
COPY --from=builder /app/packages/scenarios-core/dist packages/scenarios-core/dist

COPY --from=builder /app/packages/scorecards-core/package.json packages/scorecards-core/package.json
COPY --from=builder /app/packages/scorecards-core/dist packages/scorecards-core/dist

COPY --from=builder /app/packages/server/package.json packages/server/package.json
COPY --from=builder /app/packages/server/dist packages/server/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

EXPOSE 18005

ENV PORT=18005
ENV NODE_ENV=production

CMD ["node", "packages/server/dist/main.js"]
