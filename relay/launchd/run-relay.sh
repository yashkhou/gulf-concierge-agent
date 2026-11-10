#!/bin/sh
# launchd entry point for the relay. Secrets live in ~/.config/concierge/relay.env (never in the repo):
#   RELAY_TOKEN=...            shared with the Worker (wrangler secret put RELAY_TOKEN)
#   NOTIFY_TO=...              where hand-off emails go
#   NOTIFY_ACCOUNT=...         gmail account the ~/bin/gmail CLI sends from
set -eu
ENV_FILE="${CONCIERGE_ENV:-$HOME/.config/concierge/relay.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
exec node "$HERE/../relay.mjs"
