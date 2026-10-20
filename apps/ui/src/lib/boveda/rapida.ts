/**
 * Apertura rápida de la bóveda: huella en el celular y PIN en la PC, para no
 * escribir la clave maestra cada vez.
 *
 * La clave de la bóveda se guarda aquí cifrada con una llave al azar; esa
 * llave la guarda el servidor (cifrada) y solo la entrega si confirmaste tu
 * PIN o huella hace menos de 2 minutos. Ni este dispositivo solo ni el
 * servidor solo pueden abrir la bóveda.
 */
import { api } from "../api";
import { biometriaDisponible, inscribirBiometria, reautenticarConBiometria } from "../biometria";
import { claveCorrecta, cifrar, descifrar } from "./cripto";
import { useBoveda, type ConfigBoveda } from "./estado";

const CLAVE = "mi-setup.boveda-rapida";
const CONTEXTO = "boveda-rapida";

export interface AperturaRapida {
  dispositivo: string;
  blob: string;
  metodo: "pin" | "huella";
}

const aB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export function aperturaRapida(): AperturaRapida | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as AperturaRapida | null;
    return v && typeof v.blob === "string" && typeof v.dispositivo === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Activa la apertura rápida en este dispositivo (con la bóveda ya abierta). */
export async function activarApertura(metodo: "pin" | "huella"): Promise<void> {
  const clave = useBoveda.getState().clave;
  if (!clave) throw new Error("Abre primero la bóveda");
  // Si la huella aún no está activada en Mi Setup, se activa aquí mismo.
  if (metodo === "huella") await ((await biometriaDisponible()) ? reautenticarConBiometria() : inscribirBiometria());
  const llave = crypto.getRandomValues(new Uint8Array(32));
  const blob = await cifrar(llave, aB64url(clave), CONTEXTO);
  const dispositivo = `d-${aB64url(crypto.getRandomValues(new Uint8Array(12)))}`;
  await api("/api/boveda/rapida", { cuerpo: { dispositivo, llave: aB64url(llave), metodo } });
  llave.fill(0);
  localStorage.setItem(CLAVE, JSON.stringify({ dispositivo, blob, metodo } satisfies AperturaRapida));
}

export async function quitarApertura(): Promise<void> {
  const g = aperturaRapida();
  localStorage.removeItem(CLAVE);
  if (g) await api(`/api/boveda/rapida/${g.dispositivo}`, { metodo: "DELETE" }).catch(() => undefined);
}

/** Abre la bóveda con huella (celular) o PIN (la app pide el PIN sola). */
export async function abrirRapido(config: ConfigBoveda): Promise<void> {
  const g = aperturaRapida();
  if (!g) throw new Error("La apertura rápida no está activada aquí");
  if (!config.verificador) throw new Error("La bóveda no está configurada");
  if (g.metodo === "huella") await reautenticarConBiometria();
  let respuesta: { llave: string };
  try {
    respuesta = await api<{ llave: string }>("/api/boveda/rapida/abrir", { cuerpo: { dispositivo: g.dispositivo } });
  } catch (err) {
    if (err instanceof Error && /no está activada/.test(err.message)) localStorage.removeItem(CLAVE);
    throw err;
  }
  const llave = deB64url(respuesta.llave);
  const clave = deB64url(await descifrar<string>(llave, g.blob, CONTEXTO));
  llave.fill(0);
  if (!(await claveCorrecta(clave, config.verificador))) {
    localStorage.removeItem(CLAVE);
    throw new Error("Cambiaste la clave maestra: ábrela con la clave y vuelve a activar la huella o el PIN.");
  }
  useBoveda.getState().desbloquear(clave);
}
