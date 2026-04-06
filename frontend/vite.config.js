import path from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "");

  return {
    define: {
      __APP_API_BASE_URL__: JSON.stringify(
        rootEnv.VITE_API_BASE_URL || "http://127.0.0.1:8000"
      ),
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
    },
  };
});
