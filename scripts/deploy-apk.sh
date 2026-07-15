#!/usr/bin/env bash
# LE Pro Android APK OTA deploy — bump latest.json, copy APK, push to Cloudflare Pages.
# Usage: bash scripts/deploy-apk.sh /path/to/LE-Pro.apk [versionCode] [versionName]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK_SRC="${1:?APK path required}"
VCODE="${2:-3}"
VNAME="${3:-2}"
APK_DIR="$ROOT/app/pro/apk"
mkdir -p "$APK_DIR"
cp -f "$APK_SRC" "$APK_DIR/LE-Pro.apk"
cat > "$APK_DIR/latest.json" <<EOF
{
  "versionCode": $VCODE,
  "versionName": "$VNAME",
  "apkUrl": "https://www.leelectrical.us/app/pro/apk/LE-Pro.apk",
  "releaseNotes": "LE Pro Android update v$VNAME"
}
EOF
echo "→ APK staged ($VCODE / $VNAME)"
cd "$ROOT"
git add app/pro/apk/
git commit -m "LE Pro APK OTA v$VNAME (code $VCODE)" || true
nohup wrangler pages deploy . --project-name=leelectrical-cf --branch=cf-native --commit-dirty=true > /tmp/cf-apk-deploy.log 2>&1 &
echo "→ Cloudflare deploy started (log: /tmp/cf-apk-deploy.log)"