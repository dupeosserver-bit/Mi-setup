import { describe, expect, it } from "vitest";
import { botConfigSchema, CONFIG_BOT_INICIAL, enlaceInvitacion, enlaceNoPermitido, palabraProhibida, rellenar, revisarSpam, sumarXp, validarCommandosPropios, xpParaSubir } from "../src/bots.js";

describe("configuración de bots", () => {
  it("una configuración vacía se llena con valores seguros (todo apagado menos utilidades)", () => {
    const c = CONFIG_BOT_INICIAL;
    expect(c.utilidades.activo).toBe(true);
    for (const apagado of [c.bienvenida.activa, c.moderacion.activa, c.niveles.activo, c.economia.activa, c.tickets.activo, c.moderacion.antispam.activo]) expect(apagado).toBe(false);
    expect(c.general.colorEmbeds).toBe("#5865F2");
  });
  it("valida IDs, colores y nombres de comandos", () => {
    expect(botConfigSchema.safeParse({ bienvenida: { canalId: "no-es-id" } }).success).toBe(false);
    expect(botConfigSchema.safeParse({ general: { colorEmbeds: "rojo" } }).success).toBe(false);
    expect(botConfigSchema.safeParse({ comandos: [{ nombre: "Hola Mundo", descripcion: "x", respuesta: "y" }] }).success).toBe(false);
    expect(botConfigSchema.safeParse({ comandos: [{ nombre: "reglas", descripcion: "Las reglas", respuesta: "Sé amable" }] }).success).toBe(true);
    expect(botConfigSchema.safeParse({ bienvenida: { imagen: "http://inseguro.com/a.png" } }).success).toBe(false);
  });
  it("no deja repetir ni pisar comandos del bot", () => {
    const c = (n: string) => ({ nombre: n, descripcion: "d", respuesta: "r", conEmbed: false, privado: false });
    expect(validarCommandosPropios([c("reglas"), c("redes")])).toBeNull();
    expect(validarCommandosPropios([c("ban")])).toContain("ya es un comando");
    expect(validarCommandosPropios([c("reglas"), c("reglas")])).toContain("repetido");
  });
});

describe("plantillas y niveles", () => {
  it("rellena las variables y deja lo desconocido", () => {
    expect(rellenar("Hola {usuario} en {servidor} ({otro})", { usuario: "@Ana", servidor: "Mi mundo" })).toBe("Hola @Ana en Mi mundo ({otro})");
  });
  it("la XP crece como en MEE6 y puede subir varios niveles", () => {
    expect(xpParaSubir(0)).toBe(100);
    expect(xpParaSubir(1)).toBe(155);
    expect(sumarXp(0, 90, 20)).toEqual({ nivel: 1, xp: 10, subio: true });
    expect(sumarXp(0, 0, 10)).toEqual({ nivel: 0, xp: 10, subio: false });
    expect(sumarXp(0, 0, 100 + 155 + 5).nivel).toBe(2);
  });
});

describe("filtros de moderación", () => {
  it("enlaces: permite los dominios de la lista y sus subdominios", () => {
    const ok = ["youtube.com", "twitch.tv"];
    expect(enlaceNoPermitido("mira https://www.youtube.com/watch?v=1", ok)).toBeNull();
    expect(enlaceNoPermitido("mira https://clips.twitch.tv/x", ok)).toBeNull();
    expect(enlaceNoPermitido("sigue a https://evil.com/youtube.com", ok)).toBe("https://evil.com/youtube.com");
    expect(enlaceNoPermitido("únete discord.gg/abc", ok)).toBe("discord.gg/abc");
    expect(enlaceNoPermitido("sin enlaces aquí", [])).toBeNull();
    expect(enlaceNoPermitido("youtube.com.malo.net", ["youtube.com"])).toBeNull();
  });
  it("palabras: sin importar mayúsculas ni acentos, solo palabras completas", () => {
    expect(palabraProhibida("Eres un IDIOTA!!", ["idiota"])).toBe("idiota");
    expect(palabraProhibida("qué canción", ["cancion"])).toBe("cancion");
    expect(palabraProhibida("clasificado", ["asi"])).toBeNull();
    expect(palabraProhibida("todo bien", ["idiota"])).toBeNull();
  });
  it("anti-spam: cuenta los mensajes de la ventana", () => {
    let marcas: number[] = [];
    let excede = false;
    for (let i = 0; i < 6; i++) ({ excede, marcas } = revisarSpam(marcas, 1000 + i * 500, 5, 6));
    expect(excede).toBe(true);
    // Pasado un rato la cuenta se reinicia.
    expect(revisarSpam(marcas, 60_000, 5, 6).excede).toBe(false);
  });
});

describe("invitación", () => {
  it("pide permisos concretos (no Administrador)", () => {
    const u = new URL(enlaceInvitacion("123456789012345678"));
    expect(u.searchParams.get("client_id")).toBe("123456789012345678");
    expect(u.searchParams.get("scope")).toBe("bot applications.commands");
    const p = BigInt(u.searchParams.get("permissions")!);
    expect(p & 8n).toBe(0n);
    expect(p & (1n << 40n)).not.toBe(0n);
    expect(p & (1n << 2n)).not.toBe(0n);
  });
});
