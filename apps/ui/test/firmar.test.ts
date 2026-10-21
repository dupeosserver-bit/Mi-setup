import { describe, expect, it } from "vitest";
import { aCoordenadasPdf } from "../src/components/FirmarDocumento";

describe("firmar: posición en el PDF", () => {
  it("pasa de arriba-izquierda (pantalla) a abajo-izquierda (PDF)", () => {
    // Carta: 612 × 792 pt. Firma 3:1 al 50 % del ancho, arriba a la izquierda.
    expect(aCoordenadasPdf({ x: 0, y: 0, ancho: 0.5 }, 612, 792, 3)).toEqual({ x: 0, y: 792 - 102, width: 306, height: 102 });
    const abajo = aCoordenadasPdf({ x: 0.5, y: 0.9, ancho: 0.25 }, 612, 792, 3);
    expect(abajo.x).toBe(306);
    expect(abajo.y).toBeCloseTo(792 - 0.9 * 792 - 51);
  });
});
