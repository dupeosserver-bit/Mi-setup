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
  vistas.set(ventana.webContents.id, vista);

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
    vistas.delete(ventana.webContents.id);
    void ses.clearStorageData();
    void ses.clearCache();
    wc.close();
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
