/**
 * Semillas de Minecraft (Java): biomas y estructuras calculados en tu equipo
 * con Cubiomes compilado a WebAssembly (seedmaps-engine-wasm), el mismo método
 * que usan los visores de semillas. Nada sale de tu dispositivo.
 */

/** Versiones que entiende el motor (número interno → nombre). */
export const VERSIONES_SEMILLA = [
  { id: 28, nombre: "1.21.4 o más nueva" },
  { id: 27, nombre: "1.21.3" },
  { id: 26, nombre: "1.21 / 1.21.1" },
  { id: 25, nombre: "1.20 – 1.20.6" },
  { id: 24, nombre: "1.19.3 / 1.19.4" },
  { id: 23, nombre: "1.19 – 1.19.2" },
  { id: 22, nombre: "1.18" },
] as const;

/** Versión del motor que corresponde a una versión de Minecraft («1.20.1» → 25). */
export function versionMotor(mc: string): number {
  const [, menor = 0, parche = 0] = mc.split(".").map(Number);
  if (menor >= 22) return 28;
  if (menor === 21) return parche >= 4 ? 28 : parche === 3 ? 27 : 26;
  if (menor === 20) return 25;
  if (menor === 19) return parche >= 3 ? 24 : 23;
  return 22;
}

export const DIMENSIONES = [
  { id: 0, nombre: "Mundo normal" },
  { id: -1, nombre: "Nether" },
  { id: 1, nombre: "End" },
] as const;

/** Estructuras que se dibujan (id del motor → nombre y color del marcador). */
export const ESTRUCTURAS = [
  { id: 5, nombre: "Aldeas", letra: "A", color: "#f59e0b", dim: 0 },
  { id: 10, nombre: "Puestos de saqueadores", letra: "S", color: "#64748b", dim: 0 },
  { id: 1, nombre: "Templos del desierto", letra: "D", color: "#eab308", dim: 0 },
  { id: 2, nombre: "Templos de la selva", letra: "J", color: "#16a34a", dim: 0 },
  { id: 3, nombre: "Cabañas de bruja", letra: "B", color: "#7c3aed", dim: 0 },
  { id: 4, nombre: "Iglús", letra: "I", color: "#e0f2fe", dim: 0 },
  { id: 8, nombre: "Monumentos", letra: "M", color: "#0ea5e9", dim: 0 },
  { id: 9, nombre: "Mansiones", letra: "W", color: "#92400e", dim: 0 },
  { id: 13, nombre: "Ciudades antiguas", letra: "C", color: "#0f766e", dim: 0 },
  { id: 6, nombre: "Ruinas oceánicas", letra: "O", color: "#38bdf8", dim: 0 },
  { id: 7, nombre: "Naufragios", letra: "N", color: "#a16207", dim: 0 },
  { id: 11, nombre: "Portales en ruinas", letra: "P", color: "#a855f7", dim: 0 },
  { id: 23, nombre: "Ruinas de senderos", letra: "R", color: "#c2410c", dim: 0 },
  { id: 24, nombre: "Cámaras de prueba", letra: "T", color: "#b45309", dim: 0 },
  { id: 18, nombre: "Fortalezas del Nether", letra: "F", color: "#dc2626", dim: -1 },
  { id: 19, nombre: "Bastiones", letra: "B", color: "#1f2937", dim: -1 },
  { id: 12, nombre: "Portales en ruinas (Nether)", letra: "P", color: "#a855f7", dim: -1 },
  { id: 20, nombre: "Ciudades del End", letra: "E", color: "#f0abfc", dim: 1 },
] as const;

/** Semilla escrita → número de 64 bits (como Minecraft: si no es número, se usa el hashCode del texto). */
export function semillaDeTexto(texto: string): bigint {
  const t = texto.trim();
  if (/^-?\d{1,20}$/.test(t)) {
    const n = BigInt(t);
    if (n >= -(2n ** 63n) && n < 2n ** 63n) return n;
  }
  let h = 0;
  for (const c of t) {
    for (let i = 0; i < c.length; i++) h = (Math.imul(31, h) + c.charCodeAt(i)) | 0;
  }
  return BigInt(h);
}

/** Semilla al azar (64 bits con signo), como al crear un mundo. */
export function semillaAlAzar(): bigint {
  const b = crypto.getRandomValues(new Uint32Array(2));
  return BigInt.asIntN(64, (BigInt(b[0]!) << 32n) | BigInt(b[1]!));
}

/** Mitades de 32 bits para pasarlas al motor. */
export function mitades(semilla: bigint): [number, number] {
  const u = BigInt.asUintN(64, semilla);
  return [Number(u & 0xffffffffn) | 0, Number(u >> 32n) | 0];
}

interface ModuloMotor {
  _wasm_init(mc: number, dim: number, lo: number, hi: number): number;
  _wasm_get_biome(escala: number, x: number, y: number, z: number): number;
  _wasm_generate_biomes(x: number, z: number, sx: number, sz: number, escala: number, y: number, salida: number): number;
  _wasm_biome_name_ptr(mc: number, id: number): number;
  _wasm_biome_name_length(mc: number, id: number): number;
  _wasm_biome_colors(salida: number): number;
  _wasm_structure_pos(tipo: number, mc: number, lo: number, hi: number, rx: number, rz: number, salida: number): number;
  _wasm_structure_viable(tipo: number, x: number, z: number): number;
  _wasm_structure_region_size(tipo: number, mc: number): number;
  _wasm_create(mc: number, dim: number, lo: number, hi: number): number;
  _wasm_destroy(ctx: number): void;
  _wasm_ctx_get_spawn(ctx: number, salida: number): number;
  _malloc(n: number): number;
  _free(p: number): void;
  UTF8ToString(p: number, n?: number): string;
  HEAP32: Int32Array;
  HEAPU8: Uint8Array;
}

