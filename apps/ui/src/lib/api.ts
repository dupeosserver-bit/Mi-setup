/**
 * Cliente HTTP de la API. Añade el token, lo renueva solo si vence y, si una
 * acción pide reautenticación, abre el diálogo y reintenta.
 */
import type { LoginResponse, ReauthRequirement } from "@mi-setup/shared";
import { pedirReauth } from "./reauth";
import { useSesion } from "./sesion";

export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly codigo?: string,
    readonly datos?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refrescando: Promise<boolean> | null = null;

/** Renueva el accessToken con el refresh token (una sola petición a la vez). */
export function refrescar(): Promise<boolean> {
  refrescando ??= (async () => {
    const { refreshToken, guardar, salir } = useSesion.getState();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.status === 401) {
        salir();
        return false;
      }
      if (!res.ok) return false;
      guardar((await res.json()) as LoginResponse);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refrescando = null;
  });
  return refrescando;
}

export interface OpcionesApi {
  metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  cuerpo?: unknown;
  formulario?: FormData;
  signal?: AbortSignal;
}

function encabezados(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  const token = useSesion.getState().accessToken;
  if (token) h["authorization"] = `Bearer ${token}`;
  if (json) h["content-type"] = "application/json";
  return h;
}

export async function api<T = unknown>(ruta: string, opciones: OpcionesApi = {}, intento = 0): Promise<T> {
  if (!useSesion.getState().accessToken && useSesion.getState().refreshToken && intento === 0) {
    await refrescar();
  }
  const json = opciones.cuerpo !== undefined && !opciones.formulario;
  const res = await fetch(`${API_BASE}${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo !== undefined || opciones.formulario ? "POST" : "GET"),
    headers: encabezados(json),
    body: opciones.formulario ?? (json ? JSON.stringify(opciones.cuerpo) : undefined),
    signal: opciones.signal,
  });

  if (res.status === 401 && intento === 0 && !ruta.startsWith("/api/auth/login")) {
    if (await refrescar()) return api<T>(ruta, opciones, 1);
  }

  const texto = await res.text();
  let datos: Record<string, unknown> | null = null;
  try {
    datos = texto ? (JSON.parse(texto) as Record<string, unknown>) : null;
  } catch {
    datos = null;
  }

  if (!res.ok) {
    if (res.status === 403 && datos?.["codigo"] === "reauth_requerida" && intento < 2) {
      await pedirReauth((datos["metodo"] as ReauthRequirement | undefined) ?? "fuerte");
      return api<T>(ruta, opciones, intento + 1);
    }
    const mensaje = typeof datos?.["error"] === "string" ? (datos["error"] as string) : `Error ${res.status}`;
    throw new ApiError(res.status, mensaje, datos?.["codigo"] as string | undefined, datos ?? undefined);
  }
  return datos as T;
}

/** Descarga un archivo protegido (con token) y lo guarda en el dispositivo. */
export async function descargar(ruta: string, nombre: string): Promise<void> {
  let res = await fetch(`${API_BASE}${ruta}`, { headers: encabezados(false) });
  if (res.status === 401 && (await refrescar())) res = await fetch(`${API_BASE}${ruta}`, { headers: encabezados(false) });
  if (!res.ok) throw new ApiError(res.status, "No se pudo descargar el archivo");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error";
}
