/**
 * Importar tu Excel de gastos: reconoce las columnas aunque se llamen distinto
 * (Fecha/Día, Monto/Importe/Cantidad, Categoría/Rubro, Concepto/Descripción,
 * Tipo, o columnas separadas de Gasto e Ingreso).
 */

export interface FilaImportada {
  tipo: "gasto" | "ingreso";
  monto: number;
  categoria: string;
  descripcion: string;
  fecha: string;
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function columna(claves: string[], opciones: RegExp): string | undefined {
  return claves.find((c) => opciones.test(sinAcentos(c)));
}

/** "1,234.50", "$ 1.234,50", "-300" o un número → número (null si no se entiende). */
export function leerMonto(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const negativo = s.startsWith("-") || /^\s*\(.*\)\s*$/.test(v);
  s = s.replace(/-/g, "");
  const ultimo = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (ultimo !== -1) {
    const decimales = s.length - ultimo - 1;
    s = decimales === 3 ? s.replace(/[.,]/g, "") : `${s.slice(0, ultimo).replace(/[.,]/g, "")}.${s.slice(ultimo + 1)}`;
  }
  const n = Number(s);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

/** Fecha de Excel (objeto Date, número de serie o texto dd/mm/aaaa o aaaa-mm-dd) → AAAA-MM-DD. */
export function leerFecha(v: unknown): string | null {
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return fmt(v);
  if (typeof v === "number" && v > 20000 && v < 80000) return fmt(new Date(Date.UTC(1899, 11, 30) + v * 86_400_000 + 12 * 3_600_000));
  if (typeof v !== "string") return null;
  const t = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  // En México el día va primero: 17/10/2026.
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) {
    const anio = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${anio}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

export function interpretarFilas(crudas: Record<string, unknown>[]): { filas: FilaImportada[]; omitidas: number } {
  if (!crudas.length) return { filas: [], omitidas: 0 };
  const claves = Object.keys(crudas[0]!);
  const cFecha = columna(claves, /^(fecha|dia|date|fec)/);
  const cMonto = columna(claves, /^(monto|importe|cantidad|total|valor|amount|precio)/);
  const cGasto = columna(claves, /^(gasto|egreso|cargo|salida|debe)/);
  const cIngreso = columna(claves, /^(ingreso|abono|entrada|haber)/);
  const cCategoria = columna(claves, /^(categoria|rubro|tipo de gasto|clasificacion|category)/);
  const cDescripcion = columna(claves, /^(concepto|descripcion|detalle|nota|description|movimiento)/);
  const cTipo = columna(claves, /^(tipo|type)$/);

  // Sin columna de tipo: si hay montos negativos, los negativos son gastos y los positivos ingresos;
  // si todos son positivos, se toman como gastos (lo más común en una lista de gastos).
  const hayNegativos = cMonto ? crudas.some((r) => (leerMonto(r[cMonto]) ?? 0) < 0) : false;

  const filas: FilaImportada[] = [];
  let omitidas = 0;
  for (const r of crudas) {
    const fecha = cFecha ? leerFecha(r[cFecha]) : null;
    let monto: number | null = null;
    let tipo: FilaImportada["tipo"] = "gasto";
    if (cMonto) {
      monto = leerMonto(r[cMonto]);
      const t = cTipo ? sinAcentos(String(r[cTipo] ?? "")) : "";
      if (t) tipo = t.startsWith("ing") || t.startsWith("entr") || t.startsWith("abon") ? "ingreso" : "gasto";
      else if (hayNegativos && monto !== null) tipo = monto < 0 ? "gasto" : "ingreso";
    } else {
      const g = cGasto ? leerMonto(r[cGasto]) : null;
      const i = cIngreso ? leerMonto(r[cIngreso]) : null;
      if (i) {
        monto = i;
        tipo = "ingreso";
      } else if (g) {
        monto = g;
        tipo = "gasto";
      }
    }
    if (!fecha || monto === null || monto === 0) {
      omitidas++;
      continue;
    }
    filas.push({
      tipo,
      monto: Math.round(Math.abs(monto) * 100) / 100,
      categoria: String((cCategoria && r[cCategoria]) || "Otros").trim().slice(0, 60) || "Otros",
      descripcion: String((cDescripcion && r[cDescripcion]) || "").trim().slice(0, 300),
      fecha,
    });
  }
  return { filas, omitidas };
}
