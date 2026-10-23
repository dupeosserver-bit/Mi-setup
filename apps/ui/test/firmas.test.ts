import { describe, expect, it } from "vitest";
import { LETRAS_FIRMA, TINTAS, primerNombre } from "../src/lib/firmas";

describe("firma escrita", () => {
  it("usa el primer nombre de la cuenta", () => {
    expect(primerNombre("Yahir Antonio Reyes Lara")).toBe("Yahir");
    expect(primerNombre("  Ana ")).toBe("Ana");
    expect(primerNombre(null)).toBe("");
  });
  it("trae 3 letras de firma y 3 tintas", () => {
    expect(Object.keys(LETRAS_FIRMA)).toHaveLength(3);
    expect(TINTAS).toHaveLength(3);
  });
});
