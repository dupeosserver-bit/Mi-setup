import { describe, expect, it } from "vitest";
import { numerosDePagina } from "../src/components/Paginas";

describe("páginas", () => {
  it("muestra todas cuando son 5 o menos", () => {
    expect(numerosDePagina(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(numerosDePagina(1, 3)).toEqual([1, 2, 3]);
  });
  it("con muchas, siempre 5 alrededor de la actual", () => {
    expect(numerosDePagina(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(numerosDePagina(8, 20)).toEqual([6, 7, 8, 9, 10]);
    expect(numerosDePagina(20, 20)).toEqual([16, 17, 18, 19, 20]);
  });
});
