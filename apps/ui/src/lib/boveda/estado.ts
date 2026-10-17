/**
 * Estado de la bóveda en este dispositivo: la clave derivada vive solo en
 * memoria y se borra al bloquear (a mano, al cerrar sesión o tras 5 minutos
 * sin actividad). Nada descifrado se guarda en disco.
 */
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { api } from "../api";
import { queryClient } from "../consultas";
import { claveCorrecta, contextoDe, crearVerificador, derivarClave, descifrar, KDF_POR_DEFECTO, nuevaSal, olvidar, type ParametrosKdf } from "./cripto";

export const AUTO_BLOQUEO_MS = 5 * 60_000;
export type Coleccion = "boveda" | "2fa";

export interface ConfigBoveda {
  configurada: boolean;
  sal?: string;
  kdf?: ParametrosKdf;
  verificador?: string;
}

interface Estado {
  clave: Uint8Array | null;
  sesion: number;
  ultimaActividad: number;
  desbloquear(clave: Uint8Array): void;
  bloquear(): void;
  actividad(): void;
}

export const useBoveda = create<Estado>()((set, get) => ({
  clave: null,
  sesion: 0,
  ultimaActividad: Date.now(),
  desbloquear: (clave) => set((s) => ({ clave, sesion: s.sesion + 1, ultimaActividad: Date.now() })),
  bloquear: () => {
    const { clave } = get();
    if (clave) void olvidar(clave);
    set({ clave: null });
    queryClient.removeQueries({ queryKey: ["boveda", "items"] });
  },
  actividad: () => {
    if (get().clave) set({ ultimaActividad: Date.now() });
  },
}));

if (typeof window !== "undefined") {
  setInterval(() => {
    const s = useBoveda.getState();
    if (s.clave && Date.now() - s.ultimaActividad > AUTO_BLOQUEO_MS) s.bloquear();
  }, 10_000);
  for (const ev of ["pointerdown", "keydown"] as const) window.addEventListener(ev, () => useBoveda.getState().actividad(), { passive: true });
}

export function useConfigBoveda() {
  return useQuery({ queryKey: ["boveda", "config"], queryFn: () => api<ConfigBoveda>("/api/boveda/config"), staleTime: 60_000 });
}

export async function crearBoveda(claveMaestra: string): Promise<void> {
  const sal = await nuevaSal();
  const clave = await derivarClave(claveMaestra, sal, KDF_POR_DEFECTO);
  const verificador = await crearVerificador(clave);
  await api("/api/boveda/config", { metodo: "PUT", cuerpo: { sal, kdf: KDF_POR_DEFECTO, verificador } });
  await queryClient.invalidateQueries({ queryKey: ["boveda", "config"] });
  useBoveda.getState().desbloquear(clave);
}

export async function abrirBoveda(claveMaestra: string, config: ConfigBoveda): Promise<void> {
  if (!config.sal || !config.kdf || !config.verificador) throw new Error("La bóveda no está configurada");
  const clave = await derivarClave(claveMaestra, config.sal, config.kdf);
  if (!(await claveCorrecta(clave, config.verificador))) {
    await olvidar(clave);
    throw new Error("Clave maestra incorrecta");
  }
  useBoveda.getState().desbloquear(clave);
}

export interface Elemento<T> {
  id: string;
  tipo: string;
  valor: T;
  actualizado: string;
}

interface ElementoCifrado {
  id: string;
  tipo: string;
  datos: string;
  actualizado: string;
}

export async function leerColeccion<T>(coleccion: Coleccion, clave: Uint8Array): Promise<Elemento<T>[]> {
  const cifrados = await api<ElementoCifrado[]>(`/api/${coleccion}/items`);
  return Promise.all(
    cifrados.map(async (e) => ({ id: e.id, tipo: e.tipo, actualizado: e.actualizado, valor: await descifrar<T>(clave, e.datos, contextoDe(e.tipo)) })),
  );
}

/** Elementos descifrados de una colección (solo con la bóveda abierta). */
export function useElementos<T>(coleccion: Coleccion) {
  const { clave, sesion } = useBoveda();
  return useQuery({
    queryKey: ["boveda", "items", coleccion, sesion],
    queryFn: () => leerColeccion<T>(coleccion, clave!),
    enabled: Boolean(clave),
    staleTime: Infinity,
    gcTime: 0,
  });
}

export async function recargarElementos(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["boveda", "items"] });
}
