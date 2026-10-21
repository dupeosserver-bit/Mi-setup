import { describe, expect, it } from "vitest";
import { enEsquina, esFormaPropia, figura, svgQr } from "../src/lib/qrFormas";

describe("formas del QR", () => {
  it("reconoce las formas propias", () => {
    expect(esFormaPropia("rombo")).toBe(true);
    expect(esFormaPropia("dots")).toBe(false);
  });
  it("las esquinas de búsqueda se respetan", () => {
    expect(enEsquina(0, 0, 25)).toBe(true);
    expect(enEsquina(6, 24, 25)).toBe(true);
    expect(enEsquina(24, 24, 25)).toBe(false);
  });
  it("cada figura es un camino cerrado dentro de su casilla", () => {
    for (const f of ["rombo", "estrella", "corazon", "hexagono", "cruz", "gota"] as const) {
      const d = figura(f, 10, 10, 10);
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
    }
  });
  it("arma un SVG con fondo, puntos y los 3 cuadros", () => {
    const svg = svgQr("https://setup.mexicanland.net", 300, { forma: "estrella", color: "#000000", color2: "#ff0000", fondo: "#ffffff", esquinas: "dot", logo: null });
    expect(svg).toContain("<svg");
    expect(svg).toContain("linearGradient");
    expect(svg.match(/fill-rule="evenodd"/g)).toHaveLength(3);
  });
});
