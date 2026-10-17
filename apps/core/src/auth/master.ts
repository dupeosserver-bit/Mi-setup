/** Alta de la cuenta maestra (solo desde el comando crear-maestra, nunca por HTTP). */
import { passwordSchema } from "@mi-setup/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AuditWriter } from "../audit/audit.js";
import type { Database } from "../db/client.js";
import { users } from "../db/schema.js";
import type { ServerCipher } from "../security/crypto.js";
import { hashSecret } from "./password.js";

export const masterInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido").max(254),
  displayName: z.string().trim().min(1, "Escribe un nombre").max(80),
  password: passwordSchema,
  totpSecret: z.string().min(16),
});
export type MasterInput = z.infer<typeof masterInputSchema>;

export async function masterExists(db: Database): Promise<boolean> {
  const filas = await db.select({ id: users.id }).from(users).where(eq(users.role, "maestra")).limit(1);
  return filas.length > 0;
}

export async function createMasterAccount(
  db: Database,
  cipher: ServerCipher,
  audit: AuditWriter,
  raw: MasterInput,
): Promise<string> {
  const input = masterInputSchema.parse(raw);
  if (await masterExists(db)) throw new Error("Ya existe una cuenta maestra");
  const [creada] = await db
    .insert(users)
    .values({
      email: input.email,
      displayName: input.displayName,
      passwordHash: await hashSecret(input.password),
      role: "maestra",
      totpSecretEnc: cipher.encrypt(input.totpSecret),
    })
    .returning({ id: users.id });
  if (!creada) throw new Error("No se pudo crear la cuenta maestra");
  await audit.record({
    actorType: "sistema",
    actorUserId: creada.id,
    action: "cuenta_maestra_creada",
    module: "cuentas",
    outcome: "ok",
    details: { correo: input.email },
  });
  return creada.id;
}
