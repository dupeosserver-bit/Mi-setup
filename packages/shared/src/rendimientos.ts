/**
 * Mis finanzas → Rendimientos: opciones para que tu dinero gane en México.
 * Cada producto tiene su fuente oficial; el servidor intenta actualizar la
 * tasa cada día (Banxico para CETES, página oficial para los demás). Si no
 * puede, se queda la última conocida con su fecha y se avisa.
 *
 * `referencia` es el último dato revisado a mano (con fecha y de dónde salió);
 * solo se usa mientras no haya uno más nuevo.
 */
import { gananciaEn } from "./finanzas.js";

export type TipoRendimiento = "cuenta" | "plazo" | "gobierno" | "fondo";

export interface ProductoRendimiento {
  id: string;
  institucion: string;
  producto: string;
  tipo: TipoRendimiento;
  /** Paga cada día y se reinvierte solo (true) o interés simple al vencimiento (false). */
  compuesto: boolean;
  liquidez: string;
  condiciones: string;
  /** Monto máximo que gana la tasa principal (null = sin tope). */
  tope: number | null;
  /** Tasa anual (%) para lo que pasa del tope (null = no gana nada arriba del tope). */
  tasaArribaDelTope: number | null;
  minimo: number;
  proteccion: string;
  url: string;
  /** Serie del SIE de Banxico (solo CETES). */
  serieBanxico?: string;
  /** Texto que va justo antes del % en la página oficial (para leerlo solo). */
  patron?: string;
  referencia: { tasa: number; fecha: string; fuente: string } | null;
}

