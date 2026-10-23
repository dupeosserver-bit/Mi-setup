export type Herramienta = "seleccionar" | "recortar" | "pincel" | "borrador" | "texto" | "rectangulo" | "circulo" | "triangulo" | "linea" | "cuentagotas" | "relleno" | "mano" | "zoom";

export const FORMAS: readonly Herramienta[] = ["rectangulo", "circulo", "triangulo", "linea"];

export const TAMANOS = [
  { n: "Cuadrado", w: 1080, h: 1080 },
  { n: "Vertical (TikTok, Reels)", w: 1080, h: 1920 },
  { n: "Horizontal", w: 1920, h: 1080 },
  { n: "Retrato", w: 1080, h: 1350 },
  { n: "Portada", w: 1200, h: 630 },
  { n: "Pequeño", w: 800, h: 600 },
] as const;

export const MEZCLAS: readonly [string, string][] = [
  ["source-over", "Normal"],
  ["multiply", "Multiplicar"],
  ["screen", "Trama"],
  ["overlay", "Superponer"],
  ["darken", "Oscurecer"],
  ["lighten", "Aclarar"],
  ["difference", "Diferencia"],
];

export const nombreMezcla = (valor: string | undefined): string => MEZCLAS.find(([v]) => v === (valor ?? "source-over"))?.[1] ?? "Normal";

export function hexARgb(hex: string): [number, number, number] {
  const limpio = hex.replace("#", "");
  const largo = limpio.length === 3 ? limpio.split("").map((c) => c + c).join("") : limpio.padEnd(6, "0").slice(0, 6);
  const n = Number.parseInt(largo, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorConOpacidad(hex: string, opacidad: number): string {
  const [r, g, b] = hexARgb(hex);
  const a = Math.min(1, Math.max(0, opacidad / 100));
  return `rgba(${r},${g},${b},${Math.round(a * 100) / 100})`;
}

export function desenfoqueDeDureza(grosor: number, dureza: number): number {
  const suave = 1 - Math.min(100, Math.max(0, dureza)) / 100;
  return Math.round(grosor * suave * 0.6 * 10) / 10;
}

export function siguienteZoom(actual: number, acercar: boolean): number {
  const pasos = [0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  if (acercar) return pasos.find((p) => p > actual + 0.001) ?? pasos[pasos.length - 1]!;
  return [...pasos].reverse().find((p) => p < actual - 0.001) ?? pasos[0]!;
}

export interface PasoHistorial {
  json: string;
  etiqueta: string;
}

export function agregarPaso(lista: readonly PasoHistorial[], posicion: number, paso: PasoHistorial, maximo = 40): { lista: PasoHistorial[]; posicion: number } {
  const nueva = [...lista.slice(0, posicion + 1), paso].slice(-maximo);
  return { lista: nueva, posicion: nueva.length - 1 };
}

export const medidaValida = (n: number): number => Math.min(6000, Math.max(16, Math.round(Number.isFinite(n) ? n : 1080)));
