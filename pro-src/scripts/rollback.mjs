#!/usr/bin/env node
/**
 * One-command rollback to the previous LIVE version.
 *
 * Usage (from pro-src/):
 *   node scripts/rollback.mjs              # restore previous LIVE
 *   node scripts/rollback.mjs --list       # show deploy history
 *   node scripts/rollback.mjs --n 2        # roll back 2 deploys
 *   node scripts/rollback.mjs --dry-run    # print plan only
 *   node scripts/rollback.mjs --task "#64"
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendDeployRecord,
  formatRollbackPost,
  makePublicVersion,
  makeVersionRecord,
  parseHistoryDoc,
  resolveRollbackTarget,
  rollbackMode,
  serializeHistoryDoc,
  versionId,
} from "../src/lib/deployVersion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRO_SRC = resolve(__dirname, "..");
const REPO = resolve(PRO_SRC, "..");
const SHARED = join(homedir(), ".hermes/shared");
const HISTORY_PATH =
  process.env.LE_DEPLOY_HISTORY_PATH || join(SHARED, "le_deploy_history.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const listOnly = args.includes("--list") || args.includes("-l");
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const n = Number(flag("--n") || "1") || 1;
const task = flag("--task") || "";

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

async function netlifyRestore(deployId) {
  const token = process.env.NETLIFY_AUTH_TOKEN || "";
  if (!token) return { ok: false, reason: "NETLIFY_AUTH_TOKEN missing" };
  if (!deployId) return { ok: false, reason: "no netlify deploy id on target" };

  const url = `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(deployId)}/restore`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, reason: `HTTP ${res.status} ${body.slice(0, 200)}` };
  }
  return { ok: true, detail: await res.json().catch(() => ({})) };
}

function gitShaRollback(sha) {
  if (!sha) return { ok: false, reason: "no git SHA on target" };
  const full = sh(`git rev-parse ${sha}`);
  if (!full) return { ok: false, reason: `unknown git object ${sha}` };

  const hasPro = sh(`git cat-file -e ${full}:app/pro/index.html && echo yes`);
  if (hasPro === "yes") {
    const r = spawnSync(
      "git",
      ["checkout", full, "--", "app/pro"],
      { cwd: REPO, encoding: "utf8" }
    );
    if (r.status !== 0) {
      return { ok: false, reason: `git checkout app/pro failed: ${r.stderr || r.stdout}` };
    }
    return { ok: true, detail: `restored app/pro from ${full.slice(0, 7)}` };
  }

  return {
    ok: false,
    reason: `app/pro not in ${full.slice(0, 7)}; run: git checkout ${full.slice(0, 7)} && cd pro-src && npm run build && bash ~/.hermes/shared/deploy.sh "rollback to ${full.slice(0, 7)}"`,
  };
}

async function main() {
  const history = loadHistory();

  if (listOnly) {
    if (!history.length) {
      console.log("(no deploy history yet — run record-deploy.mjs on next deploy)");
      return;
    }
    console.log(`Deploy history (${HISTORY_PATH}):`);
    history.forEach((rec, i) => {
      console.log(
        `  ${i + 1}. ${rec.ts || "?"}  ${versionId(rec.previous)} → ${versionId(rec.next)}  mode=${rec.mode || "?"}  ${rec.task || ""}`
      );
    });
    const target = resolveRollbackTarget(history, 1);
    console.log(`rollback target (n=1): ${versionId(target)} mode=${rollbackMode(target)}`);
    return;
  }

  const target = resolveRollbackTarget(history, n);
  if (!target) {
    console.error(
      `No rollback target (history length=${history.length}, n=${n}). ` +
        `Run record-deploy.mjs before deploys so a previous LIVE version is stored.`
    );
    process.exit(2);
  }

  const mode = rollbackMode(target);
  const plan = formatRollbackPost({ target, mode, task });
  console.log(plan);
  console.log(
    `target: git=${target.gitShaShort || target.gitSha || "—"} netlify=${target.netlifyDeployId || "—"}`
  );

  if (dryRun) {
    console.log("(dry-run — no rollback performed)");
    return;
  }

  let result;
  if (mode === "netlify-instant") {
    console.log("→ Netlify instant rollback…");
    result = await netlifyRestore(target.netlifyDeployId);
    if (!result.ok) {
      console.warn(`Netlify rollback failed (${result.reason}); falling back to git-sha`);
      result = gitShaRollback(target.gitSha || target.gitShaShort);
      result.mode = "git-sha";
    } else {
      result.mode = "netlify-instant";
    }
  } else {
    console.log("→ git-SHA rollback (restore app/pro from previous commit)…");
    result = gitShaRollback(target.gitSha || target.gitShaShort);
    result.mode = "git-sha";
  }

  if (!result.ok) {
    console.error("ROLLBACK FAILED:", result.reason);
    process.exit(1);
  }

  const restored = makeVersionRecord({
    ...target,
    task,
    note: "rolled back LIVE",
    ts: new Date().toISOString(),
  });
  const currentHead = makeVersionRecord({
    gitSha: sh("git rev-parse HEAD"),
    note: "HEAD at rollback time",
  });
  const updated = appendDeployRecord(history, currentHead, restored, {
    task,
    mode: result.mode,
  });
  mkdirSync(dirname(HISTORY_PATH), { recursive: true });
  writeFileSync(
    HISTORY_PATH,
    JSON.stringify(serializeHistoryDoc(updated, { site: "leelectrical.us" }), null, 2) +
      "\n"
  );

  const publicVer = makePublicVersion({
    gitSha: restored.gitSha,
    gitShaShort: restored.gitShaShort,
    netlifyDeployId: restored.netlifyDeployId,
    task,
    ts: restored.ts,
  });
  for (const p of [
    join(REPO, "app/pro/version.json"),
    join(PRO_SRC, "public/version.json"),
  ]) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(publicVer, null, 2) + "\n");
  }

  console.log(`OK ${formatRollbackPost({ target: restored, mode: result.mode, task })}`);
  console.log(result.detail || "");
  if (result.mode === "git-sha") {
    console.log(
      "Note: app/pro restored locally. Push via deploy approval / deploy.sh to make LIVE match."
    );
  }
}

main().catch((e) => {
  console.error("rollback FAILED:", e.message || e);
  process.exit(1);
});