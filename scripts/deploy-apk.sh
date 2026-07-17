#!/usr/bin/env bash
# LE Pro Android APK OTA deploy.
# Derives versionCode/versionName from the APK when possible (never hand-rot).
# Adds sha256 + size to latest.json (v2 schema, same family as School Sign-In).
# Usage: bash scripts/deploy-apk.sh /path/to/LE-Pro.apk [versionCode] [versionName]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK_SRC="${1:?APK path required}"
APK_DIR="$ROOT/app/pro/apk"
mkdir -p "$APK_DIR"

AAPT2="${AAPT2:-}"
if [ -z "$AAPT2" ]; then
  for c in \
    "$HOME/Library/Android/sdk/build-tools/34.0.0/aapt2" \
    "$HOME/Library/Android/sdk/build-tools/35.0.0/aapt2" \
    "$(ls -1 "$HOME"/Library/Android/sdk/build-tools/*/aapt2 2>/dev/null | tail -1)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then AAPT2="$c"; break; fi
  done
fi

DERIVED_CODE=""
DERIVED_NAME=""
if [ -n "${AAPT2:-}" ] && [ -x "$AAPT2" ]; then
  BADGING=$("$AAPT2" dump badging "$APK_SRC" 2>/dev/null | head -1 || true)
  DERIVED_CODE=$(echo "$BADGING" | sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p")
  DERIVED_NAME=$(echo "$BADGING" | sed -n "s/.*versionName='\([^']*\)'.*/\1/p")
fi

VCODE="${2:-${DERIVED_CODE:-3}}"
VNAME="${3:-${DERIVED_NAME:-2}}"
if [ -z "$VCODE" ] || [ "$VCODE" = "0" ]; then
  echo "error: could not determine versionCode (pass as \$2 or install aapt2)" >&2
  exit 1
fi

cp -f "$APK_SRC" "$APK_DIR/LE-Pro.apk"
SHA256=$(shasum -a 256 "$APK_DIR/LE-Pro.apk" | cut -d' ' -f1)
SIZE=$(wc -c < "$APK_DIR/LE-Pro.apk" | tr -d ' ')

cat > "$APK_DIR/latest.json" <<EOF
{
  "versionCode": $VCODE,
  "versionName": "$VNAME",
  "apkUrl": "https://www.leelectrical.us/app/pro/apk/LE-Pro.apk",
  "sha256": "$SHA256",
  "size": $SIZE,
  "releaseNotes": "LE Pro Android update v$VNAME"
}
EOF
echo "→ APK staged (code $VCODE / v$VNAME)"
echo "→ sha256=$SHA256 size=$SIZE"
cat "$APK_DIR/latest.json"
cd "$ROOT"
git add app/pro/apk/
git commit -m "LE Pro APK OTA v$VNAME (code $VCODE)" || true
# Deploy is opt-in via env so concurrent LE Pro sessions are not stomped by accident.
if [ "${DEPLOY_NOW:-0}" = "1" ]; then
  nohup wrangler pages deploy . --project-name=leelectrical-cf --branch=cf-native --commit-dirty=true > /tmp/cf-apk-deploy.log 2>&1 &
  echo "→ Cloudflare deploy started (log: /tmp/cf-apk-deploy.log)"
else
  echo "→ Staged only. Set DEPLOY_NOW=1 to pages-deploy (or publish apk/ via your usual path)."
fi
