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

# --- GUARD 2: no unresolved merge-conflict markers in source ---
# (le-pro-v224 shipped a broken sw.js with committed `<<<<<<<` markers because a
#  merge resolution missed it and the SW bump only replaced the first CACHE line.)
if git grep -lE '^(<<<<<<<|=======|>>>>>>>)' -- 'pro-src/src' 'pro-src/public' 'netlify' 'functions' 'shared' 2>/dev/null | grep -q .; then
  echo "✗ REFUSING TO DEPLOY: unresolved conflict markers in source:"
  git grep -lE '^(<<<<<<<|=======|>>>>>>>)' -- 'pro-src/src' 'pro-src/public' 'netlify' 'functions' 'shared' 2>/dev/null | sed 's/^/    /'
  exit 3
fi

# --- Build the PWA ---
# Bake the outbound-email app key (matches the CUSTOMER_EMAIL_KEY Pages secret)
# so tokenless clients can still authenticate to customer-email/send-doc-email.
# HARD GUARD (2026-08-13, Invoice #LE-2716 incident): a v446 build from a
# worktree WITHOUT the gitignored .le-send-key shipped a key-less bundle — every
# app send 401'd and customers got the minimal Gmail-fallback email instead of
# the branded invoice layout. A key-less prod build must never ship again.
# Lookup order: repo checkout → ~/.le-send-key (machine-canonical copy, so
# fresh worktrees/clones still bake it).
if [ -f "$REPO/.le-send-key" ]; then
  export VITE_CUSTOMER_EMAIL_KEY="$(tr -d '[:space:]' < "$REPO/.le-send-key")"
  echo "▸ email send key baked into build (from $REPO/.le-send-key)"
elif [ -f "$HOME/.le-send-key" ]; then
  export VITE_CUSTOMER_EMAIL_KEY="$(tr -d '[:space:]' < "$HOME/.le-send-key")"
  echo "▸ email send key baked into build (from ~/.le-send-key fallback)"
else
  echo "✗ REFUSING TO DEPLOY: no .le-send-key in $REPO or \$HOME."
  echo "    A key-less bundle makes every app email send 401 → customers get the"
  echo "    off-brand Gmail-fallback layout (the Invoice #LE-2716 incident)."
  echo "    → copy .le-send-key into this checkout (or ~/.le-send-key), then rerun."
  exit 6
fi
if [ -z "$VITE_CUSTOMER_EMAIL_KEY" ]; then
  echo "✗ REFUSING TO DEPLOY: .le-send-key exists but is EMPTY."
  exit 6
fi
( cd pro-src && npm run build )

# --- GUARD 3b: the baked key must actually be in the built assets ---
if ! grep -rqF "$VITE_CUSTOMER_EMAIL_KEY" app/pro/assets/; then
  echo "✗ REFUSING TO DEPLOY: built app/pro/assets/ does not contain the baked email key."
  echo "    (vite env plumbing broke — a deploy now would repeat the LE-2716 layout regression)"
  exit 7
fi
echo "▸ baked email key verified present in built assets ✓"

# --- GUARD 3: the built service worker must be valid JS (a broken SW breaks PWA updates) ---
if ! node --check app/pro/sw.js 2>/dev/null; then
  echo "✗ REFUSING TO DEPLOY: built app/pro/sw.js is not valid JS (conflict markers / syntax error)."
  exit 4
fi
if [ "$(grep -c 'const CACHE' app/pro/sw.js)" -ne 1 ]; then
  echo "✗ REFUSING TO DEPLOY: app/pro/sw.js has $(grep -c 'const CACHE' app/pro/sw.js) CACHE lines (expected exactly 1)."
  exit 4
fi

# --- Stage (root-anchored excludes; deref node_modules; pull gitignored fn wrappers) ---
STAGE="$(mktemp -d /tmp/prod-stage.XXXXXX)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT
rsync -a --exclude '/.git/' --exclude '/.wrangler/' --exclude '/.netlify/' \
         --exclude '/pro-src/' --exclude '*.zip' --exclude '.DS_Store' \
         --exclude '/node_modules/' --exclude '/.claude/' --exclude '/.grok/' \
         --exclude '/handoff/' --exclude 'node_modules' \
         "$REPO/" "$STAGE/"
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
