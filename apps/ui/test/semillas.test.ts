import { describe, expect, it } from "vitest";
import { agregarAlHistorial, mitades, semillaDeTexto, versionMotor } from "../src/lib/semillas";

describe("semillas de Minecraft", () => {
  it("convierte el texto como Minecraft (número o hashCode)", () => {
    expect(semillaDeTexto("12345")).toBe(12345n);
    expect(semillaDeTexto("-4172144997902289642")).toBe(-4172144997902289642n);
    // "Hola".hashCode() en Java = 2255068
    expect(semillaDeTexto("Hola")).toBe(2255068n);
    expect(semillaDeTexto("99999999999999999999")).toBe(BigInt((() => { let h = 0; for (const c of "99999999999999999999") h = (Math.imul(31, h) + c.charCodeAt(0)) | 0; return h; })()));
  });

  it("parte la semilla en dos mitades de 32 bits", () => {
    expect(mitades(1n)).toEqual([1, 0]);
    expect(mitades(-1n)).toEqual([-1, -1]);
  });

  it("elige la versión del motor", () => {
    expect(versionMotor("1.20.1")).toBe(25);
    expect(versionMotor("1.21.1")).toBe(26);
    expect(versionMotor("1.21.4")).toBe(28);
    expect(versionMotor("1.18.2")).toBe(22);
  });

  it("el historial guarda solo las últimas 10, sin repetir", () => {
    let h: { semilla: string; texto: string; version: number; fecha: string }[] = [];
    for (let i = 0; i < 12; i++) h = agregarAlHistorial(h, { semilla: String(i), texto: String(i), version: 25, fecha: "" });
    h = agregarAlHistorial(h, { semilla: "5", texto: "5", version: 25, fecha: "" });
    expect(h).toHaveLength(10);
    expect(h[0]!.semilla).toBe("5");
    expect(h.filter((s) => s.semilla === "5")).toHaveLength(1);
  });
});

describe("motor de semillas (Cubiomes en WebAssembly)", () => {
  it("da biomas, nombres, colores, aldeas y punto de aparición", async () => {
    const { MotorSemilla } = await import("../src/lib/semillas");
    const m = await MotorSemilla.crear(12345n, 25, 0);
    const b = m.biomas(-8, -8, 16, 16, 16);
    expect(b).toHaveLength(256);
    expect(m.nombreBioma(1)).toBe("plains");
    expect(m.color(0)).toEqual([0, 0, 112]);
    expect(b[0]).toBe(m.bioma(-8 * 16, -8 * 16));
    const aldeas = m.estructuras(5, -2000, -2000, 2000, 2000);
    expect(aldeas.length).toBeGreaterThan(0);
    for (const a of aldeas) expect(Math.abs(a.x)).toBeLessThanOrEqual(2000);
    expect(m.aparicion()).not.toBeNull();
  });
});
