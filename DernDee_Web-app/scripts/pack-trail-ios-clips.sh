#!/bin/sh
# Build side-by-side iOS clips: left = color, right = grayscale alpha.
# Used on iPad/Bluefy so the GPU can unpack true transparency.
#
# Mask uses the same screen test as chroma.ts
#   r > 158 && g < 50 && (r-g) > 115 && (b-g) > 28
# Euclidean colorkey similarity ~0.32 also keyed peach skin and bird bodies.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$ROOT/scripts/pack-trail-ios-clips.py" "$@"
