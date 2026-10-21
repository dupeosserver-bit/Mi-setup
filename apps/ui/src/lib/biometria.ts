/**
 * Reautenticación con huella o rostro (solo Android).
 * Al activarla, el servidor entrega una llave aleatoria que se guarda en el
 * almacén seguro del teléfono; para usarla hay que pasar la huella. El
 * servidor solo conoce el hash de la llave.
 */
import { registerPlugin } from "@capacitor/core";
import { api } from "./api";
import { esMovil, nombrePorDefecto } from "./plataforma";

const SERVIDOR = "mi-setup";
const CLAVE = "mi-setup.biometria";

async function plugin() {
  const { NativeBiometric } = await import("capacitor-native-biometric");
  return NativeBiometric;
}

// Revisión propia (APK 0.11.1 o más nueva) con la API nueva de Android.
const Nativo = registerPlugin<{ huella(): Promise<{ disponible: boolean; sinRegistrar: boolean }> }>("Autorrelleno");

export async function biometriaSoportada(): Promise<boolean> {
  if (!esMovil()) return false;
  const delPlugin = await plugin()
    .then((nb) => nb.isAvailable())
    .then((r) => r.isAvailable)
    .catch(() => false);
  if (delPlugin) return true;
  return Nativo.huella()
    .then((r) => r.disponible)
    .catch(() => false);
}

export async function biometriaDisponible(): Promise<boolean> {
  return localStorage.getItem(CLAVE) !== null && (await biometriaSoportada());
}

export async function inscribirBiometria(): Promise<void> {
  const nb = await plugin();
  await nb.verifyIdentity({ reason: "Activar la huella en Mi Setup", title: "Mi Setup" });
  const r = await api<{ id: string; secreto: string }>("/api/auth/biometria", { cuerpo: { dispositivo: nombrePorDefecto() } });
  await nb.setCredentials({ username: r.id, password: r.secreto, server: SERVIDOR });
  localStorage.setItem(CLAVE, r.id);
}

export async function reautenticarConBiometria(): Promise<void> {
  const nb = await plugin();
  await nb.verifyIdentity({ reason: "Confirma tu identidad", title: "Mi Setup" });
  const cred = await nb.getCredentials({ server: SERVIDOR });
  await api("/api/auth/reauth", { cuerpo: { metodo: "biometria", llaveId: cred.username, secreto: cred.password } });
}

export async function quitarBiometria(): Promise<void> {
  const id = localStorage.getItem(CLAVE);
  if (id) await api(`/api/auth/biometria/${id}`, { metodo: "DELETE" }).catch(() => undefined);
  localStorage.removeItem(CLAVE);
  if (esMovil()) await (await plugin()).deleteCredentials({ server: SERVIDOR }).catch(() => undefined);
}
