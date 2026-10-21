import { describe, expect, it } from "vitest";
import { CALIDADES, pasoTransicion, TRANSICIONES } from "../src/pages/EditorVideo";

describe("editor de video: transiciones y calidades", () => {
  it("cada transición empieza fuera y termina en su lugar", () => {
    for (const t of Object.keys(TRANSICIONES) as (keyof typeof TRANSICIONES)[]) {
      const fin = pasoTransicion(t, 1);
      expect(fin.alfa, t).toBe(1);
      expect(fin.dx, t).toBeCloseTo(0);
      expect(fin.dy, t).toBeCloseTo(0);
      expect(fin.escala, t).toBeCloseTo(1);
      expect(fin.recorte, t).toBeCloseTo(1);
    }
    expect(pasoTransicion("deslizar-izq", 0).dx).toBe(1);
    expect(pasoTransicion("barrido", 0).recorte).toBe(0);
    expect(pasoTransicion("negro", 0.5).velo?.alfa).toBe(1);
  });
  it("hay calidades de 480p a 4K", () => {
    expect(Object.keys(CALIDADES)).toEqual(["480", "720", "1080", "1440", "2160"]);
  });
});
