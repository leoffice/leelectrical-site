#!/usr/bin/env node
/**
 * Stamp app/pro/version.json + public/version.json from current git HEAD.
 * Invoked as part of `npm run build` so every built artifact carries its SHA.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makePublicVersion } from "../src/lib/deployVersion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRO_SRC = resolve(__dirname, "..");
const REPO = resolve(PRO_SRC, "..");

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    try {
      return execSync(cmd, { cwd: PRO_SRC, encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  }
}

const gitSha = process.env.LE_BUILD_SHA || sh("git rev-parse HEAD") || "unknown";
const gitShaShort =
  process.env.LE_BUILD_SHA_SHORT || sh("git rev-parse --short HEAD") || gitSha.slice(0, 7);
const task = process.env.LE_BUILD_TASK || "";
const netlifyDeployId = process.env.LE_NETLIFY_DEPLOY_ID || null;

const ver = makePublicVersion({
  gitSha,
  gitShaShort,
  netlifyDeployId,
  task,
  ts: new Date().toISOString(),
});

for (const p of [
  join(PRO_SRC, "public/version.json"),
  join(REPO, "app/pro/version.json"),
]) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(ver, null, 2) + "\n");
}

console.log(`version stamp ${ver.gitShaShort} → public/ + app/pro/`);