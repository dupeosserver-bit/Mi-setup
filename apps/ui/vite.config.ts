/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
});
