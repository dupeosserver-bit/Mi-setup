import { afterEach, describe, expect, it } from "vitest";
import { dispararRecordatorios, siguienteFecha } from "../src/modules/recordatorios.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function sesion(c: Ctx, email: string, permisos: Record<string, string>) {
  await seedUser(c.db, { email, password: "clave-de-prueba-123", permissions: permisos as never });
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-de-prueba-123" } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

describe("recordatorios", () => {
  it("calcula la siguiente fecha de los repetidos", () => {
    const base = new Date("2026-01-31T10:00:00Z");
    expect(siguienteFecha(base, "nunca", base)).toBeNull();
    expect(siguienteFecha(base, "diario", base)?.toISOString()).toBe("2026-02-01T10:00:00.000Z");
    expect(siguienteFecha(base, "semanal", new Date("2026-02-10T00:00:00Z"))?.toISOString()).toBe("2026-02-14T10:00:00.000Z");
    // Del 31 de enero pasa al último día de febrero.
    expect(siguienteFecha(base, "mensual", base)?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });

  it("avisa por push al vencer y pasa los repetidos a la siguiente fecha", async () => {
    ctx = await createTestContext();
    const h = await sesion(ctx, "r@x.test", { recordatorios: "escritura" });
    const enUnMinuto = new Date(ctx.clock.now.getTime() + 60_000).toISOString();
    await ctx.app.inject({ method: "POST", url: "/api/recordatorios", headers: h, payload: { titulo: "Pagar VPS", fecha: enUnMinuto } });
    await ctx.app.inject({ method: "POST", url: "/api/recordatorios", headers: h, payload: { titulo: "Respaldo", fecha: enUnMinuto, repeticion: "diario" } });

    ctx.advance(2 * 60_000);
    const app = ctx.app;
    const lista = async () => (await app.inject({ method: "GET", url: "/api/recordatorios", headers: h })).json<{ titulo: string; fecha: string; avisado: string | null }[]>();
    expect((await lista()).every((r) => r.avisado === null)).toBe(true);

    const enviados = await dispararRecordatorios(ctx.deps);
    expect(enviados).toBe(2);
    expect(ctx.notifier.sent.map((m) => m.title).sort()).toEqual(["Recordatorio: Pagar VPS", "Recordatorio: Respaldo"]);
    const despues = await lista();
    expect(despues.find((r) => r.titulo === "Respaldo")?.fecha).toBe(new Date(new Date(enUnMinuto).getTime() + 86_400_000).toISOString());
    // No se vuelve a avisar el mismo vencimiento.
    expect(await dispararRecordatorios(ctx.deps)).toBe(0);
  });
});

describe("notas", () => {
  it("cada cuenta ve solo sus notas; búsqueda y fijado", async () => {
    ctx = await createTestContext();
    const a = await sesion(ctx, "a@x.test", { notas: "escritura" });
    const b = await sesion(ctx, "b@x.test", { notas: "escritura" });
    await ctx.app.inject({ method: "POST", url: "/api/notas", headers: a, payload: { titulo: "IP del VPS", contenido: "panel en contabo" } });
    const fijada = await ctx.app.inject({ method: "POST", url: "/api/notas", headers: a, payload: { titulo: "Ideas", contenido: "nuevo plan", fijada: true } });
    expect(fijada.statusCode).toBe(200);

    const deA = (await ctx.app.inject({ method: "GET", url: "/api/notas", headers: a })).json<{ titulo: string }[]>();
    expect(deA.map((n) => n.titulo)).toEqual(["Ideas", "IP del VPS"]);
    expect((await ctx.app.inject({ method: "GET", url: "/api/notas?q=contabo", headers: a })).json()).toHaveLength(1);
    expect((await ctx.app.inject({ method: "GET", url: "/api/notas", headers: b })).json()).toHaveLength(0);

    const id = fijada.json<{ id: string }>().id;
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/notas/${id}`, headers: b })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "GET", url: "/api/notas", headers: a })).json()).toHaveLength(2);
  });
});

describe("chat", () => {
  it("canal personal automático y mensajes solo para miembros", async () => {
    ctx = await createTestContext();
    const a = await sesion(ctx, "a@x.test", { chat: "escritura", recordatorios: "escritura" });
    const b = await sesion(ctx, "b@x.test", { chat: "escritura" });
    const canales = (await ctx.app.inject({ method: "GET", url: "/api/chat/canales", headers: a })).json<{ id: string; tipo: string }[]>();
    expect(canales).toHaveLength(1);
    expect(canales[0]?.tipo).toBe("personal");
    const canal = canales[0]!.id;

    const enlace = await ctx.app.inject({ method: "POST", url: `/api/chat/canales/${canal}/mensajes`, headers: a, payload: { texto: "https://panel.mexicanland.org" } });
    expect(enlace.json()).toMatchObject({ tipo: "enlace" });
    const conRecordatorio = await ctx.app.inject({
      method: "POST",
      url: `/api/chat/canales/${canal}/mensajes`,
      headers: a,
      payload: { texto: "Revisar backups", recordatorio: { fecha: "2026-03-02T10:00:00Z" } },
    });
    expect(conRecordatorio.json()).toMatchObject({ tipo: "recordatorio" });
    expect((await ctx.app.inject({ method: "GET", url: "/api/recordatorios", headers: a })).json()).toHaveLength(1);

    expect((await ctx.app.inject({ method: "GET", url: `/api/chat/canales/${canal}/mensajes`, headers: b })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: "POST", url: `/api/chat/canales/${canal}/mensajes`, headers: b, payload: { texto: "hola" } })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: "GET", url: `/api/chat/canales/${canal}/mensajes`, headers: a })).json()).toHaveLength(2);
  });

  it("chat privado (uno por pareja) y grupos: renombrar, agregar y salir", async () => {
    ctx = await createTestContext();
    const app = ctx.app;
    const a = await sesion(ctx, "a@x.test", { chat: "escritura" });
    const b = await sesion(ctx, "b@x.test", { chat: "escritura" });
    const c = await sesion(ctx, "c@x.test", { chat: "escritura" });
    const usuarios = (await app.inject({ method: "GET", url: "/api/chat/usuarios", headers: a })).json<{ id: string; nombre: string }[]>();
    const idDe = (email: string) => usuarios.find((u) => u.nombre === email || u.nombre.startsWith(email.split("@")[0]!))?.id ?? "";
    const idA = idDe("a@x.test");
    const idB = idDe("b@x.test");
    const idC = idDe("c@x.test");
    expect(idA && idB && idC).toBeTruthy();

    const p1 = (await app.inject({ method: "POST", url: "/api/chat/privado", headers: a, payload: { usuarioId: idB } })).json<{ id: string }>();
    const p2 = (await app.inject({ method: "POST", url: "/api/chat/privado", headers: b, payload: { usuarioId: idA } })).json<{ id: string }>();
    expect(p2.id).toBe(p1.id);
    await app.inject({ method: "POST", url: `/api/chat/canales/${p1.id}/mensajes`, headers: a, payload: { texto: "hola primo" } });
    expect((await app.inject({ method: "GET", url: `/api/chat/canales/${p1.id}/mensajes`, headers: b })).json()).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: `/api/chat/canales/${p1.id}/mensajes`, headers: c })).statusCode).toBe(403);
    // Entre cuentas normales no sale push por ntfy (ese canal es el de la cuenta maestra).
    expect(ctx.notifier.sent.some((p) => p.title.includes("Mensaje de"))).toBe(false);

    const g = (await app.inject({ method: "POST", url: "/api/chat/canales", headers: a, payload: { nombre: "Equipo", miembros: [idB] } })).json<{ id: string }>();
    expect((await app.inject({ method: "PATCH", url: `/api/chat/canales/${g.id}`, headers: c, payload: { agregar: [idC] } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: `/api/chat/canales/${g.id}`, headers: a, payload: { nombre: "Equipo VPS", agregar: [idC] } })).statusCode).toBe(200);
    const deC = (await app.inject({ method: "GET", url: "/api/chat/canales", headers: c })).json<{ id: string; nombre: string; tipo: string; miembros: unknown[] }[]>();
    expect(deC.find((x) => x.id === g.id)).toMatchObject({ nombre: "Equipo VPS", tipo: "grupo" });
    expect(deC.find((x) => x.id === g.id)?.miembros).toHaveLength(3);

    expect((await app.inject({ method: "POST", url: `/api/chat/canales/${g.id}/salir`, headers: c })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/chat/canales/${g.id}/mensajes`, headers: c })).statusCode).toBe(403);
    const personal = (await app.inject({ method: "GET", url: "/api/chat/canales", headers: a })).json<{ id: string; tipo: string }[]>().find((x) => x.tipo === "personal")!;
    expect((await app.inject({ method: "POST", url: `/api/chat/canales/${personal.id}/salir`, headers: a })).statusCode).toBe(400);
  });
});
