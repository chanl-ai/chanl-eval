# ---- Build stage ----
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./

# Copy all package.json files for pnpm workspace resolution
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/dashboard/package.json packages/dashboard/package.json
COPY packages/scenarios-core/package.json packages/scenarios-core/package.json
COPY packages/scorecards-core/package.json packages/scorecards-core/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/chanl-eval/package.json packages/chanl-eval/package.json

# Install all dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy SDK source and build it (dashboard depends on @chanl/eval-sdk)
COPY packages/sdk/ packages/sdk/
RUN pnpm --filter @chanl/eval-sdk build

# Copy dashboard source
COPY packages/dashboard/ packages/dashboard/

# Build-time env var — the dashboard config uses this as the default server URL;
# users access the server at localhost:18005 from their browser
ENV NEXT_PUBLIC_CHANL_EVAL_SERVER=http://localhost:18005/api/v1

# Build the Next.js app (output: 'standalone' in next.config.ts)
RUN pnpm --filter @chanl/eval-dashboard build

# ---- Runtime stage ----
FROM node:20-alpine

WORKDIR /app

# Next.js standalone output in a monorepo places server.js at the package's
# relative path inside .next/standalone/
COPY --from=builder /app/packages/dashboard/.next/standalone ./
COPY --from=builder /app/packages/dashboard/.next/static packages/dashboard/.next/static
COPY --from=builder /app/packages/dashboard/public packages/dashboard/public

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "packages/dashboard/server.js"]
