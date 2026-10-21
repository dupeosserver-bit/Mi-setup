import { describe, expect, it } from "vitest";
import { capitalNecesario, gananciaEn, gruposTendencia, repartirPorPorcentaje, semanaDe } from "../src/finanzas.js";

describe("finanzas compartidas", () => {
  it("la semana va de lunes a domingo", () => {
    // 21 de octubre de 2026 es miércoles.
    expect(semanaDe("2026-10-21")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(semanaDe("2026-10-25")[0]).toBe("2026-10-19");
    expect(semanaDe("2026-10-26")[0]).toBe("2026-10-26");
  });

  it("agrupa la tendencia por día, semana o mes", () => {
    expect(gruposTendencia("2026-10-21", "30d")).toHaveLength(30);
    expect(gruposTendencia("2026-10-21", "30d").at(-1)!.clave).toBe("2026-10-21");
    const meses = gruposTendencia("2026-10-21", "12m");
    expect(meses[0]!.clave).toBe("2025-11");
    expect(meses.at(-1)).toEqual({ clave: "2026-10", desde: "2026-10-01", hasta: "2026-10-31" });
    expect(gruposTendencia("2026-10-21", "90d").at(-1)!.desde).toBe("2026-10-19");
  });

  it("reparte por porcentaje sin perder centavos", () => {
    expect(repartirPorPorcentaje(590, [50, 25, 25])).toEqual([295, 147.5, 147.5]);
    const r = repartirPorPorcentaje(100, [33.33, 33.33, 33.34]);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });

  it("calcula cuánto meter para ganar una meta", () => {
    // 15 % anual: para ganar 1000 al mes hacen falta unos 80 mil.
    const capital = capitalNecesario(1000, 15, "mes");
    expect(capital).toBeGreaterThan(79_000);
    expect(capital).toBeLessThan(82_000);
    expect(gananciaEn(capital, 15, "mes")).toBeCloseTo(1000, 0);
    expect(capitalNecesario(100, 0, "mes")).toBe(0);
  });
});
