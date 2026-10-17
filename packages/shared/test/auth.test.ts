import { describe, expect, it } from "vitest";
import { loginRequestSchema, reauthSatisfies } from "../src/index.js";

const ahora = new Date("2026-03-01T12:00:00Z");
const hace = (min: number) => new Date(ahora.getTime() - min * 60 * 1000);

describe("reautenticación", () => {
  it("vale 5 minutos", () => {
    expect(reauthSatisfies({ reauthAt: hace(4), reauthMethod: "password" }, "fuerte", ahora)).toBe(true);
    expect(reauthSatisfies({ reauthAt: hace(6), reauthMethod: "password" }, "fuerte", ahora)).toBe(false);
    expect(reauthSatisfies({ reauthAt: null, reauthMethod: null }, "pin", ahora)).toBe(false);
  });

  it("el PIN no basta para acciones fuertes; contraseña y biometría sí", () => {
    expect(reauthSatisfies({ reauthAt: hace(1), reauthMethod: "pin" }, "pin", ahora)).toBe(true);
    expect(reauthSatisfies({ reauthAt: hace(1), reauthMethod: "pin" }, "fuerte", ahora)).toBe(false);
    expect(reauthSatisfies({ reauthAt: hace(1), reauthMethod: "biometria" }, "fuerte", ahora)).toBe(true);
  });
});

describe("loginRequestSchema", () => {
  it("normaliza el correo y trata el código vacío como ausente", () => {
    const datos = loginRequestSchema.parse({ email: "  Yo@X.Test ", password: "x", totp: "", dispositivo: "" });
    expect(datos).toEqual({ email: "yo@x.test", password: "x" });
  });
});
