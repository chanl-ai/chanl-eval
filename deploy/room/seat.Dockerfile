# Workshop seat: the eval server plus a Redis on localhost in the same container.
# Each seat gets its own Bull queue this way, so one attendee's runs never wait behind another's
# and the server's per-queue limits (5 concurrent, 10 per minute) apply per seat, not per room.
# Built from the repo root: docker build -f deploy/room/seat.Dockerfile .

FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/scenarios-core/package.json packages/scenarios-core/package.json
COPY packages/scorecards-core/package.json packages/scorecards-core/package.json
COPY packages/server/package.json packages/server/package.json

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/scorecards-core/ packages/scorecards-core/
COPY packages/scenarios-core/ packages/scenarios-core/
COPY packages/server/ packages/server/

RUN pnpm --filter @chanl/scorecards-core build && \
    pnpm --filter @chanl/scenarios-core build && \
    pnpm --filter @chanl/eval-server build

FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate && apk add --no-cache redis

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY --from=builder /app/packages/scorecards-core/package.json packages/scorecards-core/package.json
COPY --from=builder /app/packages/scorecards-core/dist packages/scorecards-core/dist
COPY --from=builder /app/packages/scenarios-core/package.json packages/scenarios-core/package.json
COPY --from=builder /app/packages/scenarios-core/dist packages/scenarios-core/dist
COPY --from=builder /app/packages/server/package.json packages/server/package.json
COPY --from=builder /app/packages/server/dist packages/server/dist

RUN pnpm install --prod --frozen-lockfile --ignore-scripts || pnpm install --prod --ignore-scripts

COPY deploy/room/seat-entrypoint.sh /usr/local/bin/seat-entrypoint.sh
RUN chmod +x /usr/local/bin/seat-entrypoint.sh

ENV PORT=18005
ENV NODE_ENV=production
ENV CHANL_EVAL_REQUIRE_API_KEY=true
EXPOSE 18005

CMD ["/usr/local/bin/seat-entrypoint.sh"]
