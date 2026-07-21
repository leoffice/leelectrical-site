#!/usr/bin/env bash
# deploy-demo.sh — redeploy the white-label DEMO tenant so it MIRRORS production.
#
# The demo is production source + the demo layer, nothing forked:
#   demo build === the current production commit  +  the `demo-layer-v1` tag
#                 (VITE_DEMO=1 synthetic-data fetch interceptor)  →  deployed
#                 static-only to the `demo` branch of the leelectrical-cf Pages
#                 project (a SEPARATE project on synthetic data — it never
#                 touches production or real customer records).
#
# RUN THIS IMMEDIATELY AFTER EVERY PRODUCTION (cf-native) DEPLOY, from the same
# commit, so demo.leelectrical-cf.pages.dev is always on the same version as
# leelectrical.us/app/pro. See memory: cf-pages-deploy.md / demo-tenant.md.
#
# Usage:  scripts/deploy-demo.sh [PROD_COMMIT]     (default: cf-native)
#
# NOTE: the demo layer only edits 4 files (main.jsx, lock.js, LockGate.jsx,
# Projects.jsx), all behind a compile-time DEMO flag (inert in production). When
# the production hold lifts, merging `demo-layer-v1` into cf-native makes this a
# PURE flag build (no cherry-pick, no possible conflict) — do that and simplify.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_COMMIT="${1:-cf-native}"
DEMO_LAYER="demo-layer-v1"          # stable tag = the demo interceptor commit
ACCOUNT_ID="10814e112c804139472eef626faf73e5"
PROJECT="leelectrical-cf"
BRANCH="demo"                       # → stable alias https://demo.leelectrical-cf.pages.dev
WT="$(mktemp -d /tmp/demo-sync.XXXXXX)"

cleanup() { cd "$REPO"; git worktree remove --force "$WT" 2>/dev/null || true; }
trap cleanup EXIT

cd "$REPO"
echo "▸ prod commit: $(git rev-parse --short "$PROD_COMMIT")  demo layer: $DEMO_LAYER"

# 1) Isolated worktree off the exact production commit, with the demo layer on top.
git worktree add --detach "$WT" "$PROD_COMMIT"
ln -sfn "$REPO/pro-src/node_modules" "$WT/pro-src/node_modules"
ln -sfn "$REPO/node_modules"         "$WT/node_modules"
cd "$WT"
if ! git cherry-pick --no-commit "$DEMO_LAYER"; then
  echo "✗ demo layer did not apply cleanly onto $PROD_COMMIT."
  echo "  A production change touched one of the 4 DEMO-guarded files."
  echo "  Resolve the conflict, re-tag: git tag -f $DEMO_LAYER <resolved-commit>, and re-run."
  exit 1
fi

# 2) Build with the demo flag.
( cd pro-src && VITE_DEMO=1 VITE_TENANT=demo npm run build )

# 3) Sanity: the built bundle must contain the demo layer, not be an HTML shell.
BUNDLE="$(grep -oE 'assets/index-[^"]+\.js' app/pro/index.html | head -1)"
grep -q "aceplumbing.example" "app/pro/$BUNDLE" \
  || { echo "✗ demo layer missing from built bundle — aborting"; exit 1; }
SW_VER="$(grep -oE 'le-pro-v[0-9]+' app/pro/sw.js | head -1)"
echo "▸ built $BUNDLE  ($SW_VER)"

# 4) Stage STATIC-ONLY: just app/pro, minus the internal dev-progress log, plus a
#    root redirect. No functions/, no KV/R2 bindings → no server path to data.
STAGE="$(mktemp -d /tmp/demo-stage.XXXXXX)"
mkdir -p "$STAGE/app/pro"
cp -R app/pro/. "$STAGE/app/pro/"
rm -f "$STAGE/app/pro/dev_progress_data.json"
printf '/    /app/pro/    302\n' > "$STAGE/_redirects"

# 5) Deploy to the demo branch (stable alias).
CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler pages deploy "$STAGE" \
  --project-name "$PROJECT" --branch "$BRANCH" --commit-dirty=true

rm -rf "$STAGE"
echo "✓ demo redeployed on $SW_VER → https://demo.leelectrical-cf.pages.dev"
