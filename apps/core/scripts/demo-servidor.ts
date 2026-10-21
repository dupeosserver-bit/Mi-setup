/**
 * Servidor de una sola vez para grabar los datos de la demo pública del sitio
 * oficial. Levanta Mi Setup (edición pública) con Postgres embebido en memoria,
 * crea una cuenta y datos de ejemplo (nada personal) y sirve la UI compilada.
 * Después apps/ui/scripts/demo-grabar.mjs recorre la app y guarda lo que
 * responde la API en apps/ui/src/demo/datos.json.
 *
 *   pnpm --filter @mi-setup/ui build:publica
 *   pnpm --filter @mi-setup/core exec tsx --conditions=development scripts/demo-servidor.ts
 *
 * No toca ninguna base real ni ningún VPS.
 */
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { hashSecret } from "../src/auth/password.js";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { loadConfig } from "../src/config.js";
import type { Database } from "../src/db/client.js";
import { MIGRATIONS_DIR } from "../src/db/migrate.js";
import * as schema from "../src/db/schema.js";
import { createServerCipher } from "../src/security/crypto.js";

const PUERTO = Number(process.env["PUERTO_DEMO"] ?? 3999);
const secretos = { JWT_SECRET: randomBytes(32).toString("hex"), SERVER_ENC_KEY: randomBytes(32).toString("hex") };
const config = loadConfig({
  NODE_ENV: "development",
  ...secretos,
  EDICION: "publica",
  UI_DIR: fileURLToPath(new URL("../../ui/dist", import.meta.url)),
  UPLOADS_DIR: fileURLToPath(new URL("../../../.data/demo/uploads", import.meta.url)),
  ARCHIVOS_DIR: fileURLToPath(new URL("../../../.data/demo/archivos", import.meta.url)),
});
const cliente = new PGlite();
const db = drizzle(cliente, { schema }) as unknown as Database;
await migrate(drizzle(cliente, { schema }), { migrationsFolder: MIGRATIONS_DIR });

const { app, preparar } = await buildApp({ config, db, logger: false });
await preparar();

const totp = generateTotpSecret();
const cifrado = createServerCipher(secretos.SERVER_ENC_KEY);
await db.insert(schema.users).values({
  email: "demo@misetup.app",
  displayName: "Ana Demo",
  passwordHash: await hashSecret("demo-misetup-2026"),
  role: "maestra",
  isActive: true,
  totpSecretEnc: cifrado.encrypt(totp),
});
const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@misetup.app", password: "demo-misetup-2026", totp: totpAt(totp, new Date()) } });
const sesion = login.json<{ accessToken: string; refreshToken: string; usuario: unknown }>();
if (!sesion.accessToken) throw new Error(`No se pudo entrar: ${login.body}`);
const h = { authorization: `Bearer ${sesion.accessToken}` };

const hoy = new Date();
const dia = (n: number) => new Date(hoy.getTime() + n * 86_400_000).toISOString().slice(0, 10);
const enviar = async (url: string, payload: unknown) => {
  const r = await app.inject({ method: "POST", url, headers: h, payload: payload as Record<string, unknown> });
  if (r.statusCode >= 400) process.stderr.write(`Aviso: ${url} → ${r.statusCode} ${r.body.slice(0, 200)}\n`);
  return r.json<{ id?: string }>();
};

// ---------------------------------------------------------------- datos de ejemplo
const nota = await enviar("/api/notas", {
  titulo: "Ideas para la pastelería",
  icono: "🧁",
  fijada: true,
  color: "rosa",
  contenido: "# Ideas para la pastelería\n\n**Nuevos sabores** para el mes:\n- [x] Pastel de tres leches con fresa\n- [ ] Cupcakes de vainilla y chocolate\n- [ ] Galletas de avena\n\n> Probar los precios con los clientes de siempre.\n\n||Sorpresa: descuento del 10 % el viernes||",
});
await enviar("/api/notas", { titulo: "Lista del súper", icono: "🛒", contenido: "- [ ] Harina\n- [ ] Huevos\n- [x] Leche\n- [ ] Fresas" });
await enviar("/api/notas", { titulo: "Viaje a Oaxaca", icono: "✈️", color: "azul", contenido: "## Pendientes\n- Reservar hotel\n- Comprar boletos de autobús\n\n-# Salida el 12 de diciembre" });
await enviar("/api/notas", { titulo: "Recetas", icono: "📖", padre: nota.id ?? null, contenido: "Pan de elote: 4 elotes, 1 lata de leche condensada, 4 huevos." });
for (const [titulo, estado] of [["Diseñar el menú nuevo", "haciendo"], ["Llamar al proveedor", "pendiente"], ["Pagar el internet", "hecho"], ["Subir fotos a Instagram", "pendiente"]] as const) {
  await enviar("/api/tareas", { titulo, estado });
}
await enviar("/api/recordatorios", { titulo: "Renovar el dominio", fecha: new Date(hoy.getTime() + 2 * 86_400_000).toISOString(), repeticion: "nunca" });
await enviar("/api/recordatorios", { titulo: "Cumpleaños de mamá 🎂", fecha: new Date(hoy.getTime() + 6 * 86_400_000).toISOString(), repeticion: "nunca" });
await enviar("/api/recordatorios", { titulo: "Pagar la tarjeta", fecha: new Date(hoy.getTime() + 9 * 86_400_000).toISOString(), repeticion: "mensual" });
for (const [tipo, monto, categoria, descripcion, d] of [
  ["ingreso", 18500, "Sueldo", "Quincena", -12],
  ["ingreso", 3200, "Ventas", "Pasteles del fin de semana", -3],
  ["gasto", 1250.5, "Comida", "Súper", -10],
  ["gasto", 420, "Transporte", "Gasolina", -8],
  ["gasto", 299, "Suscripciones", "Netflix", -6],
  ["gasto", 860, "Servicios", "Luz y agua", -5],
  ["gasto", 350, "Diversión", "Cine con amigos", -2],
  ["gasto", 189.9, "Comida", "Tacos", -1],
  ["gasto", 640, "Ropa", "Tenis", 0],
] as const) {
  await enviar("/api/finanzas-personales/movimientos", { tipo, monto, categoria, descripcion, fecha: dia(d) });
}
await enviar("/api/finanzas-personales/suscripciones", { nombre: "Netflix", monto: 299, proximoCobro: dia(12) });
await enviar("/api/finanzas-personales/suscripciones", { nombre: "Spotify", monto: 129, proximoCobro: dia(4) });
await enviar("/api/finanzas-personales/suscripciones", { nombre: "VPS", monto: 180, proximoCobro: dia(20) });
await enviar("/api/finanzas-personales/divididos", {
  nombre: "Internet de la casa",
  total: 600,
  primerCobro: dia(5),
  modo: "igual",
  incluirme: true,
  personas: [{ nombre: "Luis" }, { nombre: "Sofía" }],
});
await enviar("/api/calendario/eventos", { titulo: "Junta con proveedores", fecha: new Date(hoy.getTime() + 3 * 86_400_000).toISOString(), color: "#3987e5" });
await enviar("/api/enlaces", { destino: "https://example.com/menu-de-temporada", codigo: "menu" });
await enviar("/api/prompts", { titulo: "Publicación para Instagram", cuerpo: "Escribe una publicación para Instagram de {negocio} sobre {tema}. Tono alegre y 3 hashtags.", categoria: "Redes" });

await app.listen({ host: "127.0.0.1", port: PUERTO });
process.stdout.write(`${JSON.stringify({ url: `http://127.0.0.1:${PUERTO}`, sesion })}\n`);
