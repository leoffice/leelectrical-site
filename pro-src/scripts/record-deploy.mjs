#!/usr/bin/env node
/**
 * Record LIVE version BEFORE a deploy, then stamp the new version.
 *
 * Usage (from pro-src/ or repo root):
 *   node scripts/record-deploy.mjs                  # record previous=LIVE, next=HEAD
 *   node scripts/record-deploy.mjs --task "#64"     # tag with board task
 *   node scripts/record-deploy.mjs --dry-run        # print only, no write
 *   node scripts/record-deploy.mjs --new-sha <sha>  # override next SHA (after commit)
 *
 * Writes:
 *   ~/.hermes/shared/le_deploy_history.json  (host-durable history)
 *   app/pro/version.json                     (LIVE-readable stamp, when present)
 *   public/version.json                      (copied into next build)
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendDeployRecord,
  formatDeployPost,
  makePublicVersion,
  makeVersionRecord,
  parseHistoryDoc,
  serializeHistoryDoc,
  versionId,
} from "../src/lib/deployVersion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRO_SRC = resolve(__dirname, "..");
const REPO = resolve(PRO_SRC, "..");
const SHARED = join(homedir(), ".hermes/shared");
const HISTORY_PATH =
  process.env.LE_DEPLOY_HISTORY_PATH || join(SHARED, "le_deploy_history.json");
const LIVE_VERSION_URL =
  process.env.LE_LIVE_VERSION_URL || "https://leelectrical.us/app/pro/version.json";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const task = flag("--task") || "";
const newShaOverride = flag("--new-sha");
const netlifyIdOverride = flag("--netlify-id");

function sh(cmd, cwd = REPO) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    return parseHistoryDoc(JSON.parse(readFileSync(HISTORY_PATH, "utf8")));
  } catch {
    return [];
  }
}

function readLocalVersion() {
  for (const p of [
    join(REPO, "app/pro/version.json"),
    join(PRO_SRC, "public/version.json"),
  ]) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function fetchLiveVersion() {
  try {
    const res = await fetch(`${LIVE_VERSION_URL}?cb=${Date.now()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function gitHead() {
  return sh("git rev-parse HEAD") || sh("git rev-parse HEAD", PRO_SRC);
}

function gitShort(sha) {
  if (!sha) return "";
  const s = sh(`git rev-parse --short ${sha}`);
  return s || sha.slice(0, 7);
}

async function fetchNetlifyLiveDeployId() {
  const token = process.env.NETLIFY_AUTH_TOKEN || "";
  const site =
    process.env.NETLIFY_SITE_ID ||
    process.env.NETLIFY_SITE ||
    "leelectrical.us";
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(site)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.published_deploy?.id || data.deploy_id || null;
  } catch {
    return null;
  }
}

async function main() {
  const history = loadHistory();
  const liveRemote = await fetchLiveVersion();
  const liveLocal = readLocalVersion();
  const netlifyLiveId = await fetchNetlifyLiveDeployId();

  const prevSha =
    (liveRemote && (liveRemote.gitSha || liveRemote.gitShaShort)) ||
    (liveLocal && (liveLocal.gitSha || liveLocal.gitShaShort)) ||
    (history.length &&
      (history[history.length - 1].next?.gitSha ||
        history[history.length - 1].next?.gitShaShort)) ||
    sh("git rev-parse origin/main") ||
    gitHead();

  const previous = makeVersionRecord({
    gitSha: prevSha,
    gitShaShort: gitShort(prevSha),
    netlifyDeployId:
      netlifyLiveId ||
      (liveRemote && liveRemote.netlifyDeployId) ||
      (liveLocal && liveLocal.netlifyDeployId) ||
      null,
    task,
    note: "LIVE before deploy",
  });

  const nextSha = newShaOverride || gitHead();
  const next = makeVersionRecord({
    gitSha: nextSha,
    gitShaShort: gitShort(nextSha),
    netlifyDeployId: netlifyIdOverride || null,
    task,
    note: "new LIVE after deploy",
  });

  const updated = appendDeployRecord(history, previous, next, { task });
  const post = formatDeployPost({
    previous,
    next,
    mode: updated[updated.length - 1].mode,
    task,
  });
  const publicVer = makePublicVersion({
    gitSha: next.gitSha,
    gitShaShort: next.gitShaShort,
    netlifyDeployId: next.netlifyDeployId,
    task,
    ts: next.ts,
  });

  console.log(post);
  console.log(
    `rollback_target=${versionId(previous)} mode=${updated[updated.length - 1].mode}`
  );

  if (dryRun) {
    console.log("(dry-run — no files written)");
    console.log(JSON.stringify({ previous, next, publicVer }, null, 2));
    return;
  }

  mkdirSync(dirname(HISTORY_PATH), { recursive: true });
  writeFileSync(
    HISTORY_PATH,
    JSON.stringify(serializeHistoryDoc(updated, { site: "leelectrical.us" }), null, 2) +
      "\n"
  );
  console.log(`history → ${HISTORY_PATH} (${updated.length} deploys)`);

  const stamps = [
    join(REPO, "app/pro/version.json"),
    join(PRO_SRC, "public/version.json"),
  ];
  for (const p of stamps) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(publicVer, null, 2) + "\n");
    console.log(`version → ${p}`);
  }
}

main().catch((e) => {
  console.error("record-deploy FAILED:", e.message || e);
  process.exit(1);
});