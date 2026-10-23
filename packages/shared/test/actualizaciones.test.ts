import { describe, expect, it } from "vitest";
import {
  PREFERENCIAS_INICIALES,
  conservarBasicas,
  extraerBasicas,
  modoActualizacionEfectivo,
  pantallaBienvenida,
  puedeRechazarActualizaciones,
  type Preferencias,
} from "../src/index.js";

describe("actualizaciones", () => {
  it("todos pueden elegir cómo actualizar (también el dueño del VPS)", () => {
    expect(puedeRechazarActualizaciones(true)).toBe(true);
    expect(puedeRechazarActualizaciones(false)).toBe(true);
  });

  it("vinculado a un VPS respeta lo que eligió", () => {
    expect(modoActualizacionEfectivo("no", true)).toBe("no");
    expect(modoActualizacionEfectivo("preguntar", true)).toBe("preguntar");
  });

  it("sin VPS respeta lo elegido y usa auto si no hay nada válido", () => {
    expect(modoActualizacionEfectivo("no", false)).toBe("no");
    expect(modoActualizacionEfectivo("preguntar", false)).toBe("preguntar");
    expect(modoActualizacionEfectivo("otra", false)).toBe("auto");
    expect(modoActualizacionEfectivo(null, false)).toBe("auto");
  });
});

describe("qué hay de nuevo", () => {
  it("la primera vez sale el tutorial", () => {
    expect(pantallaBienvenida({ tutorialVisto: false, version: "0.11.4b" })).toBe("tutorial");
  });

  it("sale una vez por versión", () => {
    expect(pantallaBienvenida({ tutorialVisto: true, novedadesVistas: "0.11.3b", version: "0.11.4b" })).toBe("novedades");
    expect(pantallaBienvenida({ tutorialVisto: true, novedadesVistas: "0.11.4b", version: "0.11.4b" })).toBeNull();
    expect(pantallaBienvenida({ tutorialVisto: true, novedadesVistas: "0.11.3b", version: "0.11.4b", vistaEnEsteEquipo: true })).toBeNull();
  });
});

describe("cambiar de servidor", () => {
  const anteriores: Preferencias = {
    ...PREFERENCIAS_INICIALES,
    tema: "violeta",
    zoom: 120,
    idioma: "en",
    lectura: { contraste: "alto", color: "crema", sombra: true },
    terminal: { ...PREFERENCIAS_INICIALES.terminal, tema: "dracula", tamano: 16 },
    ia: { modelo: "claude-opus-5-5" },
    tutorialVisto: true,
  };
  const delOtro: Preferencias = { ...PREFERENCIAS_INICIALES, tema: "claro", ia: { modelo: "claude-haiku-5-5" }, tutorialVisto: false };

  it("se queda lo básico: apariencia, idioma, terminal y voz", () => {
    const r = conservarBasicas(delOtro, extraerBasicas(anteriores));
    expect(r.tema).toBe("violeta");
    expect(r.zoom).toBe(120);
    expect(r.idioma).toBe("en");
    expect(r.lectura.contraste).toBe("alto");
    expect(r.terminal.tema).toBe("dracula");
  });

  it("cambia lo que depende del servidor", () => {
    const r = conservarBasicas(delOtro, extraerBasicas(anteriores));
    expect(r.ia.modelo).toBe("claude-haiku-5-5");
    expect(r.tutorialVisto).toBe(false);
  });
});
