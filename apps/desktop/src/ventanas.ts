/**
 * Ventanas especiales de la PC:
 * - Navegador privado: partición efímera (solo en memoria, sin historial ni
 *   cookies persistentes) y bloqueo básico de rastreadores.
 * - Panel Pterodactyl completo, con sesión propia y persistente.
 */
import { join } from "node:path";
import { BrowserWindow, ipcMain, session, WebContentsView, type Session } from "electron";

const RASTREADORES = [
  "doubleclick.net",
  "googlesyndication.com",
  "google-analytics.com",
  "googletagmanager.com",
  "adservice.google.com",
  "facebook.net",
  "scorecardresearch.com",
  "hotjar.com",
  "hotjar.io",
  "clarity.ms",
  "quantserve.com",
  "taboola.com",
  "outbrain.com",
  "criteo.com",
  "criteo.net",
  "amazon-adsystem.com",
  "adnxs.com",
  "mixpanel.com",
  "segment.io",
  "segment.com",
  "fullstory.com",
  "nr-data.net",
  "bat.bing.com",
  "ads-twitter.com",
  "analytics.tiktok.com",
  "tiqcdn.com",
  "chartbeat.com",
  "mc.yandex.ru",
];

export function esRastreador(host: string): boolean {
  return RASTREADORES.some((d) => host === d || host.endsWith(`.${d}`));
}

function bloquearRastreadores(ses: Session): void {
  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (det, cb) => {
    let host = "";
    try {
      host = new URL(det.url).hostname;
    } catch {
      /* URL rara: se deja pasar */
    }
    cb({ cancel: esRastreador(host) });
  });
}

/** Texto de la barra → URL (http/https) o búsqueda en DuckDuckGo. */
export function normalizar(texto: string): string {
  const t = texto.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) return `https://${t}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
}

const BARRA = 44;
const vistas = new Map<number, WebContentsView>();

ipcMain.on("barra:ir", (e, texto: unknown) => {
  const vista = vistas.get(e.sender.id);
  if (vista && typeof texto === "string") void vista.webContents.loadURL(normalizar(texto));
});
ipcMain.on("barra:accion", (e, accion: unknown) => {
  const wc = vistas.get(e.sender.id)?.webContents;
  if (!wc) return;
  if (accion === "atras" && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  if (accion === "adelante" && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  if (accion === "recargar") wc.reload();
});

export function abrirNavegadorPrivado(inicio?: string): void {
  // Sin el prefijo "persist:" la partición vive solo en memoria.
  const ses = session.fromPartition(`nav-privada-${Date.now()}`, { cache: false });
  bloquearRastreadores(ses);
  ses.setPermissionRequestHandler((_wc, _permiso, cb) => cb(false));

  const ventana = new BrowserWindow({
    width: 1200,
    height: 820,
    title: "Navegador privado",
    backgroundColor: "#121212",
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "barra-preload.js"), contextIsolation: true, sandbox: true },
  });
  void ventana.loadFile(join(__dirname, "..", "static", "barra.html"));

  const vista = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  ventana.contentView.addChildView(vista);
  // El id se guarda ahora: al cerrar, la ventana ya está destruida y no se puede leer.
  const idBarra = ventana.webContents.id;
  vistas.set(idBarra, vista);

  const ajustar = () => {
    const [ancho = 0, alto = 0] = ventana.getContentSize();
    vista.setBounds({ x: 0, y: BARRA, width: ancho, height: Math.max(0, alto - BARRA) });
  };
  ajustar();
  ventana.on("resize", ajustar);

  const wc = vista.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void wc.loadURL(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!/^https?:/i.test(url)) e.preventDefault();
  });
  const estado = () => {
    if (ventana.isDestroyed()) return;
    ventana.webContents.send("barra:estado", {
      url: wc.getURL(),
      titulo: wc.getTitle(),
      atras: wc.navigationHistory.canGoBack(),
      adelante: wc.navigationHistory.canGoForward(),
      cargando: wc.isLoading(),
    });
    ventana.setTitle(`${wc.getTitle() || "Navegador privado"} · Privado`);
  };
  for (const ev of ["did-navigate", "did-navigate-in-page", "page-title-updated", "did-start-loading", "did-stop-loading"] as const) {
    wc.on(ev as "did-navigate", estado);
  }

  ventana.on("closed", () => {
    vistas.delete(idBarra);
    void ses.clearStorageData();
    void ses.clearCache();
    if (!wc.isDestroyed()) wc.close();
  });

  void wc.loadURL(normalizar(inicio ?? "https://duckduckgo.com"));
}

let panel: BrowserWindow | null = null;

/** Panel Pterodactyl completo (sesión persistente para no iniciar sesión cada vez). */
export function abrirPanel(url: string): void {
  if (!/^https:\/\//i.test(url)) return;
  if (panel && !panel.isDestroyed()) {
    panel.show();
    panel.focus();
    return;
  }
  panel = new BrowserWindow({
    width: 1280,
    height: 840,
    title: "Panel Pterodactyl",
    backgroundColor: "#121212",
    autoHideMenuBar: true,
    webPreferences: { partition: "persist:panel-pterodactyl", sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const origen = new URL(url).origin;
  panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  panel.webContents.on("will-navigate", (e, destino) => {
    if (new URL(destino).origin !== origen) e.preventDefault();
  });
  void panel.loadURL(url);
}

let vistaPrevia: BrowserWindow | null = null;

/**
 * Vista previa HTML en una ventana flotante aparte (como la del panel). El
 * código corre aislado: sin Node, partición en memoria, sin navegar ni abrir
 * ventanas, y siempre arriba si lo pides.
 */
export function abrirVistaPrevia(html: string, encima = true): void {
  if (typeof html !== "string" || html.length > 2_000_000) return;
  const datos = `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`;
  if (!vistaPrevia || vistaPrevia.isDestroyed()) {
    vistaPrevia = new BrowserWindow({
      width: 420,
      height: 760,
      title: "Vista previa · Mi Setup",
      backgroundColor: "#ffffff",
      autoHideMenuBar: true,
      alwaysOnTop: encima,
      webPreferences: { partition: "vista-previa", sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
    });
    vistaPrevia.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    vistaPrevia.webContents.on("will-navigate", (e, destino) => {
      if (!destino.startsWith("data:")) e.preventDefault();
    });
    vistaPrevia.on("closed", () => {
      vistaPrevia = null;
    });
  } else {
    vistaPrevia.setAlwaysOnTop(encima);
  }
  void vistaPrevia.loadURL(datos);
  vistaPrevia.showInactive();
}
