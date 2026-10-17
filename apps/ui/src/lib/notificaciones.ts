/** Notificaciones locales: PC (Electron), Android (Capacitor) o navegador. */
import { escritorio, esMovil } from "./plataforma";

let siguienteId = 1;

export async function prepararNotificaciones(): Promise<void> {
  if (esMovil()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.requestPermissions().catch(() => undefined);
  }
}

export async function pedirPermisoNavegador(): Promise<boolean> {
  if (escritorio() || esMovil() || !("Notification" in window)) return true;
  return (await Notification.requestPermission()) === "granted";
}

export async function mostrarNotificacion(titulo: string, cuerpo: string): Promise<void> {
  const pc = escritorio();
  if (pc) {
    pc.notificar(titulo, cuerpo);
    return;
  }
  if (esMovil()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({ notifications: [{ id: siguienteId++, title: titulo, body: cuerpo }] }).catch(() => undefined);
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(titulo, { body: cuerpo });
  }
}
