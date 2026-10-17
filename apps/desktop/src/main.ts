/**
 * Mi Setup para Windows. Carga la UI desde el servidor (setup.mexicanland.net),
 * pone el menú nativo (Archivo · categorías · Ver · Ventana · Ayuda), queda en
 * la bandeja al cerrar la ventana y entrega las métricas de la PC a la UI, que
 * las envía como latido por el WebSocket.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  session,
  shell,
  Tray,
  type IpcMainEvent,
  type MenuItemConstructorOptions,
} from "electron";
import { leerMetricas, leerSistema } from "./metricas";
import { abrirNavegadorPrivado, abrirPanel } from "./ventanas";

const DEV = process.argv.includes("--dev");
const URL_APP = process.env["MI_SETUP_URL"] ?? (DEV ? "http://localhost:5173" : "https://setup.mexicanland.net");
const ORIGEN = new URL(URL_APP).origin;

let ventana: BrowserWindow | null = null;
let bandeja: Tray | null = null;
let saliendo = false;

function icono(): string | null {
  const candidatos = [join(process.resourcesPath ?? "", "icon.png"), join(__dirname, "..", "build", "icon.png")];
  return candidatos.find((c) => existsSync(c)) ?? null;
}

function externoPermitido(url: string): boolean {
  try {
    return ["https:", "http:", "rustdesk:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Solo se aceptan mensajes de la ventana principal con la app cargada. */
function deLaApp(e: IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  try {
    return e.sender === ventana?.webContents && new URL(e.senderFrame?.url ?? "").origin === ORIGEN;
  } catch {
    return false;
  }
}

