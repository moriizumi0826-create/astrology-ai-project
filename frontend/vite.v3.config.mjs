import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(directory, ".."), "");
  const deployment = rootEnv.VITE_V3_ENVIRONMENT || "local";
  if (!["local", "preview", "production"].includes(deployment)) throw new Error("VITE_V3_ENVIRONMENT must be local, preview, or production");
  const apiBaseUrl = rootEnv.VITE_V3_API_BASE_URL || "";
  if (deployment !== "local") {
    const api = new URL(apiBaseUrl);
    if (api.protocol !== "https:" || api.username || api.password || api.pathname !== "/" || api.search || api.hash) {
      throw new Error("Public V3 builds require an HTTPS API origin");
    }
    if (deployment === "production" && api.hostname.includes("preview")) {
      throw new Error("The production V3 build cannot use a preview API host");
    }
  }
  const inputs = { app: path.join(directory, "v3/index.html"), entry: path.join(directory, "v3/entry.html"), login: path.join(directory, "v3/login.html"), callback: path.join(directory, "v3/auth-callback.html"), billing: path.join(directory, "v3/billing.html"), account: path.join(directory, "v3/account.html") };
  if (deployment === "local" && rootEnv.V3_INCLUDE_TEST_LOGIN !== "false") inputs.testLogin = path.join(directory, "v3/test-login.html");
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
    __APP_API_BASE_URL__: JSON.stringify(apiBaseUrl),
    __APP_ENVIRONMENT__: JSON.stringify(deployment),
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