let cargado: Promise<ModuloMotor> | null = null;
function modulo(): Promise<ModuloMotor> {
  cargado ??= import("seedmaps-engine-wasm").then((m) => (m.default as () => Promise<ModuloMotor>)());
  return cargado;
}

export interface Marcador {
  tipo: number;
  x: number;
  z: number;
}

/** Motor listo para una semilla, versión y dimensión. */
export class MotorSemilla {
  private constructor(
    private readonly m: ModuloMotor,
    readonly mc: number,
    readonly dim: number,
    readonly semilla: bigint,
    private readonly colores: Uint8Array,
  ) {}

  static async crear(semilla: bigint, mc: number, dim: number): Promise<MotorSemilla> {
    const m = await modulo();
    const [lo, hi] = mitades(semilla);
    m._wasm_init(mc, dim, lo, hi);
    const p = m._malloc(256 * 4);
    m._wasm_biome_colors(p);
    const colores = m.HEAPU8.slice(p, p + 256 * 3);
    m._free(p);
    return new MotorSemilla(m, mc, dim, semilla, colores);
  }

  /** Vuelve a dejar el motor en esta semilla (el motor guarda una sola a la vez). */
  private activar() {
    const [lo, hi] = mitades(this.semilla);
    this.m._wasm_init(this.mc, this.dim, lo, hi);
  }

  /** Biomas de un rectángulo: (x, z) en unidades de `escala` bloques. */
  biomas(x: number, z: number, ancho: number, alto: number, escala: number): Int32Array {
    this.activar();
    const p = this.m._malloc(ancho * alto * 4);
    try {
      const r = this.m._wasm_generate_biomes(x, z, ancho, alto, escala, this.dim === 0 ? 63 : 64, p);
      if (r !== 0) throw new Error("No se pudieron calcular los biomas");
      return this.m.HEAP32.slice(p >> 2, (p >> 2) + ancho * alto);
    } finally {
      this.m._free(p);
    }
  }

  bioma(x: number, z: number): number {
    this.activar();
    return this.m._wasm_get_biome(1, x, this.dim === 0 ? 63 : 64, z);
  }

  nombreBioma(id: number): string {
    return this.m.UTF8ToString(this.m._wasm_biome_name_ptr(this.mc, id), this.m._wasm_biome_name_length(this.mc, id));
  }

  color(id: number): [number, number, number] {
    const i = (id & 255) * 3;
    return [this.colores[i]!, this.colores[i + 1]!, this.colores[i + 2]!];
  }

  /** Estructuras de un tipo dentro del rectángulo de bloques dado (solo las que sí aparecen por bioma). */
  estructuras(tipo: number, x0: number, z0: number, x1: number, z1: number, maximo = 400): Marcador[] {
    this.activar();
    const region = this.m._wasm_structure_region_size(tipo, this.mc) * 16;
    if (region <= 0) return [];
    const [lo, hi] = mitades(this.semilla);
    const p = this.m._malloc(8);
    const lista: Marcador[] = [];
    try {
      for (let rx = Math.floor(x0 / region); rx <= Math.floor(x1 / region); rx++) {
        for (let rz = Math.floor(z0 / region); rz <= Math.floor(z1 / region); rz++) {
          if (!this.m._wasm_structure_pos(tipo, this.mc, lo, hi, rx, rz, p)) continue;
          const x = this.m.HEAP32[p >> 2]!;
          const z = this.m.HEAP32[(p >> 2) + 1]!;
          if (x < x0 || x > x1 || z < z0 || z > z1) continue;
          if (this.m._wasm_structure_viable(tipo, x, z)) lista.push({ tipo, x, z });
          if (lista.length >= maximo) return lista;
        }
      }
    } finally {
      this.m._free(p);
    }
    return lista;
  }

  /** Punto de aparición del mundo. */
  aparicion(): { x: number; z: number } | null {
    const [lo, hi] = mitades(this.semilla);
    const ctx = this.m._wasm_create(this.mc, 0, lo, hi);
    if (!ctx) return null;
    const p = this.m._malloc(8);
    try {
      return this.m._wasm_ctx_get_spawn(ctx, p) ? { x: this.m.HEAP32[p >> 2]!, z: this.m.HEAP32[(p >> 2) + 1]! } : null;
    } finally {
      this.m._free(p);
      this.m._wasm_destroy(ctx);
    }
  }
}

// ---------------------------------------------------------------- historial (últimas 10)

const CLAVE_HISTORIAL = "mi-setup.semillas";

export interface SemillaGuardada {
  semilla: string;
  texto: string;
  version: number;
  fecha: string;
}

export function leerHistorial(): SemillaGuardada[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_HISTORIAL) ?? "[]") as SemillaGuardada[];
    return Array.isArray(v) ? v.slice(0, 10) : [];
  } catch {
    return [];
  }
}

/** Agrega al principio y deja solo las últimas 10 (sin repetidas). */
export function agregarAlHistorial(lista: SemillaGuardada[], nueva: SemillaGuardada): SemillaGuardada[] {
  return [nueva, ...lista.filter((s) => s.semilla !== nueva.semilla)].slice(0, 10);
}

export function guardarHistorial(lista: SemillaGuardada[]): void {
  try {
    localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(lista.slice(0, 10)));
  } catch {
    /* sin almacenamiento: no se guarda */
  }
}
