/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // App de Android: la UI va empaquetada y habla con el servidor por HTTPS.
  define: {
    // Versión de esta app (el celular la compara con la del servidor para avisar de actualizaciones).
    // Lleva la letra de la etapa: "0.9.0b" (beta) o "0.9.0a" (pública).
    __VERSION_APP__: JSON.stringify(
      ((p: { version: string; etapa?: string }) => `${p.version}${p.etapa ?? ""}`)(JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string; etapa?: string }),
    ),
    ...(mode.startsWith("movil") ? { "import.meta.env.VITE_API_URL": JSON.stringify(process.env["MI_SETUP_API"] ?? "https://setup.mexicanland.net") } : {}),
  },
  resolve: {
    alias: {
      // La UI usa siempre el código fuente de shared (Vite lo compila).
      "@mi-setup/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // La versión ESM de libsodium-wrappers-sumo importa un archivo que no incluye:
      // se usa su versión CommonJS (Vite la convierte).
      "libsodium-wrappers-sumo": createRequire(import.meta.url).resolve("libsodium-wrappers-sumo"),
    },
  },
  // El motor de semillas (WebAssembly) busca su .wasm junto a su .js: no se pre-empaqueta.
  optimizeDeps: { exclude: ["seedmaps-engine-wasm"] },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", ws: true },
      "/uploads": "http://127.0.0.1:3000",
      "/vista-previa": "http://127.0.0.1:3000",
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
