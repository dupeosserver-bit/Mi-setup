/** Cálculos de Mis finanzas que usan el servidor y la app. */

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const deTexto = (f: string) => new Date(`${f}T12:00:00Z`);

export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** Los 7 días (lunes a domingo) de la semana que contiene `fecha` (AAAA-MM-DD). */
export function semanaDe(fecha: string): string[] {
  const d = deTexto(fecha);
  const desdeLunes = (d.getUTCDay() + 6) % 7;
  const lunes = new Date(d.getTime() - desdeLunes * 86_400_000);
  return Array.from({ length: 7 }, (_, i) => fmt(new Date(lunes.getTime() + i * 86_400_000)));
}

export type PeriodoTendencia = "30d" | "90d" | "12m";

/** Grupos para la gráfica de línea: por día (30 días), por semana (90 días) o por mes (12 meses). */
export function gruposTendencia(hoy: string, periodo: PeriodoTendencia): { clave: string; desde: string; hasta: string }[] {
  const h = deTexto(hoy);
  if (periodo === "30d") {
    return Array.from({ length: 30 }, (_, i) => {
      const f = fmt(new Date(h.getTime() - (29 - i) * 86_400_000));
      return { clave: f, desde: f, hasta: f };
    });
  }
  if (periodo === "90d") {
    const lunes = semanaDe(hoy)[0]!;
    return Array.from({ length: 13 }, (_, i) => {
      const inicio = fmt(new Date(deTexto(lunes).getTime() - (12 - i) * 7 * 86_400_000));
      return { clave: inicio, desde: inicio, hasta: fmt(new Date(deTexto(inicio).getTime() + 6 * 86_400_000)) };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const m = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - (11 - i), 1));
    const fin = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
    return { clave: fmt(m).slice(0, 7), desde: fmt(m), hasta: fmt(fin) };
  });
}

/** Reparte un total por porcentajes (redondeo a centavos; lo que sobra va al primero). */
export function repartirPorPorcentaje(total: number, porcentajes: readonly number[]): number[] {
  const centavos = Math.round(total * 100);
  const partes = porcentajes.map((p) => Math.floor((centavos * p) / 100));
  const suma = porcentajes.reduce((a, p) => a + p, 0);
  if (Math.abs(suma - 100) < 0.001 && partes.length) partes[0]! += centavos - partes.reduce((a, p) => a + p, 0);
  return partes.map((c) => c / 100);
}

/**
 * Rendimientos: cuánto hay que meter para ganar `meta` en el periodo, con una
 * tasa anual (%) que paga cada día y se reinvierte (como Nu, Mercado Pago…).
 * Si `compuesto` es false, interés simple (CETES, pagarés).
 */
export function capitalNecesario(meta: number, tasaAnual: number, periodo: "semana" | "mes" | "anio", compuesto = true): number {
  if (meta <= 0 || tasaAnual <= 0) return 0;
  const dias = periodo === "semana" ? 7 : periodo === "mes" ? 30 : 365;
  const r = tasaAnual / 100;
  const factor = compuesto ? Math.pow(1 + r / 365, dias) - 1 : (r * dias) / 360;
  return Math.ceil((meta / factor) * 100) / 100;
}

/** Ganancia en el periodo con un monto dado (mismas reglas que capitalNecesario). */
export function gananciaEn(monto: number, tasaAnual: number, periodo: "semana" | "mes" | "anio", compuesto = true): number {
  if (monto <= 0 || tasaAnual <= 0) return 0;
  const dias = periodo === "semana" ? 7 : periodo === "mes" ? 30 : 365;
  const r = tasaAnual / 100;
  const factor = compuesto ? Math.pow(1 + r / 365, dias) - 1 : (r * dias) / 360;
  return Math.round(monto * factor * 100) / 100;
}
