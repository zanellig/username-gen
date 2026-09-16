#!/bin/sh
# PROTOTYPE — rasterize every variant at the three manifest sizes.
# Run: sh icons-prototype/render.sh   (from username-gen/)
set -eu
cd "$(dirname "$0")"
mkdir -p png
for f in svg/*.svg; do
  v=$(basename "$f" .svg)
  for s in 16 48 128; do
    rsvg-convert -w "$s" -h "$s" "$f" -o "png/$v-$s.png"
  done
done
ls -1 png | wc -l
