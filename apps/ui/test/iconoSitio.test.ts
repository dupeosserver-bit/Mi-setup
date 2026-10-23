import { describe, expect, it } from "vitest";
import { avisoTamano, recorteCuadrado, revisarArchivoIcono } from "../src/lib/iconoSitio";

describe("ícono del sitio", () => {
  it("solo acepta JPG o PNG de hasta 10 MB", () => {
    expect(revisarArchivoIcono({ type: "image/png", size: 1000 }).ok).toBe(true);
    expect(revisarArchivoIcono({ type: "image/jpeg", size: 1000 }).ok).toBe(true);
    expect(revisarArchivoIcono({ type: "image/gif", size: 1000 }).ok).toBe(false);
    expect(revisarArchivoIcono({ type: "image/png", size: 11 * 1024 * 1024 }).ok).toBe(false);
  });

  it("recorta al centro y avisa si es chica o no es cuadrada", () => {
    expect(recorteCuadrado(1200, 800)).toEqual({ x: 200, y: 0, lado: 800 });
    expect(recorteCuadrado(600, 900)).toEqual({ x: 0, y: 150, lado: 600 });
    expect(avisoTamano(256, 256)).toContain("borrosa");
    expect(avisoTamano(1200, 800)).toContain("recortamos");
    expect(avisoTamano(1024, 1024)).toBeUndefined();
  });
});
