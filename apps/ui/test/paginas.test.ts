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
  it("en el celular deja solo la página actual entre puntos", () => {
    expect(numerosDePagina(6, 20, 0)).toEqual([1, "…", 6, "…", 20]);
    expect(numerosDePagina(3, 5, 0)).toEqual([1, 2, 3, 4, 5]);
    expect(numerosDePagina(1, 9, 0)).toEqual([1, "…", 9]);
  });
});
