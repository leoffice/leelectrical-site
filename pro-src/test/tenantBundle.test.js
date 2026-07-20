// Build-integrity guardrail: LE's confidential pricing must never be compiled
// into the chunk that white-label tenants download.
//
// This is deliberately a SOURCE-GRAPH check rather than only a built-artifact
// grep, because it must fail in CI on the commit that introduces the mistake —
// not later, when someone happens to inspect a bundle. A single static
// `import { DEFAULT_QBO_ITEMS } from ".../leQboCatalog.js"` anywhere in src/
// silently undoes the code-splitting and puts every price back in the main
// bundle, with no visible symptom in the UI.
//
// The matching artifact assertion (grep the built main chunk for
// "Coned Service" → 0 hits) is part of the release checklist.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(process.cwd(), "src");
const CATALOG = "leQboCatalog";

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const rel = (f) => path.relative(SRC, f);

describe("LE's price catalogue stays out of the tenant bundle", () => {
  it("no source file STATICALLY imports the catalogue", () => {
    // `import ... from "./leQboCatalog.js"` — the leak. A dynamic
    // `await import("./leQboCatalog.js")` is what we want and is not matched.
    const staticImport = /^\s*import\s[^;]*?from\s*["'][^"']*leQboCatalog[^"']*["']/m;
    const offenders = files.filter((f) => staticImport.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("exactly one module reaches the catalogue, and only via dynamic import()", () => {
    const importers = files.filter((f) => fs.readFileSync(f, "utf8").includes(CATALOG)).map(rel);
    expect(importers).toEqual(["data/qboItems.js"]);

    const src = fs.readFileSync(path.join(SRC, "data/qboItems.js"), "utf8");
    expect(src).toMatch(/await import\(\s*["']\.\/leQboCatalog\.js["']\s*\)/);
  });

  it("the catalogue module holds the data and nothing imports it at module scope", () => {
    const cat = fs.readFileSync(path.join(SRC, "data/leQboCatalog.js"), "utf8");
    // It really is the confidential data (guards against someone "fixing" the
    // test by emptying the file while re-adding the array elsewhere).
    expect(cat).toContain("Coned Service");
    expect(cat).toContain("Violation Resolution");
    // and it pulls in no app code that could drag it into the main graph.
    expect(cat).not.toMatch(/^\s*import\s/m);
  });

  it("filterQboItems keeps no fallback reference to the raw array", () => {
    const src = fs.readFileSync(path.join(SRC, "data/qboItems.js"), "utf8");
    const fn = src.slice(src.indexOf("export function filterQboItems"));
    expect(fn).not.toContain("DEFAULT_QBO_ITEMS");
  });
});
