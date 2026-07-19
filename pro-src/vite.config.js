import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { PRODUCT_BRAND } from "../shared/productBrand.mjs";

// The app builds into the repo at app/pro/ — the site deploys the repo root
// statically (see netlify.toml: publish = "."), so the BUILT output is
// committed and served at https://leelectrical.us/app/pro/.

/**
 * Stamps the product brand into the two build-time surfaces that can't read
 * tenant_config at runtime: the HTML <title>/apple-web-app-title, and the PWA
 * manifest (which the browser reads before any JS runs).
 *
 * Without this, renaming the product would still need a manual edit in two
 * files — exactly the find-and-replace this whole design exists to avoid.
 */
function productBrandPlugin() {
  return {
    name: "product-brand",
    transformIndexHtml(html) {
      return html.replaceAll("%PRODUCT_NAME%", PRODUCT_BRAND.name);
    },
    // publicDir files are copied verbatim, so rewrite the manifest after the
    // copy rather than trying to intercept it.
    writeBundle(options) {
      const out = resolve(options.dir, "manifest.json");
      try {
        const m = JSON.parse(readFileSync(out, "utf8"));
        m.name = PRODUCT_BRAND.name;
        m.short_name = PRODUCT_BRAND.name;
        m.description = `${PRODUCT_BRAND.name} — jobs, schedule and billing in your pocket.`;
        writeFileSync(out, JSON.stringify(m, null, 2) + "\n");
      } catch (e) {
        this.warn(`could not stamp manifest.json: ${e.message}`);
      }
    },
  };
}

export default defineConfig({
  base: "/app/pro/",
  plugins: [react(), productBrandPlugin()],
  build: {
    outDir: "../app/pro",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    globals: true, // lets @testing-library/react auto-cleanup between tests
    include: ["test/**/*.test.js", "test/**/*.test.jsx"],
    // jsx integration suites declare `@vitest-environment jsdom` per-file
  },
});
