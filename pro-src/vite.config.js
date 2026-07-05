import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
