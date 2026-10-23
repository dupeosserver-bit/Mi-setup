import { describe, expect, it } from "vitest";
import { aplicarModificadores, FILA_1, FILA_2, filasValidas, secuenciaDe, TECLAS } from "../src/lib/teclasTerminal";

describe("barra de teclas de la terminal", () => {
  it("manda las teclas de navegación correctas", () => {
    expect(secuenciaDe("esc")).toBe("\x1b");
    expect(secuenciaDe("tab")).toBe("\t");
    expect(secuenciaDe("shift+tab")).toBe("\x1b[Z");
    expect(secuenciaDe("arriba")).toBe("\x1b[A");
    expect(secuenciaDe("izquierda")).toBe("\x1b[D");
    expect(secuenciaDe("del")).toBe("\x1b[3~");
    expect(secuenciaDe("pgDn")).toBe("\x1b[6~");
    expect(secuenciaDe("home")).toBe("\x1b[H");
  });

  it("manda F1 a F12", () => {
    expect(secuenciaDe("F1")).toBe("\x1bOP");
    expect(secuenciaDe("F5")).toBe("\x1b[15~");
    expect(secuenciaDe("F12")).toBe("\x1b[24~");
  });

  it("manda los atajos con control y los de tmux", () => {
    expect(secuenciaDe("ctrl+C")).toBe("\x03");
    expect(secuenciaDe("ctrl+L")).toBe("\x0c");
    expect(secuenciaDe("ctrl+B %")).toBe("\x02%");
    expect(secuenciaDe('ctrl+B "')).toBe('\x02"');
  });

  it("aplica ctrl y alt pegados", () => {
    expect(aplicarModificadores("c", { ctrl: true, alt: false })).toBe("\x03");
    expect(aplicarModificadores("x", { ctrl: false, alt: true })).toBe("\x1bx");
    expect(secuenciaDe("arriba", { ctrl: true, alt: false })).toBe("\x1b[1;5A");
    expect(secuenciaDe("|", { ctrl: false, alt: true })).toBe("\x1b|");
  });

  it("las filas por defecto solo tienen teclas conocidas", () => {
    for (const id of [...FILA_1, ...FILA_2]) expect(TECLAS[id]).toBeDefined();
    expect(filasValidas(["nada", "esc"], FILA_1)).toEqual(["esc"]);
    expect(filasValidas([], FILA_2)).toEqual(FILA_2);
  });
});
