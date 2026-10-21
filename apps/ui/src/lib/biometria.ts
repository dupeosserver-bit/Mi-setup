/**
 * Reautenticación con huella o rostro (solo Android).
 * Al activarla, el servidor entrega una llave aleatoria que se guarda en el
 * almacén seguro del teléfono; para usarla hay que pasar la huella. El
 * servidor solo conoce el hash de la llave.
 *
 * Desde 0.11.2b el aviso de huella lo muestra el plugin propio de la app
 * (BiometricPrompt directo, como Revolut). Si el APK es más viejo se usa
 * capacitor-native-biometric como antes.
 */
import { registerPlugin } from "@capacitor/core";
import { api } from "./api";
import { esMovil, nombrePorDefecto } from "./plataforma";

const SERVIDOR = "mi-setup";
const CLAVE = "mi-setup.biometria";
const LLAVE_NATIVA = "llave";

async function plugin() {
  const { NativeBiometric } = await import("capacitor-native-biometric");
  return NativeBiometric;
}

interface PluginHuella {
  huella(): Promise<{ disponible: boolean; sinRegistrar: boolean; propia?: boolean }>;
  huellaPedir(o: { titulo?: string; subtitulo?: string; cancelar?: string }): Promise<void>;
  huellaGuardar(o: { nombre: string; valor: string }): Promise<void>;
  huellaLeer(o: { nombre: string }): Promise<{ valor: string | null }>;
  huellaBorrar(o: { nombre: string }): Promise<void>;
}

const Nativo = registerPlugin<PluginHuella>("Autorrelleno");

/** ¿El APK trae la huella propia (0.11.2b o más nuevo)? */
async function huellaPropia(): Promise<boolean> {
  return Nativo.huella()
    .then((r) => r.propia === true)
    .catch(() => false);
}

/** Texto del aviso, igual al de las apps del banco. */
export const TEXTOS_HUELLA = { titulo: "Desbloquear con la huella dactilar", subtitulo: "Escanee su huella digital.", cancelar: "Cancelar" };

export function textoDeLlave(id: string, secreto: string): string {
  return JSON.stringify({ id, secreto });
}

export function leerLlave(valor: string | null | undefined): { id: string; secreto: string } | null {
  if (!valor) return null;
  try {
    const v = JSON.parse(valor) as { id?: unknown; secreto?: unknown };
    return typeof v.id === "string" && typeof v.secreto === "string" ? { id: v.id, secreto: v.secreto } : null;
  } catch {
    return null;
  }
}

export async function biometriaSoportada(): Promise<boolean> {
  if (!esMovil()) return false;
  const nativa = await Nativo.huella()
    .then((r) => r.disponible)
    .catch(() => false);
  if (nativa) return true;
  return plugin()
    .then((nb) => nb.isAvailable())
    .then((r) => r.isAvailable)
    .catch(() => false);
}

export async function biometriaDisponible(): Promise<boolean> {
  return localStorage.getItem(CLAVE) !== null && (await biometriaSoportada());
}

async function pedirHuella(propia: boolean, motivo: string): Promise<void> {
  if (propia) await Nativo.huellaPedir(TEXTOS_HUELLA);
  else await (await plugin()).verifyIdentity({ reason: motivo, title: "Mi Setup", negativeButtonText: "Cancelar" });
}

export async function inscribirBiometria(): Promise<void> {
  const propia = await huellaPropia();
  await pedirHuella(propia, "Activar la huella en Mi Setup");
  const r = await api<{ id: string; secreto: string }>("/api/auth/biometria", { cuerpo: { dispositivo: nombrePorDefecto() } });
  if (propia) await Nativo.huellaGuardar({ nombre: LLAVE_NATIVA, valor: textoDeLlave(r.id, r.secreto) });
  else await (await plugin()).setCredentials({ username: r.id, password: r.secreto, server: SERVIDOR });
  localStorage.setItem(CLAVE, r.id);
}

/** Pide la huella y confirma con el servidor. Sin contraseña de por medio. */
export async function reautenticarConBiometria(): Promise<void> {
  const propia = await huellaPropia();
  await pedirHuella(propia, "Confirma tu identidad");
  let llave = propia ? leerLlave((await Nativo.huellaLeer({ nombre: LLAVE_NATIVA }).catch(() => null))?.valor) : null;
  if (!llave) {
    // Llave guardada por un APK anterior: se lee del plugin viejo y se pasa al almacén nuevo.
    const cred = await (await plugin()).getCredentials({ server: SERVIDOR }).catch(() => null);
    if (!cred) {
      localStorage.removeItem(CLAVE);
      throw new Error("La huella se desactivó en este celular. Confirma con tu PIN y vuelve a activarla.");
    }
    llave = { id: cred.username, secreto: cred.password };
    if (propia) await Nativo.huellaGuardar({ nombre: LLAVE_NATIVA, valor: textoDeLlave(llave.id, llave.secreto) }).catch(() => undefined);
  }
  await api("/api/auth/reauth", { cuerpo: { metodo: "biometria", llaveId: llave.id, secreto: llave.secreto } });
}

export async function quitarBiometria(): Promise<void> {
  const id = localStorage.getItem(CLAVE);
  if (id) await api(`/api/auth/biometria/${id}`, { metodo: "DELETE" }).catch(() => undefined);
  localStorage.removeItem(CLAVE);
  if (!esMovil()) return;
  await Nativo.huellaBorrar({ nombre: LLAVE_NATIVA }).catch(() => undefined);
  await (await plugin()).deleteCredentials({ server: SERVIDOR }).catch(() => undefined);
}
