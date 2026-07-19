// The product/brand name must be ONE swappable value.
//
// Levi may rename "LE Pro" to "Level" (or anything else) at short notice. This
// suite is the guarantee that the rename is a one-value change:
//
//   1. Changing the value renames the app — chrome, documents, emails.
//   2. No source file re-hard-codes the literal, so nothing gets missed.
//
// If you are here because test 2 failed: do not add your file to the
// allowlist. Use productName() / productPoweredBy() from lib/tenantBranding.js
// instead. The allowlist is only for strings that live in STORED DATA or on an
// external protocol, which must keep matching pre-rename records.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PRODUCT_BRAND, isBrandNoteToken, resolveProductBrand } from "../../shared/productBrand.mjs";
import { resolveTenantConfig } from "../src/lib/tenantConfig.js";
import {
  productName,
  productPoweredBy,
  setActiveTenantConfig,
  tenantChrome,
} from "../src/lib/tenantBranding.js";

const SRC = new URL("../src", import.meta.url).pathname;
const FUNCTIONS = new URL("../../netlify/functions", import.meta.url).pathname;

const asDefault = () => setActiveTenantConfig(resolveTenantConfig(null));

/** A tenant that has renamed the product. */
const asRenamed = () =>
  setActiveTenantConfig(
    resolveTenantConfig({
      tenantId: "acme",
      internal: false,
      plan: { tier: "full" },
      product: { name: "Level", shortName: "Lvl", poweredBy: "Powered by Lvl" },
    })
  );

afterEach(asDefault);

describe("the default brand is LE Pro", () => {
  it("ships LE Pro / LE / Powered by LE as defaults", () => {
    expect(PRODUCT_BRAND.name).toBe("LE Pro");
    expect(PRODUCT_BRAND.shortName).toBe("LE");
    expect(PRODUCT_BRAND.poweredBy).toBe("Powered by LE");
  });

  it("resolves those defaults when a tenant overrides nothing", () => {
    asDefault();
    expect(productName()).toBe("LE Pro");
    expect(productPoweredBy()).toBe("Powered by LE");
    expect(tenantChrome().product).toBe("LE Pro");
  });
});

describe("changing the one value renames the product", () => {
  it("swaps the name everywhere it is read", () => {
    asRenamed();
    expect(productName()).toBe("Level");
    expect(productPoweredBy()).toBe("Powered by Lvl");
    expect(tenantChrome().product).toBe("Level");
  });

  it("a partial override keeps the remaining defaults", () => {
    const b = resolveProductBrand({ name: "Level" });
    expect(b.name).toBe("Level");
    expect(b.poweredBy).toBe("Powered by LE");
  });

  it("blank or non-string overrides fall back rather than blanking the brand", () => {
    for (const bad of [{ name: "" }, { name: "   " }, { name: 42 }, null, "nope"]) {
      expect(resolveProductBrand(bad).name).toBe("LE Pro");
    }
  });
});

describe("a rename does not orphan existing records", () => {
  it("still recognises the legacy payment-note token", () => {
    // Records written before the rename carry the old wording.
    expect(isBrandNoteToken("Recorded from LE Pro", "Level")).toBe(true);
    expect(isBrandNoteToken("recorded from le pro", "Level")).toBe(true);
  });

  it("also recognises the post-rename wording", () => {
    expect(isBrandNoteToken("Recorded from Level", "Level")).toBe(true);
  });

  it("does not swallow a genuine payment method", () => {
    expect(isBrandNoteToken("Zelle", "Level")).toBe(false);
    expect(isBrandNoteToken("", "Level")).toBe(false);
  });
});

/* ── the sweep ──────────────────────────────────────────────────────────── */

/**
 * Files permitted to contain the literal product name in CODE.
 * Every entry needs a reason. "It was easier" is not a reason.
 */
const ALLOWLIST = new Map([
  // Reads the brand; naming the default in a doc-comment is the point.
  ["lib/tenantBranding.js", "defines the accessors"],
  // Stable server storage key whose VALUE is data, not branding.
  ["lib/chatConvo.js", "LE_PRO_CONVO storage key — renaming orphans chat history"],
]);

/**
 * Server-side files permitted to contain the literal. Emails, PDFs and the
 * card-processor payload all live here, so this half of the sweep matters as
 * much as the client half.
 */
const FN_ALLOWLIST = new Map([
  ["lib/le-invoice-suite/logoBase64.mjs", "binary asset blob"],
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".netlify") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(p)) out.push(p);
  }
  return out;
}

function sweep(root, allowlist, needle) {
  const offenders = [];
  for (const file of walk(root)) {
    const rel = relative(root, file);
    if (allowlist.has(rel)) continue;
    if (stripComments(readFileSync(file, "utf8")).includes(needle)) offenders.push(rel);
  }
  return offenders;
}

/** Strip line and block comments so doc-comments don't trip the sweep. */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("no source file re-hard-codes the product name", () => {
  it("the app finds the literal only in allowlisted files", () => {
    expect(
      sweep(SRC, ALLOWLIST, PRODUCT_BRAND.name),
      `hard-coded "${PRODUCT_BRAND.name}" — use productName() instead`
    ).toEqual([]);
  });

  it("the app finds the powered-by wording only in allowlisted files", () => {
    expect(
      sweep(SRC, ALLOWLIST, PRODUCT_BRAND.poweredBy),
      "hard-coded powered-by text — use productPoweredBy()"
    ).toEqual([]);
  });

  it("the mail/PDF functions do not hard-code the product name", () => {
    expect(
      sweep(FUNCTIONS, FN_ALLOWLIST, PRODUCT_BRAND.name),
      `hard-coded "${PRODUCT_BRAND.name}" server-side — import PRODUCT_BRAND from shared/productBrand.mjs`
    ).toEqual([]);
  });

  it("the mail/PDF functions do not hard-code the powered-by wording", () => {
    expect(
      sweep(FUNCTIONS, FN_ALLOWLIST, PRODUCT_BRAND.poweredBy),
      "hard-coded powered-by text server-side — use resolveProductBrand()"
    ).toEqual([]);
  });
});
