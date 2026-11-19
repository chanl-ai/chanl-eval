#!/usr/bin/env bash
# Workshop room infrastructure on Fly (org chanl-dev, region ewr).
#
#   room.sh build              build + push the seat image from a clean export of $REF (default HEAD)
#   room.sh up [N]             create or update seat machines seat-01..seat-N (default 40)
#   room.sh secrets            set the seat app's secrets (Mongo base URI, OpenAI key)
#   room.sh machine-id SEAT    print the machine id for seat-NN
#   room.sh restart SEAT       restart one seat machine
#   room.sh deploy-dashboard   build + deploy packages/dashboard as chanl-eval-lab
#
# Images are built from `git archive $REF` rather than the working tree: several people edit this
# tree at once, and a build must not pick up someone's half-finished change. deploy/room itself is
# overlaid from the working tree so infra changes can be tried before they are committed.
#
# Credentials live in ~/.chanl-eval-room.env (ROOM_MONGO_USER, ROOM_MONGO_PASSWORD, SESSION_SECRET),
# outside the repo, which is public.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ORG=chanl-dev
REGION=ewr
SEAT_APP=chanl-eval-room
DB_APP=chanl-eval-room-db
LAB_APP=chanl-eval-lab
SECRETS_FILE="${ROOM_SECRETS_FILE:-$HOME/.chanl-eval-room.env}"
REF="${REF:-HEAD}"
SEAT_VM_SIZE="${SEAT_VM_SIZE:-shared-cpu-1x}"
SEAT_VM_MEMORY="${SEAT_VM_MEMORY:-1024}"
IMAGE_FILE="$ROOT/deploy/room/.seat-image"

load_secrets() {
  [ -f "$SECRETS_FILE" ] || { echo "missing $SECRETS_FILE" >&2; exit 1; }
  set -a; . "$SECRETS_FILE"; set +a
}

export_context() {
  local ctx; ctx="$(mktemp -d)"
  git -C "$ROOT" archive "$REF" | tar -x -C "$ctx"
  mkdir -p "$ctx/deploy/room"
  cp -R "$ROOT/deploy/room/." "$ctx/deploy/room/"
  echo "$ctx"
}

seat_name() { printf 'seat-%02d' "$((10#$1))"; }

machine_id() {
  fly machines list -a "$SEAT_APP" --json | node -e '
    const name = process.argv[1]; let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      const m = JSON.parse(s).find(m => m.name === name);
      if (m) console.log(m.id);
    });' "$(seat_name "$1")"
}

cmd_build() {
  local ctx label
  ctx="$(export_context)"
  label="seat-$(git -C "$ROOT" rev-parse --short "$REF")-$(date +%H%M%S)"
  (cd "$ctx" && fly deploy . -a "$SEAT_APP" -c deploy/room/seat.fly.toml \
      --dockerfile deploy/room/seat.Dockerfile --build-only --push --remote-only \
      --image-label "$label")
  echo "registry.fly.io/$SEAT_APP:$label" > "$IMAGE_FILE"
  rm -rf "$ctx"
  echo "image: $(cat "$IMAGE_FILE")"
}

cmd_secrets() {
  load_secrets
  local openai
  openai="$(doppler secrets get OPENAI_API_KEY --project chanl-platform --config stg --plain)"
  fly secrets set -a "$SEAT_APP" --stage \
    "ROOM_MONGO_BASE=mongodb://$ROOM_MONGO_USER:$ROOM_MONGO_PASSWORD@$DB_APP.internal:27017" \
    "CHANL_OPENAI_API_KEY=$openai" >/dev/null
  echo "seat secrets staged (applied on next machine create/update)"
}

cmd_up() {
  local n="${1:-40}" image
  [ -f "$IMAGE_FILE" ] || cmd_build
  image="$(cat "$IMAGE_FILE")"
  local existing; existing="$(fly machines list -a "$SEAT_APP" --json)"
  for i in $(seq 1 "$n"); do
    local seat id
    seat="$(seat_name "$i")"
    id="$(echo "$existing" | node -e '
      const name = process.argv[1]; let s = "";
      process.stdin.on("data", d => s += d).on("end", () => {
        const m = JSON.parse(s).find(m => m.name === name); if (m) console.log(m.id);
      });' "$seat")"
    if [ -n "$id" ]; then
      echo "$seat: update $id"
      fly machine update "$id" -a "$SEAT_APP" --image "$image" --yes \
        --vm-size "$SEAT_VM_SIZE" --vm-memory "$SEAT_VM_MEMORY" >/dev/null &
    else
      echo "$seat: create"
      # No services, so the Fly proxy never auto-stops these; restart=always keeps them up all day.
      fly machine run "$image" -a "$SEAT_APP" --name "$seat" --region "$REGION" \
        --env "SEAT=$seat" --vm-size "$SEAT_VM_SIZE" --vm-memory "$SEAT_VM_MEMORY" \
        --restart always --metadata room_seat="$seat" >/dev/null &
    fi
    # Fly rate-limits machine API calls; a small batch at a time stays under it.
    if (( i % 8 == 0 )); then wait; fi
  done
  wait
  fly machines list -a "$SEAT_APP"
}

cmd_restart() {
  local id; id="$(machine_id "$1")"
  [ -n "$id" ] || { echo "no machine for $(seat_name "$1")" >&2; exit 1; }
  fly machine restart "$id" -a "$SEAT_APP"
}

cmd_deploy_dashboard() {
  load_secrets
  local ctx; ctx="$(export_context)"
  fly secrets set -a "$LAB_APP" --stage \
    "ROOM_MONGODB_URI=mongodb://$ROOM_MONGO_USER:$ROOM_MONGO_PASSWORD@$DB_APP.internal:27017/room?authSource=admin" \
    "SESSION_SECRET=$SESSION_SECRET" \
    "ROOM_CODE=${ROOM_CODE:-QA2026}" \
    "FACILITATOR_EMAILS=${FACILITATOR_EMAILS:-dean@chanl.ai}" >/dev/null
  (cd "$ctx" && fly deploy . -a "$LAB_APP" -c deploy/room/lab.fly.toml \
      --dockerfile packages/dashboard/Dockerfile --remote-only --ha=false --yes)
  rm -rf "$ctx"
}

case "${1:-}" in
  build) cmd_build ;;
  up) shift; cmd_up "$@" ;;
  secrets) cmd_secrets ;;
  machine-id) machine_id "$2" ;;
  restart) cmd_restart "$2" ;;
  deploy-dashboard) cmd_deploy_dashboard ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
