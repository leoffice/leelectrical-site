#!/usr/bin/env bash
# deploy-prod.sh — the ONLY sanctioned way to deploy leelectrical-cf to prod.
#
# HARD GUARD: refuses to deploy anything that has DIVERGED from origin/cf-native
# (the canonical prod line). A stale, long-diverged branch (the signup line
# `feat/white-label-rls-isolation`) was deployed straight to prod on 2026-07-23
# as le-pro-v223 and wiped perf + Permits + WP0 off production. This guard makes
# that class of mistake impossible: you can only ship the cf-native line.
#
#   Allowed:  HEAD == origin/cf-native, or HEAD is IN cf-native's history,
#             or HEAD is AHEAD of cf-native (normal deploy-owner flow — push after).
#   Refused:  HEAD and origin/cf-native have diverged (neither is an ancestor).
#
# Usage:
#   scripts/deploy-prod.sh              # normal guarded deploy of the current line
#   scripts/deploy-prod.sh --hotfix     # bypass the divergence guard (BIG warning; you own it)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACCOUNT_ID="10814e112c804139472eef626faf73e5"
PROJECT="leelectrical-cf"
BRANCH="cf-native"
HOTFIX=0
[ "${1:-}" = "--hotfix" ] && HOTFIX=1

cd "$REPO"
git fetch origin "$BRANCH" >/dev/null 2>&1 || { echo "✗ cannot fetch origin/$BRANCH — aborting"; exit 1; }
HEAD_SHA="$(git rev-parse HEAD)"
CFN_SHA="$(git rev-parse "origin/$BRANCH")"

# --- THE GUARD: HEAD must be on the cf-native line (contained-in or ahead-of) ---
on_line=0
if git merge-base --is-ancestor "$HEAD_SHA" "$CFN_SHA"; then on_line=1; fi   # HEAD equal/older than cf-native
if git merge-base --is-ancestor "$CFN_SHA" "$HEAD_SHA"; then on_line=1; fi   # HEAD ahead of cf-native

if [ "$on_line" -ne 1 ]; then
  echo "✗ REFUSING TO DEPLOY — DIVERGENT BRANCH."
  echo "    HEAD           = $(git rev-parse --short "$HEAD_SHA") ($(git rev-parse --abbrev-ref HEAD))"
  echo "    origin/$BRANCH = $(git rev-parse --short "$CFN_SHA")"
  echo "    Neither is an ancestor of the other → this is NOT the prod line."
  echo "    (This is exactly the le-pro-v223 incident that wiped perf/Permits/WP0.)"
  echo "    → Integrate your work onto cf-native first (merge/rebase), then deploy."
  if [ "$HOTFIX" -ne 1 ]; then exit 2; fi
  echo "  ⚠️⚠️  --hotfix given — deploying a DIVERGENT tree anyway. On your head be it. ⚠️⚠️"
fi

# If HEAD is ahead of cf-native, remind to push so the ref matches what ships.
if [ "$on_line" -eq 1 ] && [ "$HEAD_SHA" != "$CFN_SHA" ] && ! git merge-base --is-ancestor "$HEAD_SHA" "$CFN_SHA"; then
  echo "ℹ️  HEAD is ahead of origin/$BRANCH — after this deploy, land the ref:"
  echo "     git push origin HEAD:$BRANCH"
fi

echo "▸ deploying $(git rev-parse --short HEAD) to prod ($BRANCH) — on the cf-native line ✓"

# --- Build the PWA ---
( cd pro-src && npm run build )

# --- Stage (root-anchored excludes; deref node_modules; pull gitignored fn wrappers) ---
STAGE="$(mktemp -d /tmp/prod-stage.XXXXXX)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT
rsync -a --exclude '/.git/' --exclude '/.wrangler/' --exclude '/.netlify/' \
         --exclude '/pro-src/' --exclude '*.zip' --exclude '.DS_Store' \
         --exclude '/node_modules/' "$REPO/" "$STAGE/"
rsync -aL "$REPO/functions/.netlify/" "$STAGE/functions/.netlify/"
rsync -aL "$REPO/node_modules/"       "$STAGE/node_modules/"

# --- Deploy (run from the stage cwd so Pages Functions compile from it) ---
BUNDLE="$(grep -oE 'assets/index-[^"]+\.js' "$STAGE/app/pro/index.html" | head -1)"
SWVER="$(grep -m1 -oE 'le-pro-v[0-9]+' "$STAGE/app/pro/sw.js")"
echo "▸ bundle $BUNDLE  ($SWVER)"
( cd "$STAGE" && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler pages deploy "$STAGE" \
    --project-name "$PROJECT" --branch "$BRANCH" --commit-dirty=true )

echo "✓ deployed. VERIFY: curl https://leelectrical.us/.netlify/functions/state (must be JSON, not HTML)."
echo "  THEN mirror the demo:  scripts/deploy-demo.sh $(git rev-parse --short HEAD)"
