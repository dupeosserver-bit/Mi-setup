import { describe, expect, it } from "vitest";
import { PRODUCTOS_RENDIMIENTO, gananciaProducto, montoParaMeta, tasaEnTexto } from "../src/rendimientos.js";

const p = (id: string) => PRODUCTOS_RENDIMIENTO.find((x) => x.id === id)!;

describe("rendimientos", () => {
  it("todas las opciones pedidas están en el catálogo", () => {
    const nombres = PRODUCTOS_RENDIMIENTO.map((x) => x.institucion).join(" ");
    for (const n of ["Revolut", "BBVA", "Nu", "Ualá", "Coppel", "GBM", "CETES"]) expect(nombres).toContain(n);
    expect(new Set(PRODUCTOS_RENDIMIENTO.map((x) => x.id)).size).toBe(PRODUCTOS_RENDIMIENTO.length);
  });

  it("respeta el tope: arriba del tope gana la tasa base o nada", () => {
    const revolut = p("revolut");
    expect(gananciaProducto(revolut, 15, 50_000, "mes")).toBe(gananciaProducto(revolut, 15, 25_000, "mes"));
    const turbo = p("nu-turbo");
    expect(gananciaProducto(turbo, 13, 50_000, "mes")).toBeGreaterThan(gananciaProducto(turbo, 13, 25_000, "mes"));
  });

  it("calcula cuánto meter para una meta", () => {
    const cetes = p("cetes-28");
    const monto = montoParaMeta(cetes, 6, 500, "mes")!;
    expect(gananciaProducto(cetes, 6, monto, "mes")).toBeGreaterThanOrEqual(500);
    expect(gananciaProducto(cetes, 6, monto - 50, "mes")).toBeLessThan(500);
    // Con tope y sin tasa arriba, una meta muy alta no se alcanza.
    expect(montoParaMeta(p("revolut"), 15, 100_000, "mes")).toBeNull();
  });

  it("lee la tasa de una página", () => {
    expect(tasaEnTexto("<p>Cajita Turbo</p><b>13.5%</b> anual")).toBe(13.5);
    expect(tasaEnTexto("<p>24/7: rinde 6,50 % GAT</p>", "24/7")).toBe(6.5);
    expect(tasaEnTexto("<p>sin porcentaje</p>")).toBeNull();
    expect(tasaEnTexto("100% seguro")).toBeNull();
  });
});
