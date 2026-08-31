#!/bin/sh
# Build side-by-side iOS clips: left = color, right = grayscale alpha.
# Used on iPad/Bluefy so the GPU can unpack true transparency.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILTER='[0:v]scale=944:944:flags=lanczos,format=rgb24,colorkey=0xF40FC8:0.32:0.12,colorkey=0xEC097E:0.32:0.12,colorkey=0xED118A:0.32:0.12,format=rgba,split[keyed][foralpha];[keyed]format=yuv420p[left];[foralpha]alphaextract,format=yuv420p[right];[left][right]hstack=inputs=2'

pack_one() {
  src="$1"
  dest="${src%.mp4}.ios.mp4"
  echo "pack $dest"
  ffmpeg -y -i "$src" -filter_complex "$FILTER" -an -c:v libx264 -preset fast -crf 20 -movflags +faststart -pix_fmt yuv420p "$dest"
}

if [ "$#" -gt 0 ]; then
  for src in "$@"; do
    pack_one "$src"
  done
  exit 0
fi

find "$ROOT/public/game" -name '*.mp4' ! -name '*.ios.mp4' -print | while IFS= read -r src; do
  pack_one "$src"
done
