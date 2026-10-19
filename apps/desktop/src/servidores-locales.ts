/**
 * Host local: servidores de juego en esta PC (Minecraft Paper, Fabric, Forge,
 * Vanilla, o cualquier otro con un comando propio).
 * - Baja el servidor y el Java que pide esa versión (Microsoft OpenJDK).
 * - Consola en vivo, encender/apagar, RAM, puerto y server.properties.
 * - Mods y plugins desde Modrinth (y CurseForge con la clave del servidor).
 * - playit.gg para que tus amigos entren sin abrir puertos.
 * - Empaquetar y subir a tu Pterodactyl ("Pasar a mi VPS").
 */
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { agregarCarpeta, asegurarJava, descargar } from "./archivos-locales";

type Tipo = "paper" | "fabric" | "forge" | "vanilla" | "personalizado";
type Estado = "detenido" | "iniciando" | "encendido" | "deteniendo";

interface Servidor {
  id: string;
  nombre: string;
  tipo: Tipo;
  version: string;
  carpeta: string;
  ramMb: number;
  puerto: number;
  java: number;
  /** Solo "personalizado": comando que arranca el servidor. */
  comando?: string;
  /** Forge: archivo de argumentos que deja el instalador. */
  argsForge?: string;
  creado: string;
}

interface Vivo {
  proceso: ChildProcess;
  estado: Estado;
  log: string;
  jugadores: Set<string>;
  inicio: number;
}

const UA = { "user-agent": "MexicanLand/MiSetup (mexicanland.net)" };
const ARCHIVO = () => join(app.getPath("userData"), "servidores-locales.json");
const BASE_SERVIDORES = () => join(app.getPath("documents"), "MiSetup Servidores");
const MAX_LOG = 300_000;

