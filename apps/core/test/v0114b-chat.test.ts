import { afterEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function sesion(c: Ctx, email: string) {
  await seedUser(c.db, { email, password: "clave-de-prueba-123", permissions: { chat: "escritura" } as never });
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-de-prueba-123" } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

type Canal = { id: string; tipo: string; ultimo: { tipo: string; texto: string; fecha: string } | null };

describe("chat 0.11.4b", () => {
  it("cada canal trae su último mensaje para la vista previa", async () => {
    ctx = await createTestContext();
    const h = await sesion(ctx, "chat@x.test");
    const lista = async () => (await ctx!.app.inject({ method: "GET", url: "/api/chat/canales", headers: h })).json<Canal[]>();
    const [personal] = await lista();
    expect(personal?.ultimo).toBeNull();

    await ctx.app.inject({ method: "POST", url: `/api/chat/canales/${personal!.id}/mensajes`, headers: h, payload: { texto: "primero" } });
    ctx.advance(60_000);
    await ctx.app.inject({ method: "POST", url: `/api/chat/canales/${personal!.id}/mensajes`, headers: h, payload: { texto: "https://ejemplo.net" } });

    const [despues] = await lista();
    expect(despues?.ultimo).toMatchObject({ tipo: "enlace", texto: "https://ejemplo.net" });
  });
});
