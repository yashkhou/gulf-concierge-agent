#!/bin/sh
# Fills the two launchd templates for this machine and loads them.
#   relay/launchd/install.sh <cloudflared-tunnel-id>
# Needs: node on PATH, cloudflared with a named tunnel whose config is ~/.cloudflared/concierge-relay.yml,
# and secrets in ~/.config/concierge/relay.env (see run-relay.sh).
set -eu
TUNNEL_ID="${1:?usage: install.sh <tunnel-id>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NODE_BIN="$(dirname "$(command -v node)")"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS" "$HOME/Library/Logs/concierge"
for name in com.yashkhou.concierge-relay com.yashkhou.concierge-relay-tunnel; do
  sed -e "s|__HOME__|$HOME|g" -e "s|__REPO__|$REPO|g" -e "s|__NODE_BIN__|$NODE_BIN|g" -e "s|__TUNNEL_ID__|$TUNNEL_ID|g" \
    "$HERE/$name.plist" > "$AGENTS/$name.plist"
  launchctl bootout "gui/$(id -u)/$name" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$name.plist"
  echo "loaded $name"
done
