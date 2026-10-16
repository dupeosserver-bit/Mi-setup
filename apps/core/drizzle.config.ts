import { defineConfig } from "drizzle-kit";

// Solo se usa para generar migraciones (pnpm --filter @mi-setup/core db:generate).
// Las migraciones se aplican solas al arrancar core.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
