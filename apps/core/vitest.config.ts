import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cada archivo arranca un Postgres embebido y hace hashes Argon2id: en paralelo puede tardar.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      // En pruebas se usa el código fuente de shared, sin compilar.
      "@mi-setup/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
});
