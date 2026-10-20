import { describe, expect, it } from "vitest";
import { agregarIva, isrMensual, isrResico, quitarIva, repartir } from "../src/impuestos.js";

describe("impuestos", () => {
  it("IVA: agrega y quita el 16 %", () => {
    expect(agregarIva(100)).toEqual({ subtotal: 100, iva: 16, total: 116 });
    expect(quitarIva(116)).toEqual({ subtotal: 100, iva: 16, total: 116 });
    expect(quitarIva(108, 0.08).subtotal).toBe(100);
  });

  it("ISR mensual con la tarifa del art. 96", () => {
    expect(isrMensual(10000).isr).toBe(770.9);
    expect(isrMensual(500).isr).toBe(9.6);
    expect(isrMensual(0).isr).toBe(0);
    expect(isrMensual(400000).isr).toBe(126320.85);
  });

  it("RESICO por tramo y fuera de régimen", () => {
    expect(isrResico(20000)).toEqual({ isr: 200, tasa: 1 });
    expect(isrResico(60000)?.tasa).toBe(1.5);
    expect(isrResico(4000000)).toBeNull();
  });

  it("reparte en centavos exactos", () => {
    expect(repartir(269, 4)).toEqual([67.25, 67.25, 67.25, 67.25]);
    expect(repartir(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(repartir(100, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });
});
