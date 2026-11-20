#!/bin/sh
# Starts the seat's private Redis, then the server in the foreground.
# SEAT (per machine, e.g. seat-07) picks the Mongo database; ROOM_MONGO_BASE (app secret) holds
# the credentials and host, so no password sits in machine config.
set -eu

: "${SEAT:?SEAT must be set on the machine, e.g. seat-01}"
: "${ROOM_MONGO_BASE:?ROOM_MONGO_BASE secret must be set}"

# No persistence: a seat's queue only holds runs in flight, and Mongo keeps every result.
redis-server --bind 127.0.0.1 --port 6379 --save '' --appendonly no --daemonize yes

export REDIS_URL="redis://127.0.0.1:6379"
export MONGODB_URI="${ROOM_MONGO_BASE%/}/${SEAT}?authSource=admin"
# Seats hold only the workshop starter kit; the demo set would reappear on every restart.
export CHANL_EVAL_SEED_DEFAULTS=false
# The agents run on gpt-4o-mini, which inverts yes/no answers to "Does the agent avoid ...?" judge
# questions; gpt-4o judged 40 stored runs with no errors.
export CHANL_JUDGE_MODEL=gpt-4o

exec node packages/server/dist/main.js
