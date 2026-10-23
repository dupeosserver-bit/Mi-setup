import {
  conservarBasicas,
  esModoActualizacion,
  extraerBasicas,
  modoActualizacionEfectivo,
  preferenciasSchema,
  puedeRechazarActualizaciones,
  type ModoActualizacion,
  type Preferencias,
  type PreferenciasBasicas,
} from "@mi-setup/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { api, cambiarServidor } from "./api";
import { queryClient, useMe } from "./consultas";
import { escritorio } from "./plataforma";
import { useGuardarPreferencias } from "./preferencias";

const CLAVE_MODO = "mi-setup.actualizaciones";
const CLAVE_BASICAS = "mi-setup.basicas-pendientes";
const CLAVE_DESCARGADA = "mi-setup.actualizacion-descargada";

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string | null): void {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    return;
  }
}

interface EstadoModo {
  elegido: ModoActualizacion;
  poner(m: ModoActualizacion): void;
}

const useModoElegido = create<EstadoModo>()((set) => ({
  elegido: ((m) => (esModoActualizacion(m) ? m : "auto"))(leer(CLAVE_MODO)),
  poner: (m) => {
    escribir(CLAVE_MODO, m);
    set({ elegido: m });
  },
}));

export function useVinculadoVps(): boolean {
  const { data: me } = useMe();
  return me?.usuario.role === "maestra";
}

export function useModoActualizacion() {
  const { elegido, poner } = useModoElegido();
  const vinculado = useVinculadoVps();
  const efectivo = modoActualizacionEfectivo(elegido, vinculado);
  useEffect(() => {
    escritorio()?.actualizaciones?.modo(efectivo);
  }, [efectivo]);
  return { elegido, efectivo, vinculado, puedeRechazar: puedeRechazarActualizaciones(vinculado), poner };
}

export function yaSeDescargo(version: string): boolean {
  return leer(CLAVE_DESCARGADA) === version;
}

export function marcarDescargada(version: string): void {
  escribir(CLAVE_DESCARGADA, version);
}

export function cambiarServidorConservando(url: string | null): void {
  const actuales = queryClient.getQueryData<Preferencias>(["preferencias"]);
  if (actuales) escribir(CLAVE_BASICAS, JSON.stringify(extraerBasicas(actuales)));
  cambiarServidor(url);
}

function basicasPendientes(): Partial<PreferenciasBasicas> | null {
  const texto = leer(CLAVE_BASICAS);
  if (!texto) return null;
  try {
    const r = preferenciasSchema.partial().safeParse(JSON.parse(texto));
    return r.success ? (r.data as Partial<PreferenciasBasicas>) : null;
  } catch {
    return null;
  }
}

export function useAplicarBasicasPendientes(): void {
  const guardar = useGuardarPreferencias();
  const prefs = useQuery({ queryKey: ["preferencias"], queryFn: () => api<unknown>("/api/preferencias"), enabled: false });
  const listas = prefs.status === "success" && !prefs.isPlaceholderData;
  useEffect(() => {
    if (!listas) return;
    const pendientes = basicasPendientes();
    if (!pendientes) return;
    escribir(CLAVE_BASICAS, null);
    guardar((p) => conservarBasicas(p, pendientes));
  }, [listas, guardar]);
}
