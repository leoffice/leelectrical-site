#!/usr/bin/env node
/**
 * Auto-bump le-pro-vNN cache label in public/sw.js before deploy.
 * Usage: node scripts/bump-sw-cache.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SW_PATH = resolve(__dirname, "../public/sw.js");
const dryRun = process.argv.includes("--dry-run");

const src = readFileSync(SW_PATH, "utf8");
const m = src.match(/const CACHE = "(le-pro-v(\d+))"/);
if (!m) {
  console.error("bump-sw-cache: CACHE line not found in sw.js");
  process.exit(1);
}

const oldLabel = m[1];
const oldNum = Number(m[2]);
const newNum = oldNum + 1;
const newLabel = `le-pro-v${newNum}`;
const next = src.replace(`const CACHE = "${oldLabel}"`, `const CACHE = "${newLabel}"`);

console.log(`sw cache ${oldLabel} → ${newLabel}`);
if (!dryRun) {
  writeFileSync(SW_PATH, next);
}