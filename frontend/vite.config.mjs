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
    base: "./",
    define: {
      __APP_API_BASE_URL__: JSON.stringify(
        rootEnv.VITE_API_BASE_URL || ""
      ),
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          mainV2: path.resolve(__dirname, "index-v2.html"),
          forecastDetail: path.resolve(__dirname, "forecast-detail.html"),
          forecastDetailV2: path.resolve(__dirname, "forecast-detail-v2.html"),
          annualBiorhythmDev: path.resolve(__dirname, "annual-biorhythm-dev.html"),
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
    },
  };
});
