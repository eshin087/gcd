#!/usr/bin/env bash
# review.sh <in.mp4> <out.mp4> <cx> <cy> [fps=60]
# Review clip: the full frame (960x540) beside a 3x inset of the crop around (cx,cy) (pixels in the
# 1280x720 film; inset window 320x180 -> 960x540), then a 4x slow copy appended.
IN="$1"; OUT="$2"; CX="${3:-640}"; CY="${4:-360}"
X=$((CX-160)); Y=$((CY-90)); [ $X -lt 0 ] && X=0; [ $Y -lt 0 ] && Y=0
ffmpeg -y -loglevel error -i "$IN" -filter_complex \
 "[0:v]scale=960:540,split=2[a][b];[b]crop=320:180:$X:$Y,scale=960:540:flags=neighbor[c];[a][c]hstack,split=2[n][s];[s]setpts=4*PTS[slow];[n][slow]concat=n=2:v=1:a=0" \
 -c:v libx264 -pix_fmt yuv420p -crf 22 "$OUT"
