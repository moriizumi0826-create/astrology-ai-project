import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "");

  return {
    plugins: [react()],
    define: {
      __APP_API_BASE_URL__: JSON.stringify(
        rootEnv.VITE_API_BASE_URL || "http://127.0.0.1:8000"
      ),
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          results: path.resolve(__dirname, "results.html"),
          dashboard: path.resolve(__dirname, "dashboard.html"),
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
    },
  };
});
