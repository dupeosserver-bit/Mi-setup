import { describe, expect, it } from "vitest";
import { interpretarFilas, leerFecha, leerMonto } from "../src/lib/finanzas";
import { esconderEnEmoji, revelarDeEmoji } from "../src/lib/emojis";
import { alternarCasilla } from "../src/lib/notas";

describe("importar Excel de finanzas", () => {
  it("lee montos y fechas en formatos comunes", () => {
    expect(leerMonto("$1,234.50")).toBe(1234.5);
    expect(leerMonto("1.234,50")).toBe(1234.5);
    expect(leerMonto("-300")).toBe(-300);
    expect(leerMonto(99)).toBe(99);
    expect(leerMonto("abc")).toBeNull();
    expect(leerFecha("17/10/2026")).toBe("2026-10-17");
    expect(leerFecha("2026-3-5")).toBe("2026-03-05");
    expect(leerFecha(46312)).toBe("2026-10-17");
  });

  it("reconoce columnas con otros nombres y el signo del monto", () => {
    const r = interpretarFilas([
      { Día: "01/03/2026", Importe: "-150", Rubro: "Comida", Concepto: "Tacos" },
      { Día: "02/03/2026", Importe: "5000", Rubro: "Sueldo", Concepto: "Quincena" },
      { Día: "", Importe: "10", Rubro: "x", Concepto: "sin fecha" },
    ]);
    expect(r.omitidas).toBe(1);
    expect(r.filas).toEqual([
      { tipo: "gasto", monto: 150, categoria: "Comida", descripcion: "Tacos", fecha: "2026-03-01" },
      { tipo: "ingreso", monto: 5000, categoria: "Sueldo", descripcion: "Quincena", fecha: "2026-03-02" },
    ]);
  });

  it("acepta columnas separadas de gasto e ingreso", () => {
    const r = interpretarFilas([
      { Fecha: "2026-01-02", Gasto: "200", Ingreso: "", Categoría: "Casa" },
      { Fecha: "2026-01-03", Gasto: "", Ingreso: "800", Categoría: "Ventas" },
    ]);
    expect(r.filas.map((f) => [f.tipo, f.monto])).toEqual([
      ["gasto", 200],
      ["ingreso", 800],
    ]);
  });
});

describe("emojis secretos", () => {
  it("esconde y revela texto y código con acentos", () => {
    const secreto = "¡Eres un tonto! 😜 <h1>hola</h1>";
    const emoji = esconderEnEmoji("😂", secreto);
    expect(emoji.startsWith("😂")).toBe(true);
    expect(revelarDeEmoji(emoji)).toBe(secreto);
    expect(revelarDeEmoji("😂")).toBeNull();
    expect(revelarDeEmoji("❤️")).toBeNull();
  });
});

describe("notas tipo Notion", () => {
  it("marca y desmarca la casilla correcta", () => {
    const t = "- [ ] uno\n- [x] dos\n  - [ ] tres";
    expect(alternarCasilla(t, 0)).toBe("- [x] uno\n- [x] dos\n  - [ ] tres");
    expect(alternarCasilla(t, 1)).toBe("- [ ] uno\n- [ ] dos\n  - [ ] tres");
    expect(alternarCasilla(t, 2)).toBe("- [ ] uno\n- [x] dos\n  - [x] tres");
  });
});
