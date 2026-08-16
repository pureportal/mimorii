import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const clientVersion = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
).version;

export default defineConfig({
  envDir: "../..",
  plugins: [react(), tailwindcss()],
  define: {
    MIMORII_VERSION: JSON.stringify(clientVersion),
  },
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:4310",
      "/docs": "http://localhost:4310",
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
