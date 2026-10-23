import { MODULES, pantallaBienvenida } from "@mi-setup/shared";
import { describe, expect, it } from "vitest";
import { NOVEDADES, VERSION_NOVEDADES } from "../src/components/QueHayDeNuevo";

describe("qué hay de nuevo", () => {
  it("la versión tiene números y etapa", () => {
    expect(VERSION_NOVEDADES).toMatch(/^\d+\.\d+\.\d+[ab]$/);
  });

  it("cada cambio apunta a un apartado que existe y no se repite", () => {
    for (const n of NOVEDADES) expect(MODULES[n.modulo]).toBeDefined();
    expect(new Set(NOVEDADES.map((n) => n.titulo)).size).toBe(NOVEDADES.length);
  });

  it("después de verla ya no vuelve a salir en esta versión", () => {
    expect(pantallaBienvenida({ tutorialVisto: true, novedadesVistas: "0.11.3b", version: VERSION_NOVEDADES })).toBe("novedades");
    expect(pantallaBienvenida({ tutorialVisto: true, novedadesVistas: VERSION_NOVEDADES, version: VERSION_NOVEDADES })).toBeNull();
  });
});
