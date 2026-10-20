import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { loadConfig } from "../src/config.js";
import { mailMessages } from "../src/db/schema.js";
import { firmar, purgarCorreos } from "../src/modules/correo.js";
import { bearer, createTestContext, seedUser, TEST_SECRETS } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

const SECRETO = "secreto-de-prueba-del-worker-".padEnd(40, "z");

async function maestra(c: Ctx) {
  const secret = generateTotpSecret();
  await seedUser(c.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secret, c.clock.now) } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

describe("correos temporales", () => {
  it("acepta solo correos con firma HMAC válida y reciente", async () => {
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, MAIL_INBOUND_SECRET: SECRETO }) });
    const h = await maestra(ctx);
    const { direccion } = (await ctx.app.inject({ method: "POST", url: "/api/correos/alias", headers: h, payload: { alias: "pruebas", etiqueta: "Registro" } })).json<{ direccion: string }>();
    expect(direccion).toBe("pruebas@mexicanland.net");

    const enviar = (cuerpo: object, opciones: { fecha?: number; secreto?: string } = {}) => {
      const texto = JSON.stringify(cuerpo);
      const fecha = String(opciones.fecha ?? Math.floor(ctx!.clock.now.getTime() / 1000));
      return ctx!.app.inject({
        method: "POST",
        url: "/api/mail/inbound",
        headers: { "content-type": "application/json", "x-mi-setup-fecha": fecha, "x-mi-setup-firma": firmar(opciones.secreto ?? SECRETO, fecha, texto) },
        payload: texto,
      });
    };
    const correo = { para: "Pruebas@MexicanLand.net", de: "Tienda <no-reply@tienda.test>", asunto: "Tu código: 123456", texto: "Hola", messageId: "<1@tienda>" };

    expect((await enviar(correo, { secreto: "otro-secreto" })).statusCode).toBe(401);
    expect((await enviar(correo, { fecha: Math.floor(ctx.clock.now.getTime() / 1000) - 600 })).statusCode).toBe(401);
    expect((await enviar({ ...correo, para: "desconocido@mexicanland.net" })).json()).toEqual({ aceptado: false });
    expect((await enviar(correo)).json()).toEqual({ aceptado: true });
    // Reenvío del mismo Message-ID: no se duplica.
    await enviar(correo);

    const bandeja = (await ctx.app.inject({ method: "GET", url: "/api/correos/mensajes", headers: h })).json<{ id: string; asunto: string }[]>();
    expect(bandeja).toHaveLength(1);
    expect(bandeja[0]?.asunto).toBe("Tu código: 123456");
  });

  it("borra a las 24 h los que no se guardaron", async () => {
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, MAIL_INBOUND_SECRET: SECRETO }) });
    const h = await maestra(ctx);
    await ctx.app.inject({ method: "POST", url: "/api/correos/alias", headers: h, payload: { alias: "temporal" } });
    for (const id of ["<a>", "<b>"]) {
      const texto = JSON.stringify({ para: "temporal@mexicanland.net", de: "x@y.test", asunto: id, texto: "", messageId: id });
      const fecha = String(Math.floor(ctx.clock.now.getTime() / 1000));
      await ctx.app.inject({ method: "POST", url: "/api/mail/inbound", headers: { "content-type": "application/json", "x-mi-setup-fecha": fecha, "x-mi-setup-firma": firmar(SECRETO, fecha, texto) }, payload: texto });
    }
    const [primero] = (await ctx.app.inject({ method: "GET", url: "/api/correos/mensajes", headers: h })).json<{ id: string }[]>();
    await ctx.app.inject({ method: "POST", url: `/api/correos/mensajes/${primero!.id}/guardar`, headers: h, payload: { guardado: true } });
    ctx.advance(25 * 60 * 60_000);
    await purgarCorreos(ctx.deps);
    const quedan = await ctx.db.select().from(mailMessages);
    expect(quedan).toHaveLength(1);
    expect(quedan[0]?.saved).toBe(true);
  });
});
