/** Puente seguro entre la UI (web) y Electron. Solo expone funciones concretas. */
import { contextBridge, ipcRenderer } from "electron";

type AccionVentana = "minimizar" | "maximizar" | "cerrar" | "recargar" | "pantallaCompleta";

contextBridge.exposeInMainWorld("miSetup", {
  plataforma: "pc",
  version: String(ipcRenderer.sendSync("version")),
  metricas: () => ipcRenderer.invoke("metricas"),
  abrirNavegadorPrivado: (url?: string) => ipcRenderer.send("privado", url),
  abrirPanel: (url: string) => ipcRenderer.send("panel", url),
  abrirExterno: (url: string) => ipcRenderer.send("externo", url),
  notificar: (titulo: string, cuerpo: string) => ipcRenderer.send("notificar", titulo, cuerpo),
  ventana: (accion: AccionVentana) => ipcRenderer.send("ventana", accion),
  alNavegar: (cb: (ruta: string) => void) => {
    const fn = (_e: unknown, ruta: string) => cb(ruta);
    ipcRenderer.on("navegar", fn);
    return () => ipcRenderer.removeListener("navegar", fn);
  },
});
