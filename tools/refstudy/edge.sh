#!/usr/bin/env bash
# edge.sh <cdp-port> <profile-dir> [url]   launch a headless Edge for reference study or filming.
# Use a port nobody else uses (other sessions sit on 9408-9425; check `curl 127.0.0.1:<p>/json`),
# and a throwaway profile dir OUTSIDE the repo. Without the GPU flags YouTube never decodes video.
# After launch: node grab.mjs nav <youtube url>; node grab.mjs play; node grab.mjs hd; node grab.mjs info
EDGE="${EDGE:-/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"
PORT="${1:?cdp port}"; PROFILE="${2:?profile dir}"
exec "$EDGE" --headless=new --enable-gpu --ignore-gpu-blocklist \
  --remote-debugging-port="$PORT" --remote-debugging-address=127.0.0.1 \
  --user-data-dir="$PROFILE" --mute-audio --autoplay-policy=no-user-gesture-required \
  --window-size=1920,1080 "${3:-about:blank}"
