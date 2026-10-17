/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // App de Android: la UI va empaquetada y habla con el servidor por HTTPS.
  define:
    mode === "movil"
      ? { "import.meta.env.VITE_API_URL": JSON.stringify(process.env["MI_SETUP_API"] ?? "https://setup.mexicanland.net") }
      : {},
  resolve: {
    alias: {
      // La UI usa siempre el código fuente de shared (Vite lo compila).
      "@mi-setup/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", ws: true },
      "/uploads": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
  },
}));
