#!/bin/sh
# PNG stills from tools/cover.mjs to the WebP files the site ships.
set -e
cd "$(dirname "$0")/.."
python3 - <<'PY'
from PIL import Image
for name in ("cover", "cover-end"):
    Image.open(f"public/{name}.png").convert("RGB").save(f"public/{name}.webp", "WEBP", quality=82, method=6)
PY
rm -f public/cover.png public/cover-end.png
ls -la public/cover.webp public/cover-end.webp