export const PRODUCTOS_RENDIMIENTO: readonly ProductoRendimiento[] = [
  {
    id: "cetes-28",
    institucion: "CETES (Gobierno de México)",
    producto: "CETES a 28 días",
    tipo: "gobierno",
    compuesto: false,
    liquidez: "Al vencer (28 días); se puede reinvertir solo",
    condiciones: "Desde $100 en cetesdirecto.com. Se descuenta ISR.",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 100,
    proteccion: "Respaldado por el Gobierno Federal",
    url: "https://www.cetesdirecto.com",
    serieBanxico: "SF43936",
    referencia: { tasa: 6.01, fecha: "2026-10-01", fuente: "Subasta primaria (Banxico) vía Rankia" },
  },
  {
    id: "cetes-91",
    institucion: "CETES (Gobierno de México)",
    producto: "CETES a 91 días",
    tipo: "gobierno",
    compuesto: false,
    liquidez: "Al vencer (91 días)",
    condiciones: "Desde $100 en cetesdirecto.com. Se descuenta ISR.",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 100,
    proteccion: "Respaldado por el Gobierno Federal",
    url: "https://www.cetesdirecto.com",
    serieBanxico: "SF43939",
    referencia: null,
  },
  {
    id: "cetes-364",
    institucion: "CETES (Gobierno de México)",
    producto: "CETES a 1 año",
    tipo: "gobierno",
    compuesto: false,
    liquidez: "Al vencer (364 días)",
    condiciones: "Desde $100 en cetesdirecto.com. Se descuenta ISR.",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 100,
    proteccion: "Respaldado por el Gobierno Federal",
    url: "https://www.cetesdirecto.com",
    serieBanxico: "SF43945",
    referencia: null,
  },
  {
    id: "nu-247",
    institucion: "Nu",
    producto: "Cajita 24/7",
    tipo: "cuenta",
    compuesto: true,
    liquidez: "Diaria (sacas cuando quieras)",
    condiciones: "Sin condiciones.",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 0,
    proteccion: "IPAB (Nu México es banco)",
    url: "https://nu.com.mx/cuenta/",
    patron: "24/7",
    referencia: { tasa: 6.5, fecha: "2026-10-15", fuente: "Comparadores públicos (Financera, Digitt)" },
  },
  {
    id: "nu-turbo",
    institucion: "Nu",
    producto: "Cajita Turbo",
    tipo: "cuenta",
    compuesto: true,
    liquidez: "Diaria",
    condiciones: "Hacer al menos 1 compra al mes con tu tarjeta Nu.",
    tope: 25_000,
    tasaArribaDelTope: 6.5,
    minimo: 0,
    proteccion: "IPAB (Nu México es banco)",
    url: "https://nu.com.mx/cuenta/",
    patron: "Turbo",
    referencia: { tasa: 13, fecha: "2026-10-15", fuente: "Comparadores públicos (Financera, Digitt)" },
  },
  {
    id: "mercadopago",
    institucion: "Mercado Pago",
    producto: "Dinero en cuenta",
    tipo: "cuenta",
    compuesto: true,
    liquidez: "Diaria",
    condiciones: "Tasa alta hasta el tope; arriba del tope, la tasa base.",
    tope: 25_000,
    tasaArribaDelTope: 6,
    minimo: 0,
    proteccion: "Prosofipo / regulado por CNBV",
    url: "https://www.mercadopago.com.mx/cuenta",
    referencia: { tasa: 13, fecha: "2026-10-15", fuente: "Comparador Investrack" },
  },
  {
    id: "uala-plus",
    institucion: "Ualá",
    producto: "Cuenta Ualá (Plus)",
    tipo: "cuenta",
    compuesto: true,
    liquidez: "Diaria",
    condiciones: "Consumos de unos $6,000 al mes con la tarjeta Ualá; tope $30,000.",
    tope: 30_000,
    tasaArribaDelTope: 6.75,
    minimo: 0,
    proteccion: "IPAB (ABC Capital)",
    url: "https://www.uala.mx/",
    referencia: { tasa: 15, fecha: "2026-10-15", fuente: "Comparadores públicos (Financera)" },
  },
  {
    id: "uala-basica",
    institucion: "Ualá",
    producto: "Cuenta Ualá (básica)",
    tipo: "cuenta",
    compuesto: true,
    liquidez: "Diaria",
    condiciones: "Sin condiciones.",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 0,
    proteccion: "IPAB (ABC Capital)",
    url: "https://www.uala.mx/",
    referencia: { tasa: 6.75, fecha: "2026-10-15", fuente: "Comparadores públicos (Financera)" },
  },
  {
    id: "revolut",
    institucion: "Revolut",
    producto: "Cuenta con rendimiento",
    tipo: "cuenta",
    compuesto: true,
    liquidez: "Diaria",
    condiciones: "Hasta $25,000. Plan gratis: 4 compras de $50 o más al mes (o plan Premium).",
    tope: 25_000,
    tasaArribaDelTope: null,
    minimo: 0,
    proteccion: "IPAB (Revolut es banco en México)",
    url: "https://www.revolut.com/es-MX/",
    referencia: { tasa: 15, fecha: "2026-10-15", fuente: "Comparadores públicos (Digitt, Promodescuentos)" },
  },
  {
    id: "klar",
    institucion: "Klar",
    producto: "Fondo de rendimiento",
    tipo: "cuenta",
    compuesto: true,
    liquidez: "Diaria",
    condiciones: "La tasa alta es para segmentos Plus/Platino; la básica (Light) ronda 3 %.",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 0,
    proteccion: "IPAB (Klar es banco)",
    url: "https://www.klar.mx/",
    referencia: { tasa: 15, fecha: "2026-10-15", fuente: "Comparadores públicos (Financera)" },
  },
  {
    id: "hey",
    institucion: "Hey Banco",
    producto: "Inversión Hey",
    tipo: "plazo",
    compuesto: false,
    liquidez: "Al plazo elegido",
    condiciones: "Desde $1,000. Hasta 7.5 % con Hey Pro.",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 1_000,
    proteccion: "IPAB (Banregio)",
    url: "https://heybanco.com/",
    referencia: { tasa: 7, fecha: "2026-10-15", fuente: "Comparadores públicos (Digitt)" },
  },
  {
    id: "bbva-cede",
    institucion: "BBVA",
    producto: "CEDE a 28 días",
    tipo: "plazo",
    compuesto: false,
    liquidez: "Al vencer (28 días)",
    condiciones: "Tasa publicada por BBVA; cambia cada mes.",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 1_000,
    proteccion: "IPAB",
    url: "https://www.bbva.mx/personas/productos/inversion.html",
    referencia: { tasa: 8.5, fecha: "2026-07-01", fuente: "Tasas publicadas por BBVA (julio 2026)" },
  },
  {
    id: "coppel",
    institucion: "BanCoppel",
    producto: "Inversión Creciente (12 meses)",
    tipo: "plazo",
    compuesto: false,
    liquidez: "Al vencer (12 meses)",
    condiciones: "Desde $2,500. Tasa base fija; puede haber premios aparte.",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 2_500,
    proteccion: "IPAB",
    url: "https://www.bancoppel.com/descubre-mas/inversion-creciente/",
    referencia: { tasa: 2, fecha: "2026-09-24", fuente: "Página oficial de BanCoppel" },
  },
  {
    id: "gbm-smartcash",
    institucion: "GBM",
    producto: "Smart Cash",
    tipo: "fondo",
    compuesto: true,
    liquidez: "Diaria",
    condiciones: "La tasa depende de cuánto tengas invertido en GBM (4.25 % a 5 %).",
    tope: null,
    tasaArribaDelTope: null,
    minimo: 0,
    proteccion: "Casa de bolsa (no es IPAB)",
    url: "https://gbm.com/faqs/cual-es-la-tasa-de-rendimiento-de-smart-cash/",
    referencia: { tasa: 4.25, fecha: "2026-10-15", fuente: "Página oficial de GBM" },
  },
];

