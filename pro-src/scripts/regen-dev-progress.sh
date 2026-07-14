#!/usr/bin/env bash
# Nightly build-progress refresh — run from host cron (~midnight).
#   0 4 * * * /bin/bash ~/Downloads/leelectrical-repo/pro-src/scripts/regen-dev-progress.sh >> ~/.hermes/devprogress.log 2>&1
set -euo pipefail
REPO="${LE_REPO:-$HOME/Downloads/leelectrical-repo}"
OUT="${LE_DEV_PROGRESS_OUT:-$HOME/.hermes/dev_progress_data.json}"
GEN="${LE_DEV_PROGRESS_GEN:-$HOME/.hermes/gen_dev_progress.py}"
cd "$REPO"
git fetch --quiet origin 2>/dev/null || true
python3 "$GEN" "$REPO" "$OUT"
if command -v curl >/dev/null 2>&1; then
  PAYLOAD=$(python3 -c "import json; print(json.dumps({'op':'replace','data':json.load(open('$OUT'))}))")
  curl -sS -X POST "https://leelectrical.us/.netlify/functions/progress" \
    -H "content-type: application/json" \
    -d "$PAYLOAD" >/dev/null 2>&1 || true
fi
echo "$(date -u '+%Y-%m-%d %H:%M:%SZ') regenerated $OUT"