import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(directory, ".."), "");
  const inputs = { app: path.join(directory, "v3/index.html"), entry: path.join(directory, "v3/entry.html"), login: path.join(directory, "v3/login.html"), callback: path.join(directory, "v3/auth-callback.html"), billing: path.join(directory, "v3/billing.html") };
  if (rootEnv.V3_INCLUDE_TEST_LOGIN !== "false") inputs.testLogin = path.join(directory, "v3/test-login.html");
  return {
  // Intentionally independent from legacy VITE_API_BASE_URL and entry pages.
  root: path.join(directory, "v3"),
  base: "/",
  plugins: [react(), {
    name: "v3-loopback-only",
    configResolved(config) {
      if (config.server.host !== "127.0.0.1") {
        throw new Error("V3 stage 2 must bind only to 127.0.0.1");
      }
    },
  }],
  define: {
    __APP_API_BASE_URL__: JSON.stringify(rootEnv.VITE_V3_API_BASE_URL || ""),
  },
  server: {
    host: "127.0.0.1",
    port: 5176,
    strictPort: true,
    cors: false,
    fs: { strict: true, allow: [directory] },
    proxy: { "/api/v3": { target: "http://127.0.0.1:8103", changeOrigin: true } },
  },
  resolve: { alias: [{ find: /^\.\/reading-storage\.js$/, replacement: path.join(directory, "v3", "reading-storage.js") }] },
  build: { outDir: path.join(directory, "dist", "v3"), emptyOutDir: true,
    rollupOptions: { input: inputs } },
  };
});
