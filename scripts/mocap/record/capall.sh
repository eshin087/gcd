#!/bin/bash
# capall.sh <url> <dir> <durationSeconds> <cdpPort>: record a video to its end with cap.mjs (frames land in
# record/<dir>/ next to cap.mjs: point MOCAP_REF at the folder above it, or move them), restarting after
# every ad stall from the last saved frame. Start the browser first, e.g.
#   msedge.exe --headless=new --enable-gpu --remote-debugging-port=9411 --user-data-dir=<scratch>/prof \
#     --no-first-run --autoplay-policy=no-user-gesture-required --mute-audio --window-size=1400,860 about:blank
# When the film is complete the BROWSER IS CLOSED: YouTube autoplays the next video, and a recorder still
# attached once wrote ~18 000 frames of it under the film's own times (scripts/mocap/duelist/README.md).
cd "$(dirname "$0")" || exit 1
URL=$1; DIR=$2; DUR=$3; export CDP_PORT=$4
close() { node -e "(async()=>{const v=await (await fetch('http://127.0.0.1:$CDP_PORT/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>{ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)}})()" 2>/dev/null; }
for try in $(seq 1 60); do
  LAST=$(ls "$DIR" 2>/dev/null | tail -n 1 | sed 's/^t0*//; s/\.jpg$//'); LAST=${LAST:-0}
  if [ "$(node -e "console.log($LAST > $DUR - 1.5 ? 1 : 0)")" = 1 ]; then echo "COMPLETE at $LAST"; touch "$DIR.COMPLETE"; close; exit 0; fi
  echo "try $try from $LAST"
  node cap.mjs "$URL" "$DIR" "$LAST" "$DUR" 1280 1 2>&1 | tail -n 3 | cut -c1-300
  node -e "setTimeout(()=>{},5000)"
done
echo "GAVE UP at $LAST"; close
