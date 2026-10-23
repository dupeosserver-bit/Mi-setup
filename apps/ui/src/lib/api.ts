/**
 * Cliente HTTP de la API. Añade el token, lo renueva solo si vence y, si una
 * acción pide reautenticación, abre el diálogo y reintenta.
 */
import type { LoginResponse, ReauthRequirement } from "@mi-setup/shared";
import { guardarBlob } from "./guardar";
import { escritorio } from "./plataforma";
import { pedirReauth } from "./reauth";
import { CLAVE_SESION, useSesion } from "./sesion";

const CLAVE_SERVIDOR = "mi-setup.servidor";
/** Servidor con el que se compiló la app (vacío en la versión web: usa el mismo sitio). */
export const SERVIDOR_PREDETERMINADO = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
/** Versión web de la página oficial (misetup.…/app): no trae servidor, la persona escribe el suyo. */
export const WEB_OFICIAL = import.meta.env.VITE_WEB === "1";
/** El celular y la versión web guardan aquí a qué servidor hablan. */
const ELIGE_EN_ESTA_PAGINA = Boolean(SERVIDOR_PREDETERMINADO) || WEB_OFICIAL;
/** La app de PC abre la página del servidor elegido: el cambio lo hace Windows y la app se reabre. */
const servidorPc = () => (typeof window === "undefined" ? undefined : escritorio()?.servidor);
/** Las apps de PC y celular pueden conectarse a otro servidor de Mi Setup (p. ej. el de un familiar). */
export const PUEDE_CAMBIAR_SERVIDOR = ELIGE_EN_ESTA_PAGINA || Boolean(servidorPc());

function servidorGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_SERVIDOR);
  } catch {
    return null;
  }
}

export const API_BASE = ((ELIGE_EN_ESTA_PAGINA && servidorGuardado()) || SERVIDOR_PREDETERMINADO).replace(/\/$/, "");
/** Servidor al que se vuelve con «Volver al predeterminado» (vacío si no hay). */
export const SERVIDOR_PREDETERMINADO_ACTUAL = SERVIDOR_PREDETERMINADO || servidorPc()?.predeterminado || "";
/** Dirección completa del servidor en uso (en el navegador y en la PC es la de esta misma página). */
export const SERVIDOR_EN_USO = API_BASE || (typeof window === "undefined" ? "" : window.location.origin);
/** En la versión web todavía no se escribe la dirección del servidor. */
export const FALTA_SERVIDOR = WEB_OFICIAL && !API_BASE;

/** ¿Ese Mi Setup contesta? Se revisa antes de cambiarse a él. */
export async function servidorResponde(origen: string): Promise<boolean> {
  try {
    const r = await fetch(`${origen}/api/health`, { signal: AbortSignal.timeout(10_000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** "setup.tudominio.com" o "https://setup.tudominio.com/" → "https://setup.tudominio.com" (null si no sirve). */
export function origenServidor(texto: string): string | null {
  const limpio = texto.trim();
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(limpio) ? limpio : `https://${limpio}`);
    return u.protocol === "https:" && u.hostname.includes(".") ? u.origin : null;
  } catch {
    return null;
  }
}

/** Ruta del servidor (/uploads/…) como dirección completa: en el celular la app no vive en el mismo sitio que el servidor. */
export const urlServidor = <T extends string | null | undefined>(ruta: T): T => (typeof ruta === "string" && ruta.startsWith("/") ? (`${API_BASE}${ruta}` as T) : ruta);

const CLAVE_SESIONES = "mi-setup.sesiones-por-servidor";

interface SesionGuardada {
  refreshToken: string;
  usuario: { displayName?: string; email?: string } | null;
  usado: string;
}

function sesionesGuardadas(): Record<string, SesionGuardada> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SESIONES) ?? "{}") as Record<string, SesionGuardada>;
  } catch {
    return {};
  }
}

