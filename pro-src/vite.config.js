import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// LE Pro builds into the repo at app/pro/ — the site deploys the repo root
// statically (see netlify.toml: publish = "."), so the BUILT output is
// committed and served at https://leelectrical.us/app/pro/.
export default defineConfig({
  base: "/app/pro/",
  plugins: [react()],
  build: {
    outDir: "../app/pro",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@netlify/blobs": path.resolve(__dirname, "test/mocks/netlify-blobs.js"),
    },
  },
  test: {
    environment: "node",
    globals: true, // lets @testing-library/react auto-cleanup between tests
    include: ["test/**/*.test.js", "test/**/*.test.jsx"],
    // jsx integration suites declare `@vitest-environment jsdom` per-file
  },
});
