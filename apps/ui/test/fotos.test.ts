import { describe, expect, it } from "vitest";
import { agregarPaso, colorConOpacidad, desenfoqueDeDureza, hexARgb, medidaValida, nombreMezcla, siguienteZoom } from "../src/lib/fotos";

describe("editor de fotos", () => {
  it("convierte colores y opacidad", () => {
    expect(hexARgb("#ff8000")).toEqual([255, 128, 0]);
    expect(hexARgb("#0f0")).toEqual([0, 255, 0]);
    expect(colorConOpacidad("#ff0000", 50)).toBe("rgba(255,0,0,0.5)");
    expect(colorConOpacidad("#000000", 140)).toBe("rgba(0,0,0,1)");
  });
  it("la dureza al 100 no difumina y al 0 difumina según el grosor", () => {
    expect(desenfoqueDeDureza(40, 100)).toBe(0);
    expect(desenfoqueDeDureza(40, 0)).toBe(24);
    expect(desenfoqueDeDureza(40, 50)).toBe(12);
  });
  it("el zoom salta por pasos y no se sale de los límites", () => {
    expect(siguienteZoom(0.5, true)).toBe(0.67);
    expect(siguienteZoom(0.5, false)).toBe(0.33);
    expect(siguienteZoom(4, true)).toBe(4);
    expect(siguienteZoom(0.05, false)).toBe(0.05);
  });
  it("el historial corta lo deshecho y guarda máximo 40", () => {
    const base = Array.from({ length: 5 }, (_, i) => ({ json: String(i), etiqueta: `p${i}` }));
    const r = agregarPaso(base, 2, { json: "x", etiqueta: "nuevo" });
    expect(r.lista.map((p) => p.json)).toEqual(["0", "1", "2", "x"]);
    expect(r.posicion).toBe(3);
    const largo = Array.from({ length: 40 }, (_, i) => ({ json: String(i), etiqueta: "" }));
    const r2 = agregarPaso(largo, 39, { json: "fin", etiqueta: "" });
    expect(r2.lista).toHaveLength(40);
    expect(r2.lista[0]!.json).toBe("1");
  });
  it("nombres de mezcla y medidas válidas", () => {
    expect(nombreMezcla("multiply")).toBe("Multiplicar");
    expect(nombreMezcla(undefined)).toBe("Normal");
    expect(medidaValida(9000)).toBe(6000);
    expect(medidaValida(3)).toBe(16);
    expect(medidaValida(Number.NaN)).toBe(1080);
  });
});