/** Servidores de Mi Setup que usaste en este dispositivo (con su sesión, para cambiar sin volver a entrar). */
export function servidoresRecordados(): { url: string; nombre: string | null; actual: boolean }[] {
  const pc = servidorPc();
  if (pc) return [{ url: SERVIDOR_EN_USO, nombre: useSesion.getState().usuario?.displayName ?? null, actual: true }, ...pc.recordados().map((url) => ({ url, nombre: null, actual: false }))];
  const s = sesionesGuardadas();
  const lista = new Map<string, string | null>();
  lista.set(API_BASE, useSesion.getState().usuario?.displayName ?? null);
  for (const [url, g] of Object.entries(s)) if (!lista.has(url)) lista.set(url, g.usuario?.displayName ?? g.usuario?.email ?? null);
  if (SERVIDOR_PREDETERMINADO && !lista.has(SERVIDOR_PREDETERMINADO)) lista.set(SERVIDOR_PREDETERMINADO, null);
  return [...lista.entries()].filter(([url]) => url).map(([url, nombre]) => ({ url, nombre, actual: url === API_BASE }));
}

export function olvidarServidor(url: string): void {
  const s = sesionesGuardadas();
  delete s[url];
  try {
    localStorage.setItem(CLAVE_SESIONES, JSON.stringify(s));
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Cambia el servidor (null = el predeterminado) y recarga la app. La sesión de
 * este servidor se guarda y, si ya habías entrado al otro, se recupera la suya.
 */
export function cambiarServidor(url: string | null): void {
  const pc = servidorPc();
  if (pc) {
    void pc.cambiar(url);
    return;
  }
  const destino = (url ?? SERVIDOR_PREDETERMINADO).replace(/\/$/, "");
  try {
    const sesiones = sesionesGuardadas();
    const { refreshToken, usuario } = useSesion.getState();
    if (refreshToken) sesiones[API_BASE] = { refreshToken, usuario, usado: new Date().toISOString() };
    const guardada = sesiones[destino];
    delete sesiones[destino];
    localStorage.setItem(CLAVE_SESIONES, JSON.stringify(sesiones));
    if (destino !== SERVIDOR_PREDETERMINADO) localStorage.setItem(CLAVE_SERVIDOR, destino);
    else localStorage.removeItem(CLAVE_SERVIDOR);
    // La sesión del otro servidor (si la había) queda lista para cuando recargue.
    localStorage.setItem(CLAVE_SESION, JSON.stringify({ state: { refreshToken: guardada?.refreshToken ?? null, usuario: guardada?.usuario ?? null }, version: 0 }));
  } catch {
    // Sin almacenamiento local no se puede recordar otro servidor.
    useSesion.getState().salir();
  }
  window.location.reload();
}

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
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${ruta}`, {
      method: opciones.metodo ?? (opciones.cuerpo !== undefined || opciones.formulario ? "POST" : "GET"),
      headers: encabezados(json),
      body: opciones.formulario ?? (json ? JSON.stringify(opciones.cuerpo) : undefined),
      signal: opciones.signal,
    });
  } catch (err) {
    if (opciones.signal?.aborted) throw err;
    // «Failed to fetch»: no hubo respuesta (sin internet, servidor apagado o dirección equivocada).
    throw new ApiError(0, `No se pudo conectar con ${SERVIDOR_EN_USO ? new URL(SERVIDOR_EN_USO).host : "el servidor"}. Revisa tu internet y que ese Mi Setup esté encendido.`, "sin_conexion");
  }

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
  if (res.status === 403) {
    const datos = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null;
    if (datos?.["codigo"] === "reauth_requerida") {
      await pedirReauth((datos["metodo"] as ReauthRequirement | undefined) ?? "fuerte");
      res = await fetch(`${API_BASE}${ruta}`, { headers: encabezados(false) });
    }
  }
  if (!res.ok) throw new ApiError(res.status, "No se pudo descargar el archivo");
  await guardarBlob(await res.blob(), nombre);
}

export function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error";
}