export type Periodo = "semana" | "mes" | "anio";

export interface TasaVigente {
  id: string;
  tasa: number | null;
  fecha: string | null;
  fuente: string;
  /** actualizada = se leyó hoy · referencia = último dato revisado · manual = la escribiste tú · sin-dato */
  estado: "actualizada" | "referencia" | "manual" | "sin-dato";
  aviso?: string;
}

/** Ganancia en el periodo con `monto`, respetando el tope de la tasa principal. */
export function gananciaProducto(p: Pick<ProductoRendimiento, "tope" | "tasaArribaDelTope" | "compuesto" | "minimo">, tasa: number, monto: number, periodo: Periodo): number {
  if (monto < p.minimo) return 0;
  const dentro = p.tope === null ? monto : Math.min(monto, p.tope);
  const fuera = monto - dentro;
  return Math.round((gananciaEn(dentro, tasa, periodo, p.compuesto) + (fuera > 0 && p.tasaArribaDelTope ? gananciaEn(fuera, p.tasaArribaDelTope, periodo, p.compuesto) : 0)) * 100) / 100;
}

/**
 * Cuánto hay que meter para ganar `meta` en el periodo (con tope incluido).
 * null si con ese producto no se puede (ej. tope sin tasa arriba).
 */
export function montoParaMeta(p: Pick<ProductoRendimiento, "tope" | "tasaArribaDelTope" | "compuesto" | "minimo">, tasa: number, meta: number, periodo: Periodo): number | null {
  if (meta <= 0 || tasa <= 0) return null;
  const maximo = p.tope !== null && !p.tasaArribaDelTope ? p.tope : 1e12;
  if (gananciaProducto(p, tasa, maximo, periodo) < meta) return null;
  let bajo = 0;
  let alto = maximo;
  for (let i = 0; i < 80; i++) {
    const medio = (bajo + alto) / 2;
    if (gananciaProducto(p, tasa, medio, periodo) >= meta) alto = medio;
    else bajo = medio;
  }
  return Math.max(p.minimo, Math.ceil(alto));
}

/** Busca el porcentaje en el texto de una página: "13.5 %" cerca del patrón (o el primero razonable). */
export function tasaEnTexto(texto: string, patron?: string): number | null {
  const limpio = texto.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  let zona = limpio;
  if (patron) {
    const i = limpio.toLowerCase().indexOf(patron.toLowerCase());
    if (i < 0) return null;
    zona = limpio.slice(i, i + 400);
  }
  const m = /(\d{1,2}(?:[.,]\d{1,2})?)\s?%/.exec(zona);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  return n > 0 && n < 40 ? n : null;
}
