#!/usr/bin/env node
/**
 * Post-deploy LIVE smoke check. Polls until the new build is serving or timeout.
 *
 * Usage:
 *   node scripts/verify-live.mjs                    # verify LIVE matches HEAD
 *   node scripts/verify-live.mjs --sha abc1234      # expect specific short SHA
 *   node scripts/verify-live.mjs --timeout 180      # seconds (default 180)
 *   node scripts/verify-live.mjs --dry-run          # single fetch, no poll
 */
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeGitSha } from "../src/lib/deployVersion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRO_SRC = resolve(__dirname, "..");
const REPO = resolve(PRO_SRC, "..");
const BASE = process.env.LE_LIVE_BASE || "https://leelectrical.us";
const VERSION_URL = `${BASE}/app/pro/version.json`;
const INDEX_URL = `${BASE}/app/pro/index.html`;
const JOBSDATA_URL = `${BASE}/.netlify/functions/jobsdata`;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const shaArg = flag("--sha");
const timeoutSec = Number(flag("--timeout") || "180") || 180;
const pollSec = Number(flag("--poll") || "5") || 5;

function sh(cmd, cwd = REPO) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function expectedSha() {
  if (shaArg) return normalizeGitSha(shaArg).gitShaShort;
  const head = sh("git rev-parse --short HEAD");
  return head || "";
}

async function fetchJson(url) {
  const res = await fetch(`${url}?cb=${Date.now()}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchOk(url) {
  const res = await fetch(`${url}?cb=${Date.now()}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return true;
}

function shaMatches(live, expected) {
  if (!expected) return true;
  const liveShort =
    live?.gitShaShort ||
    (live?.gitSha ? normalizeGitSha(live.gitSha).gitShaShort : "");
  return (
    liveShort === expected ||
    (live?.gitSha && live.gitSha.startsWith(expected)) ||
    (expected.length >= 7 && liveShort?.startsWith(expected.slice(0, 7)))
  );
}

async function checkOnce(expected) {
  const errors = [];
  let version = null;
  try {
    version = await fetchJson(VERSION_URL);
  } catch (e) {
    errors.push(`version.json: ${e.message || e}`);
  }

  if (version && !shaMatches(version, expected)) {
    errors.push(
      `version mismatch: LIVE=${version.gitShaShort || version.gitSha || "?"} expected=${expected}`
    );
  }

  try {
    await fetchOk(INDEX_URL);
  } catch (e) {
    errors.push(`index.html: ${e.message || e}`);
  }

  try {
    const jobs = await fetchJson(JOBSDATA_URL);
    if (!Array.isArray(jobs.jobs)) {
      errors.push("jobsdata: missing jobs array");
    }
  } catch (e) {
    errors.push(`jobsdata: ${e.message || e}`);
  }

  return { ok: errors.length === 0, errors, version };
}

async function main() {
  const expected = expectedSha();
  console.log(`verify-live expected=${expected || "(any)"} timeout=${timeoutSec}s`);

  if (dryRun) {
    const r = await checkOnce(expected);
    if (!r.ok) {
      console.error("VERIFY FAILED:", r.errors.join("; "));
      process.exit(1);
    }
    console.log(`VERIFY OK LIVE=${r.version?.gitShaShort || "—"}`);
    return;
  }

  const deadline = Date.now() + timeoutSec * 1000;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const r = await checkOnce(expected);
    if (r.ok) {
      console.log(
        `VERIFY OK attempt=${attempt} LIVE=${r.version?.gitShaShort || "—"}`
      );
      return;
    }
    console.log(`attempt ${attempt}: ${r.errors.join("; ")}`);
    await new Promise((res) => setTimeout(res, pollSec * 1000));
  }

  console.error(`VERIFY TIMEOUT after ${timeoutSec}s (${attempt} attempts)`);
  process.exit(1);
}

main().catch((e) => {
  console.error("verify-live FAILED:", e.message || e);
  process.exit(1);
});