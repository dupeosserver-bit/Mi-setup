import { fileURLToPath } from "node:url";

// src/db y dist/db están a la misma profundidad respecto a la carpeta drizzle/.
export const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));
