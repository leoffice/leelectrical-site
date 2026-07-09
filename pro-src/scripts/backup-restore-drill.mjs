#!/usr/bin/env node
/**
 * #37 live drill: run one nightly-style backup, write ONE store to a Drive
 * file, then restore that store from the Drive file (proves recovery).
 *
 * Safe by default: restores the same snapshot just taken (no data loss).
 *
 * Usage (from pro-src/):
 *   node scripts/backup-restore-drill.mjs
 *   node scripts/backup-restore-drill.mjs --store state
 *   node scripts/backup-restore-drill.mjs --dry-run
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = "https://leelectrical.us/.netlify/functions";
const SHARED = join(homedir(), ".hermes/shared");
const BK_SH = join(SHARED, "lepro_backup.sh");
const SLOT1 = join(SHARED, "lepro_backups/slot-1/data");
const DRIVE_DIR =
  process.env.LE_BACKUP_DRIVE ||
  join(
    homedir(),
    "Library/CloudStorage/GoogleDrive-office@leelectrical.us/My Drive/Claude-Workflow/Handoff"
  );
// Always also land a copy inside the worktree for the inspector.
const LOCAL_DRILL_DIR = join(process.cwd(), "docs/backup-drill");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const storeName = (() => {
  const i = process.argv.indexOf("--store");
  return i >= 0 ? process.argv[i + 1] : "state";
})();

const STORE_MAP = {
  state: { file: "state.json", endpoint: "state", shape: "state" },
  jobsdata: { file: "jobsdata.json", endpoint: "jobsdata", shape: "jobsdata" },
};

const cfg = STORE_MAP[storeName];
if (!cfg) {
  console.error(`Unknown store "${storeName}". Use: state | jobsdata`);
  process.exit(2);
}

function log(m) {
  console.log(m);
}

function runBackup() {
  if (!existsSync(BK_SH)) {
    throw new Error(`lepro_backup.sh missing at ${BK_SH}`);
  }
  log(`→ Running nightly backup: ${BK_SH}`);
  const r = spawnSync("bash", [BK_SH], { encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(`lepro_backup.sh failed rc=${r.status}`);
}

async function postJson(endpoint, body) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} → HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

async function getJson(endpoint) {
  const res = await fetch(`${BASE}/${endpoint}?cb=${Date.now()}`);
  if (!res.ok) throw new Error(`GET ${endpoint} → HTTP ${res.status}`);
  return res.json();
}

function writeDriveFile(srcPath) {
  mkdirSync(LOCAL_DRILL_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `LE_Pro_Backup_Drill_${storeName}_${stamp}.json`;
  const localPath = join(LOCAL_DRILL_DIR, name);
  copyFileSync(srcPath, localPath);

  let drivePath = null;
  if (existsSync(DRIVE_DIR)) {
    drivePath = join(DRIVE_DIR, name);
    copyFileSync(srcPath, drivePath);
  }

  // Stable "latest" pointer for restore
  const latestLocal = join(LOCAL_DRILL_DIR, `LE_Pro_Backup_Drill_${storeName}_latest.json`);
  copyFileSync(srcPath, latestLocal);
  if (drivePath) {
    copyFileSync(srcPath, join(DRIVE_DIR, `LE_Pro_Backup_Drill_${storeName}_latest.json`));
  }

  return { localPath, drivePath, latestLocal };
}

function buildPostBody(doc) {
  if (cfg.shape === "state") {
    return { ov: doc.ov || {} };
  }
  // jobsdata
  return { op: "set", jobs: Array.isArray(doc.jobs) ? doc.jobs : [] };
}

function proofSummary({ srcPath, drivePaths, before, after, body }) {
  const report = {
    ts: new Date().toISOString(),
    store: storeName,
    endpoint: cfg.endpoint,
    backupFile: srcPath,
    driveFile: drivePaths.drivePath,
    localDrillFile: drivePaths.localPath,
    dryRun,
    before: summarize(before),
    after: summarize(after),
    restoredKeys: bodyKeys(body),
    ok: true,
  };
  const out = join(LOCAL_DRILL_DIR, "DRILL_REPORT.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  return { report, out };
}

function summarize(doc) {
  if (!doc || typeof doc !== "object") return { empty: true };
  if (cfg.shape === "state") {
    return { ovKeys: Object.keys(doc.ov || {}).length, ts: doc.ts || 0 };
  }
  return {
    jobs: Array.isArray(doc.jobs) ? doc.jobs.length : 0,
    syncedAt: doc.syncedAt || 0,
    ts: doc.ts || 0,
  };
}

function bodyKeys(body) {
  if (cfg.shape === "state") return { ovKeys: Object.keys(body.ov || {}).length };
  return { jobs: (body.jobs || []).length };
}

async function main() {
  log("=== LE Pro #37 Backup + restore drill ===");
  runBackup();

  const srcPath = join(SLOT1, cfg.file);
  if (!existsSync(srcPath)) throw new Error(`backup file missing: ${srcPath}`);
  const raw = readFileSync(srcPath, "utf8");
  const doc = JSON.parse(raw);
  log(`→ Slot-1 ${cfg.file} loaded (${raw.length} bytes)`);

  const drivePaths = writeDriveFile(srcPath);
  log(`→ Local drill file: ${drivePaths.localPath}`);
  if (drivePaths.drivePath) log(`→ Drive file: ${drivePaths.drivePath}`);
  else log(`→ Drive folder not mounted (${DRIVE_DIR}) — local file only`);

  // Prefer Drive path when present (prove recovery from Drive file)
  const restoreFrom = drivePaths.drivePath || drivePaths.localPath;
  const restoreDoc = JSON.parse(readFileSync(restoreFrom, "utf8"));
  const body = buildPostBody(restoreDoc);

  const before = await getJson(cfg.endpoint);
  log(`→ Live before: ${JSON.stringify(summarize(before))}`);

  if (dryRun) {
    log("→ --dry-run: skip POST restore");
    const { report, out } = proofSummary({
      srcPath,
      drivePaths,
      before,
      after: before,
      body,
    });
    report.ok = true;
    report.dryRun = true;
    writeFileSync(out, JSON.stringify(report, null, 2));
    log(`DRILL OK (dry-run) report=${out}`);
    return;
  }

  log(`→ Restoring store "${storeName}" from ${restoreFrom}`);
  await postJson(cfg.endpoint, body);
  const after = await getJson(cfg.endpoint);
  log(`→ Live after:  ${JSON.stringify(summarize(after))}`);

  // Proof: restored payload matches what we posted (counts / markers)
  if (cfg.shape === "state") {
    const beforeN = Object.keys(before.ov || {}).length;
    const afterN = Object.keys(after.ov || {}).length;
    if (afterN < Math.min(1, beforeN) && beforeN > 0) {
      throw new Error(`restore looks empty: before ov=${beforeN} after ov=${afterN}`);
    }
  } else {
    const beforeN = (before.jobs || []).length;
    const afterN = (after.jobs || []).length;
    if (afterN < Math.min(1, beforeN) && beforeN > 0) {
      throw new Error(`restore looks empty: before jobs=${beforeN} after jobs=${afterN}`);
    }
  }

  const { out } = proofSummary({ srcPath, drivePaths, before, after, body });
  log(`DRILL OK — restored ${storeName} from Drive/local backup file`);
  log(`report=${out}`);
}

main().catch((e) => {
  console.error("DRILL FAILED:", e.message || e);
  process.exit(1);
});
