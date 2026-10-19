/**
 * Detección de plataforma y puentes nativos:
 * - PC: Electron expone `window.miSetup` (preload).
 * - Celular: Capacitor (Android).
 * - Web: navegador normal.
 */
import { Capacitor } from "@capacitor/core";
import type { InfoEquipo, MetricasDispositivo } from "@mi-setup/shared";

export interface PuenteEscritorio {
  readonly plataforma: "pc";
  readonly version: string;
  metricas(): Promise<MetricasDispositivo>;
  sistema(): Promise<InfoEquipo>;
  abrirNavegadorPrivado(url?: string): void;
  abrirPanel(url: string): void;
  abrirExterno(url: string): void;
  notificar(titulo: string, cuerpo: string): void;
  alNavegar(cb: (ruta: string) => void): () => void;
  ventana(accion: "minimizar" | "maximizar" | "cerrar" | "recargar" | "pantallaCompleta"): void;
  /** PowerShell / CMD de la PC (versión 0.5.1 o más nueva de la app de Windows). */
  readonly terminalLocal?: TerminalLocal;
  /** Archivos de la PC para la pantalla Código (versión 0.7 o más nueva). */
  readonly archivosLocales?: ArchivosLocales;
  /** Host local (versión 0.8 o más nueva). */
  readonly servidoresLocales?: ServidoresLocales;
}

export type TipoServidor = "paper" | "purpur" | "folia" | "fabric" | "quilt" | "forge" | "neoforge" | "mohist" | "arclight" | "vanilla" | "velocity" | "personalizado";
export type ClaseAddon = "plugins" | "mods";
export interface ServidorLocal {
  id: string;
  nombre: string;
  tipo: TipoServidor;
  version: string;
  carpeta: string;
  ramMb: number;
  puerto: number;
  java: number;
  comando?: string;
  /** Versión de Minecraft (vacía en Velocity). Apps viejas no la mandan. */
  mc?: string;
  /** Qué lleva: mods, plugins o ambos (Mohist/Arclight). */
  clases?: ClaseAddon[];
  cargadorMods?: string;
  creado: string;
  estado: "detenido" | "iniciando" | "encendido" | "deteniendo";
  jugadores: string[];
  desde: number | null;
  ip: string | null;
}
export interface Addon {
  id: string;
  titulo: string;
  descripcion: string;
  icono: string | null;
  descargas: number;
  autor: string;
  url: string;
}
export interface ServidoresLocales {
  lista(): Promise<ServidorLocal[]>;
  versiones(tipo: TipoServidor): Promise<string[]>;
  crear(datos: { nombre: string; tipo: TipoServidor; version?: string; ramMb: number; puerto: number; eula?: boolean; comando?: string }): Promise<ServidorLocal | null>;
  iniciar(id: string): Promise<ServidorLocal>;
  detener(id: string): Promise<void>;
  forzar(id: string): Promise<boolean>;
  comando(id: string, texto: string): Promise<boolean>;
  log(id: string): Promise<string>;
  actualizar(id: string, cambios: { nombre?: string; ramMb?: number; puerto?: number }): Promise<ServidorLocal>;
  propiedades(id: string): Promise<Record<string, string>>;
  guardarPropiedades(id: string, cambios: Record<string, string>): Promise<Record<string, string>>;
  borrar(id: string): Promise<boolean>;
  addons(id: string, clase?: ClaseAddon): Promise<{ nombre: string; tamano: number }[]>;
  modrinthBuscar(id: string, q: string, clase?: ClaseAddon): Promise<Addon[]>;
  modrinthInstalar(id: string, proyecto: string, clase?: ClaseAddon): Promise<string>;
  instalarDesdeUrl(id: string, url: string, nombre: string, clase?: ClaseAddon): Promise<string>;
  quitarAddon(id: string, nombre: string, clase?: ClaseAddon): Promise<boolean>;
  playit(): Promise<string>;
  empaquetar(id: string, soloMundo: boolean): Promise<{ zip: string; tamano: number }>;
  subirZip(zip: string, url: string): Promise<{ archivo: string }>;
  abrirCarpeta(id: string): Promise<boolean>;
  alSalida(cb: (id: string, texto: string) => void): () => void;
  alEstado(cb: (s: ServidorLocal) => void): () => void;
  alProgreso(cb: (texto: string) => void): () => void;
}

export interface EntradaLocal {
  nombre: string;
  ruta: string;
  tipo: "archivo" | "carpeta";
  tamano: number;
  modificado: number;
}

export interface PlantillaProyecto {
  id: string;
  nombre: string;
  descripcion: string;
  necesitaJava: boolean;
  comando: string | null;
}

