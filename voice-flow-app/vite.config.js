import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/app/voice-flow/",
  plugins: [react()],
  resolve: {
    alias: {
      "@voice": path.resolve(__dirname, "../pro-src/src/lib/voiceFlow.js"),
    },
  },
  build: {
    outDir: "../app/voice-flow",
    emptyOutDir: true,
  },
});