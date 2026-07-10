#!/usr/bin/env node
/**
 * Bootstrap deploy history from current LIVE (one-time / repair).
 * Usage: node scripts/init-deploy-history.mjs [--dry-run]
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  makePublicVersion,
  makeVersionRecord,
  parseHistoryDoc,
  serializeHistoryDoc,
} from "../src/lib/deployVersion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRO_SRC = resolve(__dirname, "..");
const REPO = resolve(PRO_SRC, "..");
const HISTORY_PATH =
  process.env.LE_DEPLOY_HISTORY_PATH ||
  join(homedir(), ".hermes/shared/le_deploy_history.json");
const LIVE_VERSION_URL =
  process.env.LE_LIVE_VERSION_URL || "https://leelectrical.us/app/pro/version.json";

const dryRun = process.argv.includes("--dry-run");

function sh(cmd, cwd = REPO) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
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

async function main() {
  if (existsSync(HISTORY_PATH)) {
    const existing = parseHistoryDoc(JSON.parse(readFileSync(HISTORY_PATH, "utf8")));
    if (existing.length) {
      console.log(`history already has ${existing.length} deploy(s) — skip init`);
      return;
    }
  }

  const live = await fetchLiveVersion();
  const sha =
    live?.gitSha ||
    live?.gitShaShort ||
    sh("git rev-parse origin/main") ||
    sh("git rev-parse HEAD");
  const short = sh(`git rev-parse --short ${sha}`) || sha?.slice(0, 7) || "";

  const current = makeVersionRecord({
    gitSha: sha,
    gitShaShort: short,
    netlifyDeployId: live?.netlifyDeployId || null,
    note: "bootstrap LIVE baseline",
  });

  const doc = serializeHistoryDoc(
    [
      {
        previous: current,
        next: current,
        mode: current.netlifyDeployId ? "netlify-instant" : "git-sha",
        task: "init",
        ts: new Date().toISOString(),
        note: "baseline — rollback target = current LIVE",
      },
    ],
    { site: "leelectrical.us", bootstrapped: true }
  );

  const publicVer = makePublicVersion({
    gitSha: current.gitSha,
    gitShaShort: current.gitShaShort,
    netlifyDeployId: current.netlifyDeployId,
    ts: current.ts,
  });

  console.log(`init baseline LIVE=${short}`);

  if (dryRun) {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }

  mkdirSync(dirname(HISTORY_PATH), { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(doc, null, 2) + "\n");
  for (const p of [
    join(REPO, "app/pro/version.json"),
    join(PRO_SRC, "public/version.json"),
  ]) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(publicVer, null, 2) + "\n");
  }
  console.log(`history → ${HISTORY_PATH}`);
}

main().catch((e) => {
  console.error("init-deploy-history FAILED:", e.message || e);
  process.exit(1);
});