export interface ArchivosLocales {
  carpetas(): Promise<string[]>;
  elegirCarpeta(): Promise<string | null>;
  quitarCarpeta(ruta: string): Promise<boolean>;
  listar(ruta: string): Promise<EntradaLocal[]>;
  leer(ruta: string): Promise<string>;
  escribir(ruta: string, texto: string): Promise<boolean>;
  crear(carpeta: string, nombre: string, tipo: "archivo" | "carpeta"): Promise<string>;
  renombrar(ruta: string, nuevo: string): Promise<string>;
  borrar(ruta: string): Promise<boolean>;
  mostrar(ruta: string): Promise<boolean>;
  importar(carpeta: string): Promise<string[]>;
  comprimir(rutas: string[], nombreZip: string): Promise<string>;
  descomprimir(ruta: string): Promise<string>;
  plantillas(): Promise<PlantillaProyecto[]>;
  crearProyecto(carpeta: string, plantilla: string, nombre: string): Promise<string>;
  herramientas(): Promise<{ java: boolean; gradle: boolean }>;
  instalarHerramientas(): Promise<{ java: boolean; gradle: boolean }>;
  alAvanceHerramientas(cb: (texto: string) => void): () => void;
}

export interface TerminalLocal {
  shells(): Promise<{ id: string; nombre: string }[]>;
  lista(): Promise<{ id: string; shell: string; nombre: string; viva: boolean }[]>;
  historial(id: string): Promise<string>;
  abrir(shell: string, cols: number, rows: number, opciones?: { cwd?: string; comando?: string }): Promise<{ id: string; nombre: string }>;
  escribir(id: string, datos: string): void;
  tamano(id: string, cols: number, rows: number): void;
  cerrar(id: string): void;
  alDatos(cb: (id: string, datos: string) => void): () => void;
  alSalida(cb: (id: string, codigo: number) => void): () => void;
}

declare global {
  interface Window {
    miSetup?: PuenteEscritorio;
  }
}

export type TipoDispositivo = "pc" | "celular" | "web";

export const escritorio = (): PuenteEscritorio | null => window.miSetup ?? null;
export const esMovil = (): boolean => Capacitor.isNativePlatform();

export function tipoDispositivo(): TipoDispositivo {
  if (escritorio()) return "pc";
  if (esMovil()) return "celular";
  return "web";
}

export function nombrePorDefecto(): string {
  const tipo = tipoDispositivo();
  if (tipo === "pc") return "PC";
  if (tipo === "celular") return "Celular";
  return "Navegador";
}

/** Abre una URL fuera de la app (navegador del sistema). */
export function abrirExterno(url: string): void {
  const pc = escritorio();
  if (pc) pc.abrirExterno(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

/** Métricas del dispositivo actual (PC con systeminformation, celular con Capacitor). */
export async function leerMetricas(): Promise<MetricasDispositivo> {
  const pc = escritorio();
  if (pc) return pc.metricas();
  if (esMovil()) {
    const [{ Device }, { Network }] = await Promise.all([import("@capacitor/device"), import("@capacitor/network")]);
    const [bateria, red, info] = await Promise.all([Device.getBatteryInfo(), Network.getStatus(), Device.getInfo()]);
    const m: MetricasDispositivo = {
      conexion: red.connected ? red.connectionType : "sin conexión",
    };
    if (bateria.batteryLevel !== undefined) {
      m.bateria = { nivel: Math.round(bateria.batteryLevel * 100), cargando: Boolean(bateria.isCharging) };
    }
    const total = info.realDiskTotal ?? info.diskTotal;
    const libre = info.realDiskFree ?? info.diskFree;
    if (total && libre !== undefined) m.discos = [{ nombre: "Almacenamiento", usado: total - libre, total }];
    if (info.memUsed) m.ram = { usado: info.memUsed, total: info.memUsed };
    return m;
  }
  return {};
}

/** Nombre de la tarjeta gráfica que ve el navegador (WebGL), si lo expone. */
function graficaWebGl(): string | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  } catch {
    return null;
  }
}

/** Datos fijos del equipo actual: PC (systeminformation), celular (Capacitor) o navegador. */
export async function leerSistema(): Promise<InfoEquipo> {
  const pc = escritorio();
  if (pc) return pc.sistema();
  const nucleos = navigator.hardwareConcurrency || 0;
  const memoriaAprox = ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 0) * 1024 ** 3;
  const grafica = graficaWebGl();
  if (esMovil()) {
    const { Device } = await import("@capacitor/device");
    const info = await Device.getInfo();
    return {
      sistema: [info.manufacturer, info.model].filter(Boolean).join(" ") || "Celular",
      procesador: nucleos ? `${nucleos} núcleos` : "—",
      nucleos,
      graficos: grafica ? [grafica] : [],
      memoria: memoriaAprox,
      almacenamiento: info.realDiskTotal ?? info.diskTotal ?? 0,
      so: `${info.operatingSystem === "android" ? "Android" : info.operatingSystem} ${info.osVersion}`,
      nombreEquipo: info.name ?? "",
    };
  }
  return {
    sistema: "Navegador web",
    procesador: nucleos ? `${nucleos} núcleos` : "—",
    nucleos,
    graficos: grafica ? [grafica] : [],
    memoria: memoriaAprox,
    almacenamiento: 0,
    so: navigator.userAgent.includes("Windows") ? "Windows" : navigator.userAgent.includes("Android") ? "Android" : "—",
    nombreEquipo: "",
  };
}
