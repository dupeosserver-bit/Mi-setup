import { preferenciasSchema } from "@mi-setup/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { descargarTextoSeguro } from "../src/modules/red-segura.js";

afterEach(() => vi.unstubAllGlobals());

/** Respuesta en trozos de 1 MB, como manda una tienda grande. */
function paginaGrande(megas: number) {
  const trozo = new Uint8Array(1_000_000).fill(97);
  let n = 0;
  return new Response(
    new ReadableStream({
      pull(c) {
        if (n++ < megas) c.enqueue(trozo);
        else c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/html" } },
  );
}

describe("0.11.3b · vigilar precios en tiendas grandes", () => {
  it("con «cortar» usa lo que alcanzó a leer en vez de fallar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => paginaGrande(6)));
    await expect(descargarTextoSeguro("http://93.184.216.34/producto")).rejects.toThrow("demasiado grande");
    const html = await descargarTextoSeguro("http://93.184.216.34/producto", { maxBytes: 10_000_000, cortar: true });
    expect(html.length).toBe(6_000_000);
    vi.stubGlobal("fetch", vi.fn(async () => paginaGrande(12)));
    const cortada = await descargarTextoSeguro("http://93.184.216.34/producto", { maxBytes: 10_000_000, cortar: true });
    expect(cortada.length).toBeGreaterThanOrEqual(10_000_000);
    expect(cortada.length).toBeLessThanOrEqual(11_000_000);
  });
});

describe("0.11.3b · letras más legibles", () => {
  it("las preferencias viejas siguen sirviendo y traen la lectura normal", () => {
    const p = preferenciasSchema.parse({ tema: "oscuro" });
    expect(p.lectura).toEqual({ contraste: "normal", color: "tema", sombra: false });
    expect(preferenciasSchema.safeParse({ lectura: { color: "morado" } }).success).toBe(false);
  });
});
