/** Ajustes globales de la app (clave → JSON). */
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { appSettings } from "../db/schema.js";

export async function getSetting<T>(db: Database, key: string): Promise<T | null> {
  const [fila] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return (fila?.value as T | undefined) ?? null;
}

export async function setSetting(db: Database, key: string, value: unknown, now: Date): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}

export async function deleteSetting(db: Database, key: string): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, key));
}
