/**
 * Crea la cuenta maestra (una sola vez). No hay registro público: este comando
 * es la única forma de crearla.
 *
 *   Local:  pnpm --filter @mi-setup/core crear-maestra
 *   VPS:    docker exec -it misetup-core node dist/cli/crear-maestra.js
 */
import { stdin, stdout } from "node:process";
import { createInterface, type Interface } from "node:readline/promises";
import { createDbAuditWriter } from "../audit/audit.js";
import { createMasterAccount, masterExists, masterInputSchema } from "../auth/master.js";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../auth/totp.js";
import { loadConfig } from "../config.js";
import { abrirBase } from "../db/open.js";
import { loadLocalEnv } from "../env-file.js";
import { createServerCipher } from "../security/crypto.js";

function escribir(texto: string): void {
  stdout.write(`${texto}\n`);
}

/** Pregunta sin mostrar lo que se escribe (contraseñas). */
async function preguntarOculto(rl: Interface, pregunta: string): Promise<string> {
  const salida = rl as unknown as { _writeToOutput: (s: string) => void };
  const original = salida._writeToOutput;
  // La pregunta se escribe por readline (si se escribe antes, readline la borra al redibujar la línea);
  // después se silencia solo el eco de lo que se teclea.
  let silencio = false;
  salida._writeToOutput = (s: string) => {
    if (!silencio) original.call(rl, s);
  };
  try {
    const respuesta = rl.question(pregunta);
    silencio = true;
    return await respuesta;
  } finally {
    salida._writeToOutput = original;
    stdout.write("\n");
  }
}

async function main(): Promise<number> {
  loadLocalEnv();
  const config = loadConfig();
  if (!config.env.SERVER_ENC_KEY) {
    escribir("Falta configurar: SERVER_ENC_KEY");
    return 1;
  }
  const cipher = createServerCipher(config.env.SERVER_ENC_KEY);
  const base = await abrirBase(config);
  const { db } = base;
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });

  try {
    await base.migrar();
    if (await masterExists(db)) {
      escribir("Ya existe una cuenta maestra. No se creó nada.");
      return 1;
    }

    escribir("== Mi Setup: crear cuenta maestra ==");
    const email = (await rl.question("Correo: ")).trim().toLowerCase();
    const displayName = (await rl.question("Nombre visible: ")).trim();
    const password = await preguntarOculto(rl, "Contraseña (mínimo 12 caracteres): ");
    const repetida = await preguntarOculto(rl, "Repite la contraseña: ");
    if (password !== repetida) {
      escribir("Las contraseñas no coinciden.");
      return 1;
    }

    const totpSecret = generateTotpSecret();
    const validado = masterInputSchema.safeParse({ email, displayName, password, totpSecret });
    if (!validado.success) {
      escribir(validado.error.issues.map((i) => `- ${i.message}`).join("\n"));
      return 1;
    }

    escribir("\nAgrega esta cuenta a tu app autenticadora (Google Authenticator, Aegis, etc.):");
    escribir(`  Clave: ${totpSecret}`);
    escribir(`  Enlace: ${otpauthUri({ secret: totpSecret, account: email, issuer: "Mi Setup" })}\n`);

    for (let intento = 1; intento <= 3; intento++) {
      const codigo = (await rl.question("Código de 6 dígitos que muestra tu app: ")).trim();
      if (verifyTotp(totpSecret, codigo, new Date(), null) !== null) {
        await createMasterAccount(db, cipher, createDbAuditWriter(db), validado.data);
        escribir("Cuenta maestra creada. Ya puedes iniciar sesión.");
        return 0;
      }
      escribir("Código incorrecto. Revisa que la hora del teléfono sea automática.");
    }
    escribir("Demasiados códigos incorrectos. No se creó la cuenta.");
    return 1;
  } finally {
    rl.close();
    await base.cerrar();
  }
}

process.exitCode = await main();
