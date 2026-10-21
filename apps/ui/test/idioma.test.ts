import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crearDiccionario, traducirTexto } from "../src/lib/idioma";

const leer = (l: string) => JSON.parse(readFileSync(new URL(`../src/i18n/${l}.json`, import.meta.url), "utf8")) as Record<string, string>;
const IDIOMAS = ["en", "pt", "fr", "de", "it"];

describe("idiomas", () => {
  it("traduce textos exactos y respeta los espacios de las orillas", () => {
    const dic = crearDiccionario({ Guardar: "Save", "Nuevo chat": "New chat" });
    expect(traducirTexto(dic, "Guardar")).toBe("Save");
    expect(traducirTexto(dic, "  Nuevo   chat ")).toBe("  New chat ");
    expect(traducirTexto(dic, "Mi nota")).toBeNull();
    expect(traducirTexto(dic, "123")).toBeNull();
  });

  it("traduce plantillas y lo que va en los huecos si lo conoce", () => {
    const dic = crearDiccionario({ "Opciones de {0}": "Options for {0}", "Subido {0} de {1}": "Uploaded {0} of {1}", Notas: "Notes" });
    expect(traducirTexto(dic, "Subido 3 de 10")).toBe("Uploaded 3 of 10");
    expect(traducirTexto(dic, "Opciones de Notas")).toBe("Options for Notes");
    expect(traducirTexto(dic, "Opciones de Mi servidor")).toBe("Options for Mi servidor");
  });

  it("los cinco diccionarios tienen las mismas claves y respetan los {n}", () => {
    const base = leer("en");
    for (const l of IDIOMAS) {
      const dic = leer(l);
      expect(Object.keys(dic).sort(), l).toEqual(Object.keys(base).sort());
      for (const [es, otro] of Object.entries(dic)) {
        expect(otro.trim(), `${l}: ${es}`).not.toBe("");
        expect((otro.match(/\{\d+\}/g) ?? []).sort(), `${l}: ${es}`).toEqual((es.match(/\{\d+\}/g) ?? []).sort());
      }
    }
    expect(Object.keys(base).length).toBeGreaterThan(3000);
  });
});
