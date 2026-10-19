import { describe, expect, it } from "vitest";
import { compararVersiones } from "../src/components/Actualizaciones";

describe("compararVersiones", () => {
  it("compara los números primero", () => {
    expect(compararVersiones("0.10.0", "0.9.3")).toBe(1);
    expect(compararVersiones("0.9.0b", "0.10.0b")).toBe(-1);
    expect(compararVersiones("1.0.0", "1.0.0")).toBe(0);
  });

  it("la beta (b) va antes que la pública (a)", () => {
    expect(compararVersiones("0.9.0a", "0.9.0b")).toBe(1);
    expect(compararVersiones("0.9.0b", "0.9.0a")).toBe(-1);
    expect(compararVersiones("0.9.0b", "0.9.0b")).toBe(0);
  });

  it("sin letra cuenta como pública (versiones viejas del celular)", () => {
    expect(compararVersiones("0.9.0b", "0.7.0")).toBe(1);
    expect(compararVersiones("0.9.0", "0.9.0b")).toBe(1);
  });
});
