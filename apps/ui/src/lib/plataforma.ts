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
