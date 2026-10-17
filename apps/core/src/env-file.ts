import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** En local carga el .env de la raíz del repo si existe. En Docker las variables llegan por compose. */
export function loadLocalEnv(): void {
  // src/ y dist/ están a la misma profundidad respecto a la raíz del repo.
  const file = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (process.env.NODE_ENV !== "production" && existsSync(file)) {
    process.loadEnvFile(file);
  }
}