function crearVentana(): void {
  const ruta = icono();
  ventana = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Mi Setup",
    backgroundColor: "#121212",
    ...(ruta ? { icon: ruta } : {}),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  ventana.once("ready-to-show", () => ventana?.show());
  vigilarCarga(ventana.webContents);
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (externoPermitido(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  ventana.webContents.on("will-navigate", (e, url) => {
    if (new URL(url).origin !== ORIGEN) {
      e.preventDefault();
      if (externoPermitido(url)) void shell.openExternal(url);
    }
  });
  ventana.on("close", (e) => {
    // Con bandeja, cerrar solo oculta: el agente sigue enviando latidos.
    if (!saliendo && bandeja) {
      e.preventDefault();
      ventana?.hide();
    }
  });
  ventana.on("closed", () => {
    ventana = null;
  });
  cargarApp();
}

// ---------------------------------------------------------------- sin conexión con el servidor

let reintento: NodeJS.Timeout | null = null;
let limite: NodeJS.Timeout | null = null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function paginaSinConexion(detalle: string): string {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Mi Setup</title>
<style>body{margin:0;background:#121212;color:#f2f2f7;font-family:system-ui,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh}
main{max-width:460px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#a1a1aa;font-size:14px;line-height:1.5}
code{background:#2c2c2e;padding:2px 6px;border-radius:6px;color:#f2f2f7}a{display:inline-block;margin-top:16px;background:#f2f2f7;color:#000;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:600}</style></head>
<body><main><h1>No se pudo conectar con el servidor</h1>
<p>La app abre <code>${esc(URL_APP)}</code> y no respondió (${esc(detalle)}).</p>
<p>Si todavía no despliegas Mi Setup en tu VPS, hazlo primero (ver <code>docs/USO.md</code>). Se reintenta solo cada 15 segundos.</p>
<a href="${esc(URL_APP)}">Reintentar ahora</a></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function limpiarTemporizadores(): void {
  if (reintento) clearTimeout(reintento);
  if (limite) clearTimeout(limite);
  reintento = limite = null;
}

function sinConexion(detalle: string): void {
  if (!ventana) return;
  limpiarTemporizadores();
  void ventana.loadURL(paginaSinConexion(detalle));
  ventana.show();
  reintento = setTimeout(cargarApp, 15_000);
}

function cargarApp(): void {
  if (!ventana) return;
  limpiarTemporizadores();
  // Si el servidor no contesta en 20 s se muestra la pantalla de error en vez de una ventana vacía.
  limite = setTimeout(() => sinConexion("tiempo de espera agotado"), 20_000);
  void ventana.loadURL(URL_APP).catch(() => undefined);
}

function vigilarCarga(wc: Electron.WebContents): void {
  wc.on("did-fail-load", (_e, codigo, descripcion, url, principal) => {
    // -3 = navegación cancelada (p. ej. al reintentar); se ignora.
    if (!principal || codigo === -3 || !url.startsWith(ORIGEN)) return;
    sinConexion(descripcion || `error ${codigo}`);
  });
  wc.on("did-finish-load", () => {
    if (wc.getURL().startsWith(ORIGEN)) limpiarTemporizadores();
  });
}

function mostrar(): void {
  if (!ventana) crearVentana();
  ventana?.show();
  ventana?.focus();
}

function navegar(ruta: string): void {
  mostrar();
  ventana?.webContents.send("navegar", ruta);
}

function salir(): void {
  saliendo = true;
  app.quit();
}

function construirMenu(): void {
  const plantilla: MenuItemConstructorOptions[] = [
    {
      label: "Archivo",
      submenu: [
        { label: "Nueva nota", accelerator: "Ctrl+N", click: () => navegar("/notas?nueva=1") },
        { label: "Nuevo recordatorio", click: () => navegar("/recordatorios?nuevo=1") },
        { type: "separator" },
        { label: "Ajustes", accelerator: "Ctrl+,", click: () => navegar("/ajustes") },
        { type: "separator" },
        { label: "Salir", accelerator: "Ctrl+Q", click: salir },
      ],
    },
    {
      // Sin estos roles, Ctrl+C / Ctrl+V / Ctrl+A no funcionan dentro de Electron.
      label: "Editar",
      submenu: [
        { role: "undo", label: "Deshacer" },
        { role: "redo", label: "Rehacer" },
        { type: "separator" },
        { role: "cut", label: "Cortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Pegar" },
        { role: "selectAll", label: "Seleccionar todo" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { label: "Inicio", click: () => navegar("/") },
        { role: "reload", label: "Recargar" },
        { role: "togglefullscreen", label: "Pantalla completa" },
        { type: "separator" },
        { role: "zoomIn", label: "Acercar" },
        { role: "zoomOut", label: "Alejar" },
        { role: "resetZoom", label: "Tamaño normal" },
        ...(DEV ? [{ role: "toggleDevTools" as const, label: "Herramientas de desarrollo" }] : []),
      ],
    },
    {
      label: "Ventana",
      submenu: [
        { role: "minimize", label: "Minimizar" },
        { label: "Navegador privado", click: () => abrirNavegadorPrivado() },
        { type: "separator" },
        { label: "Cerrar ventana", accelerator: "Ctrl+W", click: () => ventana?.close() },
      ],
    },
    {
      label: "Ayuda",
      submenu: [
        { label: `Mi Setup ${app.getVersion()}`, enabled: false },
        { label: "Abrir en el navegador", click: () => void shell.openExternal(URL_APP) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

function crearBandeja(): void {
  const ruta = icono();
  // Sin el ícono de MexicanLand no se crea bandeja (nunca un ícono genérico).
  if (!ruta) return;
  bandeja = new Tray(nativeImage.createFromPath(ruta).resize({ width: 16, height: 16 }));
  bandeja.setToolTip("Mi Setup");
  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Mi Setup", click: mostrar },
      { label: "Navegador privado", click: () => abrirNavegadorPrivado() },
      { type: "separator" },
      { label: "Salir", click: salir },
    ]),
  );
  bandeja.on("click", mostrar);
}

function registrarIpc(): void {
  ipcMain.on("version", (e) => {
    e.returnValue = app.getVersion();
  });
  ipcMain.handle("metricas", (e) => (deLaApp(e) ? leerMetricas() : null));
  ipcMain.handle("sistema", (e) => (deLaApp(e) ? leerSistema() : null));
  ipcMain.on("notificar", (e, titulo: unknown, cuerpo: unknown) => {
    if (!deLaApp(e) || !Notification.isSupported()) return;
    new Notification({ title: String(titulo).slice(0, 200), body: String(cuerpo).slice(0, 500) }).show();
  });
  ipcMain.on("externo", (e, url: unknown) => {
    if (deLaApp(e) && typeof url === "string" && externoPermitido(url)) void shell.openExternal(url);
  });
  ipcMain.on("privado", (e, url: unknown) => {
    if (deLaApp(e)) abrirNavegadorPrivado(typeof url === "string" ? url : undefined);
  });
  ipcMain.on("panel", (e, url: unknown) => {
    if (deLaApp(e) && typeof url === "string") abrirPanel(url);
  });
  ipcMain.on("ventana", (e, accion: unknown) => {
    if (!deLaApp(e) || !ventana) return;
    if (accion === "minimizar") ventana.minimize();
    if (accion === "maximizar") {
      if (ventana.isMaximized()) ventana.unmaximize();
      else ventana.maximize();
    }
    if (accion === "cerrar") ventana.close();
    if (accion === "recargar") ventana.reload();
    if (accion === "pantallaCompleta") ventana.setFullScreen(!ventana.isFullScreen());
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", mostrar);
  app.on("before-quit", () => {
    saliendo = true;
  });
  app.on("window-all-closed", () => {
    if (!bandeja) app.quit();
  });
  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, permiso, cb, detalles) => {
      let origen = "";
      try {
        origen = new URL(detalles.requestingUrl).origin;
      } catch {
        /* sin origen */
      }
      cb(origen === ORIGEN && ["notifications", "clipboard-sanitized-write", "media", "fullscreen"].includes(permiso));
    });
    registrarIpc();
    construirMenu();
    crearBandeja();
    crearVentana();
  });
}
