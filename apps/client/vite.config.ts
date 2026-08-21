import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const clientVersion = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
).version;
const androidAgent = process.env.VITE_MIMORII_ANDROID_PRODUCT === "agent";

export default defineConfig({
  envDir: "../..",
  plugins: [
    {
      name: "mimorii-android-entry",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          if (!androidAgent) return html;
          return html
            .replace(/\s*<meta\s+name="description"\s+content="[^"]*"\s*\/>/, "")
            .replace('content="#0c0f1b"', 'content="#f8f7fc"')
            .replace("<title>Mimorii</title>", "<title>Mimorii Agent</title>")
            .replace("/src/main.tsx", "/src/agent-main.tsx");
        },
      },
    },
    react(),
    tailwindcss(),
  ],
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
    maxWorkers: 2,
    setupFiles: ["./src/test/setup.ts"],
  },
});
