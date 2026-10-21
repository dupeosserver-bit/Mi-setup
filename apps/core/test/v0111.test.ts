import { esModeloElegible, isStrongReauthMethod } from "@mi-setup/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asegurarDnsDeSitio } from "../src/modules/cloudflare.js";
import { promptDeConversacion } from "../src/modules/ia/agentes-vps.js";
import { leerExtensiones } from "../src/modules/ptero-admin.js";

afterEach(() => vi.unstubAllGlobals());

const deps = (token?: string) => ({ config: { env: { CLOUDFLARE_API_TOKEN: token, APP_HOST: "setup.ejemplo.net", DOMAIN: "ejemplo.net" } } }) as never;

/** Cloudflare simulado: zonas, registros por nombre y los POST que se hicieron. */
function cloudflare(registros: Record<string, { type: string; content: string }[]>) {
  const creados: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { status: 200 });
      if (u.pathname.endsWith("/zones")) return ok([{ id: "z1", name: "ejemplo.net", status: "active" }]);
      if (init?.method === "POST") {
        creados.push(JSON.parse(String(init.body)));
        return ok({ id: "nuevo" });
      }
      const nombre = u.searchParams.get("name") ?? "";
      return ok((registros[nombre] ?? []).map((r, i) => ({ id: `r${i}`, name: nombre, ...r })));
    }),
  );
  return creados;
}

describe("DNS de los sitios al publicar", () => {
  it("sin token de Cloudflare no hace nada", async () => {
    expect(await asegurarDnsDeSitio(deps(), "tienda.ejemplo.net")).toBe("sin_token");
  });

  it("crea el registro A del sitio hacia la IP del VPS si no existe", async () => {
    const creados = cloudflare({ "setup.ejemplo.net": [{ type: "A", content: "203.0.113.7" }] });
    expect(await asegurarDnsDeSitio(deps("tok"), "tienda.ejemplo.net")).toBe("creado");
    expect(creados).toEqual([expect.objectContaining({ type: "A", name: "tienda.ejemplo.net", content: "203.0.113.7", proxied: false, comment: "Mi Setup (sitios)" })]);
  });

  it("no duplica: si ya existe el registro o lo cubre el comodín, no crea nada", async () => {
    const creados = cloudflare({ "tienda.ejemplo.net": [{ type: "A", content: "203.0.113.7" }], "*.ejemplo.net": [{ type: "A", content: "203.0.113.7" }] });
    expect(await asegurarDnsDeSitio(deps("tok"), "tienda.ejemplo.net")).toBe("existia");
    expect(await asegurarDnsDeSitio(deps("tok"), "otra.ejemplo.net")).toBe("comodin");
    expect(creados).toEqual([]);
  });
});

describe("Pterodactyl: extensiones de Blueprint", () => {
  it("lee la lista del script y oculta Blueprint mismo", () => {
    const salida = ["BP:1", "EXT|blueprint|Blueprint|beta||", "EXT|serverbackgrounds|Server Backgrounds|1.2|Ivy", "EXT|mal id!|x|||", "basura"].join("\n");
    expect(leerExtensiones(salida)).toEqual({ blueprint: true, extensiones: [{ id: "serverbackgrounds", nombre: "Server Backgrounds", version: "1.2", autor: "Ivy" }] });
    expect(leerExtensiones("BP:0\n").blueprint).toBe(false);
  });
});

describe("agentes del VPS como IA", () => {
  it("arma la conversación en un solo texto y recorta lo más viejo si es enorme", () => {
    const p = promptDeConversacion("Eres el asistente.", [
      { role: "user", content: [{ type: "text", text: "Hola" }] },
      { role: "assistant", content: [{ type: "text", text: "¿Qué tal?" }] },
      { role: "user", content: [{ type: "text", text: "¿Cómo reinicio Caddy?" }, { type: "image" }] },
    ]);
    expect(p).toContain("Usuario:\nHola");
    expect(p).toContain("Asistente:\n¿Qué tal?");
    expect(p).toContain("[archivo adjunto: este agente no lo recibe]");
    expect(p.endsWith("explica los pasos.")).toBe(true);
    const largo = promptDeConversacion("x", [{ role: "user", content: [{ type: "text", text: "a".repeat(200_000) }] }]);
    expect(largo.length).toBe(80_000);
  });

  it("solo acepta modelos conocidos, modelos de Ollama y los agentes del catálogo", () => {
    expect(esModeloElegible("claude-sonnet-5-5")).toBe(true);
    expect(esModeloElegible("ollama:qwen2.5-coder:7b")).toBe(true);
    expect(esModeloElegible("agente:claude-code")).toBe(true);
    expect(esModeloElegible("agente:rm -rf")).toBe(false);
    expect(esModeloElegible("ollama:a b")).toBe(false);
  });
});

describe("confirmación con PIN", () => {
  it("el PIN cuenta como confirmación fuerte (igual que contraseña o huella)", () => {
    expect(isStrongReauthMethod("pin")).toBe(true);
    expect(isStrongReauthMethod("password")).toBe(true);
    expect(isStrongReauthMethod("biometria")).toBe(true);
  });
});
