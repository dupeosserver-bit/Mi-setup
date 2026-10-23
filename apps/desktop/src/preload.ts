/** Puente seguro entre la UI (web) y Electron. Solo expone funciones concretas. */
import { contextBridge, ipcRenderer } from "electron";

type AccionVentana = "minimizar" | "maximizar" | "cerrar" | "recargar" | "pantallaCompleta";

contextBridge.exposeInMainWorld("miSetup", {
  plataforma: "pc",
  version: String(ipcRenderer.sendSync("version")),
  huella: String(ipcRenderer.sendSync("huella")),
  metricas: () => ipcRenderer.invoke("metricas"),
  sistema: () => ipcRenderer.invoke("sistema"),
  abrirNavegadorPrivado: (url?: string) => ipcRenderer.send("privado", url),
  abrirPanel: (url: string) => ipcRenderer.send("panel", url),
  /** Vista previa HTML en ventana flotante (0.11.2b+). */
  abrirVistaPrevia: (html: string, encima?: boolean) => ipcRenderer.send("vista-previa", html, encima),
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
    importar: (carpeta: string) => ipcRenderer.invoke("fs:importar", carpeta),
    comprimir: (rutas: string[], nombreZip: string) => ipcRenderer.invoke("fs:comprimir", rutas, nombreZip),
    descomprimir: (ruta: string) => ipcRenderer.invoke("fs:descomprimir", ruta),
    plantillas: () => ipcRenderer.invoke("fs:plantillas"),
    crearProyecto: (carpeta: string, plantilla: string, nombre: string) => ipcRenderer.invoke("fs:crearProyecto", carpeta, plantilla, nombre),
    herramientas: () => ipcRenderer.invoke("herr:estado"),
    instalarHerramientas: () => ipcRenderer.invoke("herr:instalar"),
    correrJava: (codigo: string) => ipcRenderer.invoke("herr:java", codigo),
    alAvanceHerramientas: (cb: (texto: string) => void) => {
      const fn = (_e: unknown, texto: string) => cb(texto);
      ipcRenderer.on("herr:avance", fn);
      return () => ipcRenderer.removeListener("herr:avance", fn);
    },
  },
  /** Host local: servidores de juego en esta PC. */
  servidoresLocales: {
    lista: () => ipcRenderer.invoke("srv:lista"),
    versiones: (tipo: string) => ipcRenderer.invoke("srv:versiones", tipo),
    crear: (datos: unknown) => ipcRenderer.invoke("srv:crear", datos),
    iniciar: (id: string) => ipcRenderer.invoke("srv:iniciar", id),
    detener: (id: string) => ipcRenderer.invoke("srv:detener", id),
    forzar: (id: string) => ipcRenderer.invoke("srv:forzar", id),
    comando: (id: string, texto: string) => ipcRenderer.invoke("srv:comando", id, texto),
    log: (id: string) => ipcRenderer.invoke("srv:log", id),
    actualizar: (id: string, cambios: unknown) => ipcRenderer.invoke("srv:actualizar", id, cambios),
    propiedades: (id: string) => ipcRenderer.invoke("srv:propiedades", id),
    guardarPropiedades: (id: string, cambios: unknown) => ipcRenderer.invoke("srv:guardarPropiedades", id, cambios),
    borrar: (id: string) => ipcRenderer.invoke("srv:borrar", id),
    addons: (id: string, clase?: string) => ipcRenderer.invoke("srv:addons", id, clase),
    modrinthBuscar: (id: string, q: string, clase?: string, pagina?: number) => ipcRenderer.invoke("srv:modrinthBuscar", id, q, clase, pagina),
    modpackInstalar: (id: string, proyecto: string) => ipcRenderer.invoke("srv:modpackInstalar", id, proyecto),
    modpacksBuscar: (q: string, mc: string, pagina?: number) => ipcRenderer.invoke("srv:modpacksBuscar", q, mc, pagina),
    modrinthInstalar: (id: string, proyecto: string, clase?: string) => ipcRenderer.invoke("srv:modrinthInstalar", id, proyecto, clase),
    instalarDesdeUrl: (id: string, url: string, nombre: string, clase?: string) => ipcRenderer.invoke("srv:instalarDesdeUrl", id, url, nombre, clase),
    quitarAddon: (id: string, nombre: string, clase?: string) => ipcRenderer.invoke("srv:quitarAddon", id, nombre, clase),
    playit: () => ipcRenderer.invoke("srv:playit"),
    empaquetar: (id: string, soloMundo: boolean) => ipcRenderer.invoke("srv:empaquetar", id, soloMundo),
    subirZip: (zip: string, url: string) => ipcRenderer.invoke("srv:subirZip", zip, url),
    abrirCarpeta: (id: string) => ipcRenderer.invoke("srv:abrirCarpeta", id),
    alSalida: (cb: (id: string, texto: string) => void) => {
      const fn = (_e: unknown, id: string, texto: string) => cb(id, texto);
      ipcRenderer.on("srv:salida", fn);
      return () => ipcRenderer.removeListener("srv:salida", fn);
    },
    alEstado: (cb: (servidor: unknown) => void) => {
      const fn = (_e: unknown, s: unknown) => cb(s);
      ipcRenderer.on("srv:estado", fn);
      return () => ipcRenderer.removeListener("srv:estado", fn);
    },
    alProgreso: (cb: (texto: string) => void) => {
      const fn = (_e: unknown, t: string) => cb(t);
      ipcRenderer.on("srv:progreso", fn);
      return () => ipcRenderer.removeListener("srv:progreso", fn);
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
