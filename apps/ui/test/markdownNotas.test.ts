import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", () => ({ API_BASE: "https://setup.ejemplo.net" }));

const { fondoNota, quitarAdjunto, renderMarkdown } = await import("../src/lib/markdownNotas");

describe("notas con estilo Discord", () => {
  it("negrita, cursiva y tachado como en Discord", () => {
    const h = renderMarkdown("**hola** *amigo* ~~no~~");
    expect(h).toContain("<strong>hola</strong>");
    expect(h).toContain("<em>amigo</em>");
    expect(h).toContain("<del>no</del>");
  });

  it("__subrayado__ es subrayado (no negrita)", () => {
    const h = renderMarkdown("esto es __importante__ ok");
    expect(h).toContain("<u>importante</u>");
    expect(h).not.toContain("<strong>importante</strong>");
  });

  it("||spoiler|| se esconde y puede llevar formato adentro", () => {
    const h = renderMarkdown("la clave es ||**1234**||");
    expect(h).toContain('<span class="spoiler" data-spoiler>');
    expect(h).toContain("<strong>1234</strong>");
  });

  it("-# texto pequeño y las casillas conservan su número", () => {
    expect(renderMarkdown("-# letra chica")).toContain('<p class="texto-pequeno">letra chica</p>');
    const h = renderMarkdown("- [ ] uno\n- [x] dos");
    expect(h).toContain('data-casilla="0"');
    expect(h).toContain('data-casilla="1" checked');
  });

  it("una lista normal con guion sigue siendo lista", () => {
    expect(renderMarkdown("- uno\n- dos")).toContain("<li>uno</li>");
  });

  it("quitarAdjunto borra la imagen o el enlace del archivo", () => {
    const ruta = "/api/notas/adjuntos/abc/firma.1";
    const texto = `hola\n![foto](${ruta})\nadiós [📎 doc](${ruta}) fin`;
    const salida = quitarAdjunto(texto, ruta);
    expect(salida).not.toContain(ruta);
    expect(salida).toContain("hola");
    expect(salida).toContain("adiós");
  });

  it("colores: solo los de la paleta", () => {
    expect(fondoNota("rojo")).toContain("239");
    expect(fondoNota("fucsia")).toBeUndefined();
    expect(fondoNota(null)).toBeUndefined();
  });
});
