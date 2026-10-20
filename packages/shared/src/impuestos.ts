/**
 * Calculadora de impuestos de México (orientativa, no sustituye a un contador).
 *
 * - IVA: agregar o quitar 16 %, 8 % (región fronteriza) o 0 %.
 * - ISR mensual de sueldos (tarifa del art. 96 LISR, Anexo 8 RMF 2025).
 * - RESICO personas físicas (tasas mensuales del art. 113-E LISR).
 *
 * Las tablas se publican cada año; si el SAT las cambia hay que actualizarlas aquí.
 */

export const TASAS_IVA = [0.16, 0.08, 0] as const;

const redondear = (n: number) => Math.round(n * 100) / 100;

/** De un precio sin IVA al total con IVA. */
export function agregarIva(subtotal: number, tasa = 0.16): { subtotal: number; iva: number; total: number } {
  const iva = redondear(subtotal * tasa);
  return { subtotal: redondear(subtotal), iva, total: redondear(subtotal + iva) };
}

/** De un total con IVA (lo que dice el ticket) a su subtotal e IVA. */
export function quitarIva(total: number, tasa = 0.16): { subtotal: number; iva: number; total: number } {
  const subtotal = redondear(total / (1 + tasa));
  return { subtotal, iva: redondear(total - subtotal), total: redondear(total) };
}

/** [límite inferior, cuota fija, % sobre el excedente] — tarifa mensual del art. 96. */
export const TARIFA_ISR_MENSUAL: readonly (readonly [number, number, number])[] = [
  [0.01, 0, 1.92],
  [746.05, 14.32, 6.4],
  [6332.06, 371.83, 10.88],
  [11128.02, 893.63, 16],
  [12935.83, 1182.88, 17.92],
  [15487.72, 1640.18, 21.36],
  [31236.5, 5004.12, 23.52],
  [49233.01, 9236.89, 30],
  [93993.91, 22665.17, 32],
  [125325.21, 32691.18, 34],
  [375975.62, 117912.32, 35],
];
export const ANIO_TARIFA_ISR = 2025;

/** ISR mensual de un sueldo (sin subsidio al empleo). */
export function isrMensual(ingreso: number): { isr: number; tasaEfectiva: number; neto: number; fila: number } {
  if (!(ingreso > 0)) return { isr: 0, tasaEfectiva: 0, neto: 0, fila: -1 };
  let fila = 0;
  for (let i = 0; i < TARIFA_ISR_MENSUAL.length; i++) if (ingreso >= TARIFA_ISR_MENSUAL[i]![0]) fila = i;
  const [limite, cuota, porcentaje] = TARIFA_ISR_MENSUAL[fila]!;
  const isr = redondear(cuota + (ingreso - limite) * (porcentaje / 100));
  return { isr, tasaEfectiva: redondear((isr / ingreso) * 100), neto: redondear(ingreso - isr), fila };
}

/** [hasta ingreso mensual, tasa %] — RESICO personas físicas. */
export const TASAS_RESICO_MENSUAL: readonly (readonly [number, number])[] = [
  [25000, 1],
  [50000, 1.1],
  [83333.33, 1.5],
  [208333.33, 2],
  [3500000, 2.5],
];

export function isrResico(ingresoMensual: number): { isr: number; tasa: number } | null {
  if (!(ingresoMensual > 0)) return { isr: 0, tasa: 0 };
  const fila = TASAS_RESICO_MENSUAL.find(([hasta]) => ingresoMensual <= hasta);
  // Más de 3.5 millones al año ya no se puede estar en RESICO.
  if (!fila) return null;
  return { isr: redondear(ingresoMensual * (fila[1] / 100)), tasa: fila[1] };
}

/** Reparte un monto entre personas en centavos exactos (la diferencia va a las primeras). */
export function repartir(total: number, personas: number): number[] {
  if (personas < 1) return [];
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / personas);
  const sobra = centavos - base * personas;
  return Array.from({ length: personas }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100);
}
