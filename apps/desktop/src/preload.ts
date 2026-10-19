/** Puente seguro entre la UI (web) y Electron. Solo expone funciones concretas. */
import { contextBridge, ipcRenderer } from "electron";

type AccionVentana = "minimizar" | "maximizar" | "cerrar" | "recargar" | "pantallaCompleta";

contextBridge.exposeInMainWorld("miSetup", {
  plataforma: "pc",
  version: String(ipcRenderer.sendSync("version")),
  metricas: () => ipcRenderer.invoke("metricas"),
  sistema: () => ipcRenderer.invoke("sistema"),
  abrirNavegadorPrivado: (url?: string) => ipcRenderer.send("privado", url),
  abrirPanel: (url: string) => ipcRenderer.send("panel", url),
  abrirExterno: (url: string) => ipcRenderer.send("externo", url),
  notificar: (titulo: string, cuerpo: string) => ipcRenderer.send("notificar", titulo, cuerpo),
  ventana: (accion: AccionVentana) => ipcRenderer.send("ventana", accion),
  /** Archivos de esta PC para el editor de código (solo carpetas que elijas). */
  archivosLocales: {
    carpetas: () => ipcRenderer.invoke("fs:carpetas"),
    elegirCarpeta: () => ipcRenderer.invoke("fs:elegirCarpeta"),
    quitarCarpeta: (ruta: string) => ipcRenderer.invoke("fs:quitarCarpeta", ruta),
    listar: (ruta: string) => ipcRenderer.invoke("fs:listar", ruta),
    leer: (ruta: string) => ipcRenderer.invoke("fs:leer", ruta),
    escribir: (ruta: string, texto: string) => ipcRenderer.invoke("fs:escribir", ruta, texto),
    crear: (carpeta: string, nombre: string, tipo: "archivo" | "carpeta") => ipcRenderer.invoke("fs:crear", carpeta, nombre, tipo),
    renombrar: (ruta: string, nuevo: string) => ipcRenderer.invoke("fs:renombrar", ruta, nuevo),
    borrar: (ruta: string) => ipcRenderer.invoke("fs:borrar", ruta),
    mostrar: (ruta: string) => ipcRenderer.invoke("fs:mostrar", ruta),
    comprimir: (rutas: string[], nombreZip: string) => ipcRenderer.invoke("fs:comprimir", rutas, nombreZip),
    descomprimir: (ruta: string) => ipcRenderer.invoke("fs:descomprimir", ruta),
    plantillas: () => ipcRenderer.invoke("fs:plantillas"),
    crearProyecto: (carpeta: string, plantilla: string, nombre: string) => ipcRenderer.invoke("fs:crearProyecto", carpeta, plantilla, nombre),
    herramientas: () => ipcRenderer.invoke("herr:estado"),
    instalarHerramientas: () => ipcRenderer.invoke("herr:instalar"),
    alAvanceHerramientas: (cb: (texto: string) => void) => {
      const fn = (_e: unknown, texto: string) => cb(texto);
      ipcRenderer.on("herr:avance", fn);
      return () => ipcRenderer.removeListener("herr:avance", fn);
    },
  },
  /** Terminal de esta PC (PowerShell / CMD). */
  terminalLocal: {
    shells: () => ipcRenderer.invoke("pty:shells"),
    lista: () => ipcRenderer.invoke("pty:lista"),
    historial: (id: string) => ipcRenderer.invoke("pty:historial", id),
    abrir: (shell: string, cols: number, rows: number, opciones?: { cwd?: string; comando?: string }) => ipcRenderer.invoke("pty:abrir", shell, cols, rows, opciones),
    escribir: (id: string, datos: string) => ipcRenderer.send("pty:escribir", id, datos),
    tamano: (id: string, cols: number, rows: number) => ipcRenderer.send("pty:tamano", id, cols, rows),
    cerrar: (id: string) => ipcRenderer.send("pty:cerrar", id),
    alDatos: (cb: (id: string, datos: string) => void) => {
      const fn = (_e: unknown, id: string, datos: string) => cb(id, datos);
      ipcRenderer.on("pty:datos", fn);
      return () => ipcRenderer.removeListener("pty:datos", fn);
    },
    alSalida: (cb: (id: string, codigo: number) => void) => {
      const fn = (_e: unknown, id: string, codigo: number) => cb(id, codigo);
      ipcRenderer.on("pty:salida", fn);
      return () => ipcRenderer.removeListener("pty:salida", fn);
    },
  },
  alNavegar: (cb: (ruta: string) => void) => {
    const fn = (_e: unknown, ruta: string) => cb(ruta);
    ipcRenderer.on("navegar", fn);
    return () => ipcRenderer.removeListener("navegar", fn);
  },
});
