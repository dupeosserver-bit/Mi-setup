import { describe, expect, it } from "vitest";
import { numerosDePagina } from "../src/components/Paginas";

describe("páginas", () => {
  it("muestra todas cuando son pocas", () => {
    expect(numerosDePagina(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("recorta con puntos cuando son muchas", () => {
    expect(numerosDePagina(6, 20)).toEqual([1, "…", 5, 6, 7, "…", 20]);
    expect(numerosDePagina(1, 20)).toEqual([1, 2, "…", 20]);
    expect(numerosDePagina(20, 20)).toEqual([1, "…", 19, 20]);
  });
});
