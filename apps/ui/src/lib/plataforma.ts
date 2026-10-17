/**
 * Detección de plataforma y puentes nativos:
 * - PC: Electron expone `window.miSetup` (preload).
 * - Celular: Capacitor (Android).
 * - Web: navegador normal.
 */
import { Capacitor } from "@capacitor/core";
import type { MetricasDispositivo } from "@mi-setup/shared";

export interface PuenteEscritorio {
  readonly plataforma: "pc";
  readonly version: string;
  metricas(): Promise<MetricasDispositivo>;
  abrirNavegadorPrivado(url?: string): void;
  abrirPanel(url: string): void;
  abrirExterno(url: string): void;
  notificar(titulo: string, cuerpo: string): void;
  alNavegar(cb: (ruta: string) => void): () => void;
  /** Construye el menú nativo (Archivo · categorías · Ver · Ventana · Ayuda) con los apartados permitidos. */
  establecerMenu(grupos: { titulo: string; items: { etiqueta: string; ruta: string }[] }[]): void;
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
