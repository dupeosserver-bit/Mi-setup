import { describe, expect, it } from "vitest";
import { can, effectiveLevel, sanitizePermissionMap, type PermissionSubject } from "../src/index.js";

const maestra: PermissionSubject = { role: "maestra", isActive: true, permissions: {} };
const usuario: PermissionSubject = {
  role: "usuario",
  isActive: true,
  permissions: { notas: "escritura", pterodactyl: "lectura", boveda: "administrar" },
};

describe("permisos por módulo", () => {
  it("la cuenta maestra puede todo, incluidos módulos solo-maestra", () => {
    expect(can(maestra, "boveda", "administrar")).toBe(true);
    expect(can(maestra, "vps_terminal", "administrar")).toBe(true);
  });

  it("un usuario sin asignación no tiene acceso (denegar por defecto)", () => {
    expect(can(usuario, "finanzas", "lectura")).toBe(false);
    expect(effectiveLevel(usuario, "finanzas")).toBe("ninguno");
  });

  it("los niveles son acumulativos", () => {
    expect(can(usuario, "notas", "lectura")).toBe(true);
    expect(can(usuario, "notas", "escritura")).toBe(true);
    expect(can(usuario, "notas", "administrar")).toBe(false);
    expect(can(usuario, "pterodactyl", "escritura")).toBe(false);
  });

  it("los módulos solo-maestra se niegan aunque haya asignación guardada", () => {
    expect(can(usuario, "boveda", "lectura")).toBe(false);
  });

  it("una cuenta desactivada no tiene acceso, ni siendo maestra", () => {
    expect(can({ ...maestra, isActive: false }, "notas", "lectura")).toBe(false);
  });

  it("sanitizePermissionMap quita módulos solo-maestra, desconocidos y nivel ninguno", () => {
    const entrada = { notas: "lectura", boveda: "administrar", chat: "ninguno", inventado: "lectura" };
    expect(sanitizePermissionMap(entrada as never)).toEqual({ notas: "lectura" });
  });
});
