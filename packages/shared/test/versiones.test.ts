import { describe, expect, it } from "vitest";
import { compararVersiones, versionDeArchivo, versionesRecientes } from "../src/versiones.js";

describe("versiones de las descargas", () => {
  it("lee la versión del nombre del archivo", () => {
    expect(versionDeArchivo("MiSetup-0.11.2b.apk")).toBe("0.11.2b");
    expect(versionDeArchivo("MiSetup Setup 0.11.1.exe")).toBe("0.11.1");
    expect(versionDeArchivo("MiSetup.apk")).toBeNull();
  });

  it("compara con la letra de etapa", () => {
    expect(compararVersiones("0.11.2b", "0.11.1")).toBe(1);
    expect(compararVersiones("0.11.2a", "0.11.2b")).toBe(1);
  });

  it("deja solo la nueva y las 2 anteriores de cada tipo", () => {
    const f = (nombre: string, tipo: string, dia: number) => ({ nombre, tipo, modificado: `2026-10-${String(dia).padStart(2, "0")}T00:00:00Z` });
    const archivos = [
      f("MiSetup-0.9.0b.apk", "android", 1),
      f("MiSetup-0.10.0b.apk", "android", 2),
      f("MiSetup-0.11.0b.apk", "android", 3),
      f("MiSetup-0.11.1.apk", "android", 4),
      f("MiSetup-0.11.2b.apk", "android", 5),
      f("MiSetup-0.11.1.exe", "windows", 4),
    ];
    const quedan = versionesRecientes(archivos).map((a) => a.nombre);
    expect(quedan).toEqual(["MiSetup-0.11.2b.apk", "MiSetup-0.11.1.apk", "MiSetup-0.11.1.exe", "MiSetup-0.11.0b.apk"]);
  });
});