function leer(): Servidor[] {
  try {
    const d = JSON.parse(readFileSync(ARCHIVO(), "utf8")) as unknown;
    return Array.isArray(d) ? (d as Servidor[]) : [];
  } catch {
    return [];
  }
}
function guardar(lista: Servidor[]): void {
  writeFileSync(ARCHIVO(), JSON.stringify(lista, null, 2));
}
function obtener(id: unknown): Servidor {
  const s = leer().find((x) => x.id === id);
  if (!s) throw new Error("Servidor no encontrado");
  return s;
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} respondió ${r.status}`);
  return (await r.json()) as T;
}

/** Compara "1.21.4" y "26.1.2" por partes numéricas (mayor primero). */
function compararVersiones(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => Number(x) || 0);
  const pb = b.split(/[.-]/).map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
const esEstable = (v: string) => /^\d+(\.\d+)+$/.test(v);

interface Manifiesto {
  versions: { id: string; type: string; url: string }[];
}
let manifiesto: Promise<Manifiesto> | null = null;
const leerManifiesto = () => (manifiesto ??= json<Manifiesto>("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json").catch((e) => {
  manifiesto = null;
  throw e;
}));

/** Java que pide la versión de Minecraft (Mojang lo dice en su ficha). */
async function javaDe(version: string): Promise<{ java: number; servidor?: string }> {
  const m = await leerManifiesto();
  const v = m.versions.find((x) => x.id === version);
  if (!v) return { java: Number(version.split(".")[0]) >= 26 ? 25 : 21 };
  const ficha = await json<{ javaVersion?: { majorVersion: number }; downloads?: { server?: { url: string } } }>(v.url);
  return { java: Math.max(ficha.javaVersion?.majorVersion ?? 21, 17), ...(ficha.downloads?.server ? { servidor: ficha.downloads.server.url } : {}) };
}

async function versiones(tipo: Tipo): Promise<string[]> {
  if (tipo === "paper") {
    const d = await json<{ versions: Record<string, string[]> }>("https://fill.papermc.io/v3/projects/paper");
    return Object.values(d.versions).flat().filter(esEstable).sort(compararVersiones);
  }
  if (tipo === "vanilla") return (await leerManifiesto()).versions.filter((v) => v.type === "release").map((v) => v.id);
  if (tipo === "fabric") {
    const d = await json<{ version: string; stable: boolean }[]>("https://meta.fabricmc.net/v2/versions/game");
    return d.filter((v) => v.stable).map((v) => v.version);
  }
  if (tipo === "forge") {
    const d = await json<{ promos: Record<string, string> }>("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
    const mc = new Set(Object.keys(d.promos).map((k) => k.replace(/-(latest|recommended)$/, "")));
    // El arranque moderno (win_args.txt) existe desde 1.17.
    return [...mc].filter((v) => esEstable(v) && compararVersiones(v, "1.17") <= 0).sort(compararVersiones);
  }
  return [];
}

function ipLocal(): string | null {
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista ?? []) if (i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254")) return i.address;
  }
  return null;
}

function leerPropiedades(carpeta: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const linea of readFileSync(join(carpeta, "server.properties"), "utf8").split(/\r?\n/)) {
      if (!linea || linea.startsWith("#") || !linea.includes("=")) continue;
      const i = linea.indexOf("=");
      out[linea.slice(0, i)] = linea.slice(i + 1);
    }
    return out;
  } catch {
    return {};
  }
}
function escribirPropiedades(carpeta: string, cambios: Record<string, string>): void {
  const ruta = join(carpeta, "server.properties");
  const lineas = existsSync(ruta) ? readFileSync(ruta, "utf8").split(/\r?\n/) : ["#Minecraft server properties (Mi Setup)"];
  const pendientes = new Map(Object.entries(cambios));
  const nuevas = lineas.map((l) => {
    const i = l.indexOf("=");
    if (l.startsWith("#") || i < 0) return l;
    const k = l.slice(0, i);
    if (!pendientes.has(k)) return l;
    const v = pendientes.get(k)!;
    pendientes.delete(k);
    return `${k}=${v}`;
  });
  for (const [k, v] of pendientes) nuevas.push(`${k}=${v}`);
  writeFileSync(ruta, nuevas.filter((l, i, a) => l !== "" || i < a.length - 1).join("\n") + "\n");
}

const carpetaAddons = (s: Servidor) => (s.tipo === "paper" ? "plugins" : "mods");
const cargadores = (s: Servidor) => (s.tipo === "paper" ? ["paper", "spigot", "bukkit", "purpur"] : s.tipo === "fabric" ? ["fabric"] : s.tipo === "forge" ? ["forge"] : []);

function matarArbol(pid: number | undefined): void {
  if (!pid) return;
  execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => undefined);
}

export function registrarServidoresLocales(deLaApp: (e: IpcMainEvent | IpcMainInvokeEvent) => boolean, ventana: () => BrowserWindow | null): { detenerTodos: () => Promise<void>; hayEncendidos: () => boolean } {
  const vivos = new Map<string, Vivo>();
  const enviar = (canal: string, ...datos: unknown[]) => {
    const w = ventana();
    if (w && !w.isDestroyed()) w.webContents.send(canal, ...datos);
  };
  const progreso = (texto: string) => enviar("srv:progreso", texto);
  const manejar = <T>(canal: string, fn: (...args: unknown[]) => Promise<T> | T) =>
    ipcMain.handle(canal, async (e, ...args: unknown[]) => {
      if (!deLaApp(e)) throw new Error("No permitido");
      return fn(...args);
    });

  const vista = (s: Servidor) => {
    const v = vivos.get(s.id);
    return { ...s, estado: (v?.estado ?? "detenido") as Estado, jugadores: [...(v?.jugadores ?? [])], desde: v?.inicio ?? null, ip: ipLocal() };
  };

  async function instalar(s: Servidor, java: string): Promise<Partial<Servidor>> {
    const destino = join(s.carpeta, "server.jar");
    if (s.tipo === "paper") {
      const b = await json<{ downloads: Record<string, { url: string }> }>(`https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(s.version)}/builds/latest`);
      const url = b.downloads["server:default"]?.url;
      if (!url) throw new Error("Paper no tiene descarga para esa versión");
      await descargar(url, destino, (p) => progreso(`Bajando Paper ${s.version}… ${p}%`));
    } else if (s.tipo === "vanilla") {
      const { servidor } = await javaDe(s.version);
      if (!servidor) throw new Error("Esa versión no tiene servidor oficial");
      await descargar(servidor, destino, (p) => progreso(`Bajando Minecraft ${s.version}… ${p}%`));
    } else if (s.tipo === "fabric") {
      const loader = (await json<{ version: string; stable: boolean }[]>("https://meta.fabricmc.net/v2/versions/loader")).find((x) => x.stable)?.version;
      const instalador = (await json<{ version: string; stable: boolean }[]>("https://meta.fabricmc.net/v2/versions/installer")).find((x) => x.stable)?.version;
      if (!loader || !instalador) throw new Error("No encontré Fabric");
      await descargar(`https://meta.fabricmc.net/v2/versions/loader/${s.version}/${loader}/${instalador}/server/jar`, destino, (p) => progreso(`Bajando Fabric… ${p}%`));
    } else if (s.tipo === "forge") {
      const promos = (await json<{ promos: Record<string, string> }>("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")).promos;
      const fv = promos[`${s.version}-recommended`] ?? promos[`${s.version}-latest`];
      if (!fv) throw new Error("Forge no tiene versión para ese Minecraft");
      const completo = `${s.version}-${fv}`;
      const inst = join(s.carpeta, "forge-installer.jar");
      await descargar(`https://maven.minecraftforge.net/net/minecraftforge/forge/${completo}/forge-${completo}-installer.jar`, inst, (p) => progreso(`Bajando Forge ${fv}… ${p}%`));
      progreso("Instalando Forge (puede tardar un par de minutos)…");
      await new Promise<void>((ok, mal) => {
        const p = spawn(java, ["-jar", "forge-installer.jar", "--installServer"], { cwd: s.carpeta, windowsHide: true });
        p.stdout.on("data", (d: Buffer) => progreso(`Forge: ${d.toString().trim().split("\n").pop()?.slice(0, 90) ?? ""}`));
        p.on("exit", (c) => (c === 0 ? ok() : mal(new Error("El instalador de Forge falló"))));
        p.on("error", mal);
      });
      await rm(inst, { force: true });
      const args = `libraries/net/minecraftforge/forge/${completo}/win_args.txt`;
      if (!existsSync(join(s.carpeta, args))) throw new Error("Forge no dejó su archivo de arranque");
      return { argsForge: args };
    }
    return {};
  }

  manejar("srv:lista", () => leer().map(vista));
  manejar("srv:versiones", (tipo) => versiones(tipo as Tipo));

  manejar("srv:crear", async (datos) => {
    const d = datos as { nombre?: unknown; tipo?: unknown; version?: unknown; ramMb?: unknown; puerto?: unknown; eula?: unknown; comando?: unknown };
    const nombre = typeof d.nombre === "string" ? d.nombre.trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 40) : "";
    if (!nombre) throw new Error("Ponle nombre al servidor");
    const tipo = (["paper", "fabric", "forge", "vanilla", "personalizado"] as Tipo[]).find((t) => t === d.tipo);
    if (!tipo) throw new Error("Tipo inválido");
    const ramMb = Math.min(Math.max(Number(d.ramMb) || 2048, 512), 65536);
    const puerto = Math.min(Math.max(Number(d.puerto) || 25565, 1024), 65535);
    if (leer().some((s) => s.puerto === puerto)) throw new Error(`El puerto ${puerto} ya lo usa otro de tus servidores`);
    const base: Omit<Servidor, "carpeta" | "version" | "java"> = { id: crypto.randomUUID(), nombre, tipo, ramMb, puerto, creado: new Date().toISOString() };

    if (tipo === "personalizado") {
      // Otro juego: tú eliges la carpeta y el comando; Windows te pide confirmarlo.
      const comando = typeof d.comando === "string" ? d.comando.trim().slice(0, 500) : "";
      if (!comando) throw new Error("Escribe el comando que arranca el servidor");
      const w = ventana();
      const r = w ? await dialog.showOpenDialog(w, { title: "Carpeta del servidor", properties: ["openDirectory", "createDirectory"] }) : await dialog.showOpenDialog({ properties: ["openDirectory"] });
      const carpeta = r.filePaths[0];
      if (r.canceled || !carpeta) return null;
      const ok = await dialog.showMessageBox(w ?? (undefined as never), {
        type: "warning",
        buttons: ["Cancelar", "Sí, usar este comando"],
        defaultId: 0,
        cancelId: 0,
        title: "Confirmar comando",
        message: `Mi Setup ejecutará este comando cada vez que enciendas «${nombre}»:`,
        detail: `${comando}\n\nEn: ${carpeta}\n\nSolo acepta si tú lo escribiste.`,
      });
      if (ok.response !== 1) return null;
      const s: Servidor = { ...base, carpeta, version: "-", java: 0, comando };
      agregarCarpeta(carpeta);
      guardar([...leer(), s]);
      return vista(s);
    }

    if (d.eula !== true) throw new Error("Para crear un servidor de Minecraft tienes que aceptar la EULA de Mojang");
    const version = typeof d.version === "string" && /^[\w.-]{2,20}$/.test(d.version) ? d.version : "";
    if (!version) throw new Error("Elige la versión");
    const carpeta = join(BASE_SERVIDORES(), nombre);
    if (existsSync(carpeta)) throw new Error("Ya hay una carpeta con ese nombre en Documentos\\MiSetup Servidores");
    await mkdir(carpeta, { recursive: true });
    try {
      progreso("Revisando qué Java necesita esa versión…");
      const { java: mayor } = await javaDe(version);
      const java = await asegurarJava(mayor, progreso);
      const s: Servidor = { ...base, carpeta, version, java: mayor };
      Object.assign(s, await instalar(s, java));
      await writeFile(join(carpeta, "eula.txt"), `# Aceptada por el usuario en Mi Setup el ${new Date().toISOString()}\neula=true\n`);
      escribirPropiedades(carpeta, { "server-port": String(puerto), motd: `${nombre} · MexicanLand`, "max-players": "10" });
      agregarCarpeta(carpeta);
      guardar([...leer(), s]);
      progreso("Listo");
      return vista(s);
    } catch (err) {
      await rm(carpeta, { recursive: true, force: true });
      throw err;
    }
  });

  manejar("srv:iniciar", async (id) => {
    const s = obtener(id);
    if (vivos.get(s.id)?.proceso.exitCode === null) throw new Error("Ya está encendido");
    let proceso: ChildProcess;
    if (s.tipo === "personalizado") {
      proceso = spawn(s.comando!, { cwd: s.carpeta, shell: true, windowsHide: true });
    } else {
      const java = await asegurarJava(s.java, progreso);
      const memoria = [`-Xms${Math.min(1024, s.ramMb)}M`, `-Xmx${s.ramMb}M`];
      const args =
        s.tipo === "forge" && s.argsForge
          ? [...memoria, `@${s.argsForge}`, "nogui"]
          : [...memoria, "-jar", "server.jar", "nogui"];
      proceso = spawn(java, args, { cwd: s.carpeta, windowsHide: true });
    }
    const v: Vivo = { proceso, estado: "iniciando", log: "", jugadores: new Set(), inicio: Date.now() };
    vivos.set(s.id, v);
    const alTexto = (b: Buffer) => {
      const t = b.toString("utf8");
      v.log = (v.log + t).slice(-MAX_LOG);
      enviar("srv:salida", s.id, t);
      let cambio = false;
      if (v.estado === "iniciando" && /Done \(|Server started|Server is ready/i.test(t)) {
        v.estado = "encendido";
        cambio = true;
      }
      for (const m of t.matchAll(/: ([A-Za-z0-9_]{3,16}) joined the game/g)) {
        v.jugadores.add(m[1]!);
        cambio = true;
      }
      for (const m of t.matchAll(/: ([A-Za-z0-9_]{3,16}) left the game/g)) {
        v.jugadores.delete(m[1]!);
        cambio = true;
      }
      if (cambio) enviar("srv:estado", vista(s));
    };
    proceso.stdout?.on("data", alTexto);
    proceso.stderr?.on("data", alTexto);
    proceso.on("error", (err) => alTexto(Buffer.from(`\n[Mi Setup] No se pudo arrancar: ${err.message}\n`)));
    proceso.on("exit", (codigo) => {
      v.estado = "detenido";
      v.jugadores.clear();
      alTexto(Buffer.from(`\n[Mi Setup] Servidor apagado (código ${codigo ?? "?"}).\n`));
      enviar("srv:estado", vista(s));
    });
    enviar("srv:estado", vista(s));
    return vista(s);
  });

  const detener = (id: string): Promise<void> =>
    new Promise((ok) => {
      const v = vivos.get(id);
      if (!v || v.proceso.exitCode !== null) return ok();
      v.estado = "deteniendo";
      const s = leer().find((x) => x.id === id);
      if (s) enviar("srv:estado", vista(s));
      v.proceso.once("exit", () => ok());
      if (s?.tipo === "personalizado") matarArbol(v.proceso.pid);
      else v.proceso.stdin?.write("stop\n");
      // Si en 45 s no se apagó, se fuerza (guardando lo que se pueda).
      setTimeout(() => {
        if (v.proceso.exitCode === null) matarArbol(v.proceso.pid);
      }, 45_000);
    });

  manejar("srv:detener", (id) => detener(String(id)));
  manejar("srv:forzar", (id) => {
    matarArbol(vivos.get(String(id))?.proceso.pid);
    return true;
  });
  manejar("srv:comando", (id, texto) => {
    const v = vivos.get(String(id));
    if (!v || v.proceso.exitCode !== null) throw new Error("El servidor está apagado");
    if (typeof texto !== "string" || texto.length > 1000 || /[\r\n]/.test(texto)) throw new Error("Comando inválido");
    v.proceso.stdin?.write(`${texto.replace(/^\//, "")}\n`);
    return true;
  });
  manejar("srv:log", (id) => vivos.get(String(id))?.log ?? "");

  manejar("srv:actualizar", (id, cambios) => {
    const c = (cambios ?? {}) as { nombre?: unknown; ramMb?: unknown; puerto?: unknown };
    const lista = leer();
    const s = lista.find((x) => x.id === id);
    if (!s) throw new Error("Servidor no encontrado");
    if (typeof c.nombre === "string" && c.nombre.trim()) s.nombre = c.nombre.trim().slice(0, 40);
    if (c.ramMb !== undefined) s.ramMb = Math.min(Math.max(Number(c.ramMb) || s.ramMb, 512), 65536);
    if (c.puerto !== undefined) {
      const p = Math.min(Math.max(Number(c.puerto) || s.puerto, 1024), 65535);
      if (lista.some((x) => x.id !== s.id && x.puerto === p)) throw new Error(`El puerto ${p} ya lo usa otro de tus servidores`);
      s.puerto = p;
      if (s.tipo !== "personalizado") escribirPropiedades(s.carpeta, { "server-port": String(p) });
    }
    guardar(lista);
    return vista(s);
  });

  manejar("srv:propiedades", (id) => leerPropiedades(obtener(id).carpeta));
  manejar("srv:guardarPropiedades", (id, cambios) => {
    const s = obtener(id);
    const limpio: Record<string, string> = {};
    for (const [k, v] of Object.entries((cambios ?? {}) as Record<string, unknown>)) {
      if (/^[a-z0-9.-]{1,60}$/.test(k) && typeof v === "string" && !/[\r\n]/.test(v)) limpio[k] = v.slice(0, 200);
    }
    if (limpio["server-port"]) s.puerto = Number(limpio["server-port"]) || s.puerto;
    escribirPropiedades(s.carpeta, limpio);
    guardar(leer().map((x) => (x.id === s.id ? s : x)));
    return leerPropiedades(s.carpeta);
  });

  manejar("srv:borrar", async (id) => {
    const s = obtener(id);
    await detener(s.id);
    if (s.tipo !== "personalizado") await shell.trashItem(s.carpeta).catch(() => undefined);
    guardar(leer().filter((x) => x.id !== s.id));
    vivos.delete(s.id);
    return true;
  });

  // -------------------------------------------------------------- mods y plugins
  manejar("srv:addons", async (id) => {
    const s = obtener(id);
    const dir = join(s.carpeta, carpetaAddons(s));
    if (!existsSync(dir)) return [];
    const nombres = (await readdir(dir)).filter((n) => /\.(jar|zip)$/i.test(n));
    return Promise.all(nombres.map(async (n) => ({ nombre: n, tamano: (await stat(join(dir, n))).size })));
  });

  manejar("srv:modrinthBuscar", async (id, q) => {
    const s = obtener(id);
    const tipoProyecto = s.tipo === "paper" ? "plugin" : "mod";
    const facets = [[`project_type:${tipoProyecto}`], cargadores(s).map((c) => `categories:${c}`), [`versions:${s.version}`]];
    const url = new URL("https://api.modrinth.com/v2/search");
    url.searchParams.set("query", typeof q === "string" ? q.slice(0, 100) : "");
    url.searchParams.set("facets", JSON.stringify(facets));
    url.searchParams.set("limit", "24");
    url.searchParams.set("index", q ? "relevance" : "downloads");
    const d = await json<{ hits: { project_id: string; title: string; description: string; icon_url: string | null; downloads: number; author: string; slug: string }[] }>(url.toString());
    return d.hits.map((h) => ({ id: h.project_id, titulo: h.title, descripcion: h.description, icono: h.icon_url, descargas: h.downloads, autor: h.author, url: `https://modrinth.com/${tipoProyecto}/${h.slug}` }));
  });

  manejar("srv:modrinthInstalar", async (id, proyecto) => {
    const s = obtener(id);
    if (typeof proyecto !== "string" || !/^[\w-]{4,40}$/.test(proyecto)) throw new Error("Proyecto inválido");
    const url = `https://api.modrinth.com/v2/project/${proyecto}/version?loaders=${encodeURIComponent(JSON.stringify(cargadores(s)))}&game_versions=${encodeURIComponent(JSON.stringify([s.version]))}`;
    const vers = await json<{ files: { url: string; filename: string; primary: boolean }[] }[]>(url);
    const archivo = vers[0]?.files.find((f) => f.primary) ?? vers[0]?.files[0];
    if (!archivo) throw new Error(`No hay versión para ${s.version}`);
    const dir = join(s.carpeta, carpetaAddons(s));
    await mkdir(dir, { recursive: true });
    const nombre = archivo.filename.replace(/[\\/:*?"<>|]/g, "_");
    await descargar(archivo.url, join(dir, nombre), (p) => progreso(`Bajando ${nombre}… ${p}%`));
    progreso("Listo");
    return nombre;
  });

  // CurseForge: la app consulta la API desde tu servidor (con su clave) y aquí solo se baja el archivo.
  manejar("srv:instalarDesdeUrl", async (id, url, nombreArchivo) => {
    const s = obtener(id);
    if (typeof url !== "string" || !/^https:\/\/(edge|mediafilez)\.forgecdn\.net\//.test(url)) throw new Error("Descarga no permitida");
    if (typeof nombreArchivo !== "string" || !/^[\w .+()[\]-]{1,120}\.(jar|zip)$/i.test(nombreArchivo)) throw new Error("Nombre de archivo inválido");
    const dir = join(s.carpeta, carpetaAddons(s));
    await mkdir(dir, { recursive: true });
    await descargar(url, join(dir, nombreArchivo), (p) => progreso(`Bajando ${nombreArchivo}… ${p}%`));
    progreso("Listo");
    return nombreArchivo;
  });

  manejar("srv:quitarAddon", async (id, nombre) => {
    const s = obtener(id);
    if (typeof nombre !== "string" || /[\\/]/.test(nombre)) throw new Error("Nombre inválido");
    await shell.trashItem(join(s.carpeta, carpetaAddons(s), nombre));
    return true;
  });

  // -------------------------------------------------------------- playit.gg
  manejar("srv:playit", async () => {
    const ruta = join(app.getPath("userData"), "herramientas", "playit.exe");
    if (!existsSync(ruta)) {
      await mkdir(join(app.getPath("userData"), "herramientas"), { recursive: true });
      await descargar("https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64-signed.exe", ruta, (p) => progreso(`Bajando playit.gg… ${p}%`));
      progreso("Listo");
    }
    return ruta;
  });

  // -------------------------------------------------------------- pasar al VPS
  manejar("srv:empaquetar", async (id, soloMundo) => {
    const s = obtener(id);
    const zip = join(tmpdir(), `misetup-${s.id}.zip`);
    await rm(zip, { force: true });
    let elementos = ["."];
    if (soloMundo === true) {
      const nivel = leerPropiedades(s.carpeta)["level-name"] || "world";
      elementos = [nivel, `${nivel}_nether`, `${nivel}_the_end`].filter((n) => existsSync(join(s.carpeta, n)));
      if (!elementos.length) throw new Error("No encontré la carpeta del mundo");
    }
    progreso("Comprimiendo…");
    await new Promise<void>((ok, mal) =>
      execFile(join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "tar.exe"), ["-a", "-c", "-f", zip, ...elementos], { cwd: s.carpeta, windowsHide: true, timeout: 30 * 60_000, maxBuffer: 10 * 1024 * 1024 }, (err) =>
        err ? mal(new Error("No se pudo comprimir (¿el servidor está encendido? apágalo primero)")) : ok(),
      ),
    );
    const { size } = await stat(zip);
    progreso("Listo");
    return { zip, tamano: size };
  });

  /** Sube el .zip a la URL firmada que da Pterodactyl (multipart, sin cargar todo en memoria). */
  manejar("srv:subirZip", async (zipRuta, urlSubida) => {
    if (typeof zipRuta !== "string" || !zipRuta.startsWith(join(tmpdir(), "misetup-")) || !zipRuta.endsWith(".zip")) throw new Error("Archivo inválido");
    if (typeof urlSubida !== "string" || !/^https:\/\//.test(urlSubida)) throw new Error("Dirección de subida inválida");
    const rutaZip: string = zipRuta;
    const { size } = await stat(rutaZip);
    const limite = `----misetup${crypto.randomUUID().replace(/-/g, "")}`;
    const nombre = "misetup-subida.zip";
    const cabecera = Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="files"; filename="${nombre}"\r\nContent-Type: application/zip\r\n\r\n`);
    const pie = Buffer.from(`\r\n--${limite}--\r\n`);
    let enviados = 0;
    let ultimo = -1;
    async function* partes() {
      yield cabecera;
      for await (const trozo of createReadStream(rutaZip, { highWaterMark: 1024 * 1024 })) {
        enviados += (trozo as Buffer).length;
        const pct = Math.floor((enviados / size) * 100);
        if (pct !== ultimo) {
          ultimo = pct;
          progreso(`Subiendo a tu VPS… ${pct}%`);
        }
        yield trozo as Buffer;
      }
      yield pie;
    }
    const url = new URL(urlSubida);
    url.searchParams.set("directory", "/");
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${limite}`, "content-length": String(cabecera.length + size + pie.length) },
      body: Readable.toWeb(Readable.from(partes())) as never,
      duplex: "half",
    } as RequestInit);
    await rm(zipRuta, { force: true });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(r.status === 413 ? "Es muy grande para tu VPS (límite de subida de Wings, upload_limit en config.yml)" : `Wings respondió ${r.status}: ${t.slice(0, 120)}`);
    }
    progreso("Listo");
    return { archivo: nombre };
  });

  manejar("srv:abrirCarpeta", async (id) => {
    await shell.openPath(obtener(id).carpeta);
    return true;
  });

  manejar("srv:leerTexto", async (id, relativo) => {
    const s = obtener(id);
    if (typeof relativo !== "string" || relativo.includes("..")) throw new Error("Ruta inválida");
    return readFile(join(s.carpeta, relativo), "utf8").catch(() => "");
  });

  return {
    hayEncendidos: () => [...vivos.values()].some((v) => v.proceso.exitCode === null),
    detenerTodos: async () => {
      await Promise.all([...vivos.keys()].map((id) => detener(id)));
    },
  };
}
