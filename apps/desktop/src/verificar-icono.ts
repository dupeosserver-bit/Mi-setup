/** Antes de crear el instalador: el ícono debe ser el de MexicanLand (nunca el genérico de Electron). */
import { existsSync } from "node:fs";
import { join } from "node:path";

const faltan = ["icon.ico", "icon.png"].filter((f) => !existsSync(join(__dirname, "..", "build", f)));
if (faltan.length > 0) {
  process.stderr.write(
    `Falta el ícono de la app (${faltan.join(", ")}).\n` +
      "Coloca el logo en assets/branding/icon.png y ejecuta en la raíz: pnpm branding\n",
  );
  process.exit(1);
}
