/**
 * Host local: servidores de juego en esta PC (Minecraft Paper, Purpur, Folia,
 * Fabric, Quilt, Forge, NeoForge, Mohist, Arclight, Vanilla, el proxy Velocity,
 * o cualquier otro con un comando propio).
 * - Baja el servidor y el Java que pide esa versión (Microsoft OpenJDK).
 * - Consola en vivo, encender/apagar, RAM, puerto y server.properties.
 * - Mods y plugins desde Modrinth (y CurseForge con la clave del servidor).
 * - playit.gg para que tus amigos entren sin abrir puertos.
 * - Empaquetar y subir a tu Pterodactyl ("Pasar a mi VPS").
 */
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { agregarCarpeta, asegurarJava, descargar, tar } from "./archivos-locales";

type Tipo = "paper" | "purpur" | "folia" | "fabric" | "quilt" | "forge" | "neoforge" | "mohist" | "arclight" | "vanilla" | "velocity" | "personalizado";
type Estado = "detenido" | "iniciando" | "encendido" | "deteniendo";
type Clase = "plugins" | "mods";
const TIPOS: Tipo[] = ["paper", "purpur", "folia", "fabric", "quilt", "forge", "neoforge", "mohist", "arclight", "vanilla", "velocity", "personalizado"];
/** Cargadores de plugins que entiende cada tipo (Modrinth). */
const PLUGINS: Partial<Record<Tipo, string[]>> = {
  paper: ["paper", "spigot", "bukkit"],
  purpur: ["purpur", "paper", "spigot", "bukkit"],
  folia: ["folia"],
  velocity: ["velocity"],
  mohist: ["paper", "spigot", "bukkit"],
  arclight: ["paper", "spigot", "bukkit"],
};
/** Cargador de mods fijo (en Mohist y Arclight depende de la versión: se guarda al crear). */
const MODS: Partial<Record<Tipo, string>> = { fabric: "fabric", quilt: "quilt", forge: "forge", neoforge: "neoforge" };
const SUFIJO_CARGADOR = /-(forge|neoforge|fabric)$/;

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
  /** Forge/NeoForge: archivo de argumentos que deja el instalador. */
  argsForge?: string;
  /** Jar que se arranca si no es server.jar (Quilt). */
  jar?: string;
  /** Mohist/Arclight: cargador de mods (forge, neoforge o fabric). */
  cargadorMods?: string;
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

/** Versión de Minecraft del servidor (Arclight guarda "1.21.1-neoforge"). */
const mcDe = (s: { tipo: Tipo; version: string }) => (s.tipo === "velocity" ? "" : s.version.replace(SUFIJO_CARGADOR, ""));
const desde = (minimo: string) => (v: string) => compararVersiones(v, minimo) <= 0;

/** NeoForge numera distinto: 21.1.x es Minecraft 1.21.1 y 26.3.0.x es 26.3. */
function mcDeNeoForge(v: string): string | null {
  const p = v.split(".");
  if (p.length < 3 || /[a-z]/i.test(v)) return null;
  if (Number(p[0]) >= 26) return p[2] === "0" ? `${p[0]}.${p[1]}` : `${p[0]}.${p[1]}.${p[2]}`;
  return p[1] === "0" ? `1.${p[0]}` : `1.${p[0]}.${p[1]}`;
}
async function neoForgeDe(mc: string): Promise<string | null> {
  const d = await json<{ versions: string[] }>("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge");
  return [...d.versions].reverse().find((v) => mcDeNeoForge(v) === mc) ?? null;
}

interface ReleaseGh {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}
/** Arclight: un jar por Minecraft y cargador; se prefiere el que no es SNAPSHOT. */
async function jarsArclight(): Promise<Map<string, string>> {
  const rel = await json<ReleaseGh[]>("https://api.github.com/repos/IzzelAliz/Arclight/releases?per_page=60");
  const mapa = new Map<string, { url: string; snapshot: boolean }>();
  for (const r of rel) {
    for (const a of r.assets) {
      const m = /^arclight-(forge|neoforge|fabric)-([\d.]+)-.+\.jar$/.exec(a.name);
      if (!m) continue;
      const clave = `${m[2]}-${m[1]}`;
      const snapshot = /SNAPSHOT/i.test(a.name);
      const previo = mapa.get(clave);
      if (!previo || (previo.snapshot && !snapshot)) mapa.set(clave, { url: a.browser_download_url, snapshot });
    }
  }
  return new Map([...mapa].map(([k, v]) => [k, v.url]));
}

async function versionesFill(proyecto: "paper" | "folia" | "velocity"): Promise<string[]> {
  const d = await json<{ versions: Record<string, string[]> }>(`https://fill.papermc.io/v3/projects/${proyecto}`);
  return Object.values(d.versions).flat().filter(esEstable).sort(compararVersiones);
}

async function versiones(tipo: Tipo): Promise<string[]> {
  if (tipo === "paper" || tipo === "folia" || tipo === "velocity") return versionesFill(tipo);
  if (tipo === "purpur") {
    const d = await json<{ versions: string[] }>("https://api.purpurmc.org/v2/purpur");
    return d.versions.filter((v) => esEstable(v) && desde("1.17")(v)).sort(compararVersiones);
  }
  if (tipo === "quilt") {
    const d = await json<{ version: string; stable: boolean }[]>("https://meta.quiltmc.org/v3/versions/game");
    return d.filter((v) => v.stable && desde("1.17")(v.version)).map((v) => v.version);
  }
  if (tipo === "neoforge") {
    const d = await json<{ versions: string[] }>("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge");
    return [...new Set(d.versions.map(mcDeNeoForge).filter((v): v is string => !!v))].sort(compararVersiones);
  }
  if (tipo === "mohist") {
    // Desde 1.18.2: las anteriores piden Java 8, que Microsoft ya no publica.
    const d = await json<{ name: string }[]>("https://api.mohistmc.com/project/mohist/versions");
    return d.map((v) => v.name).filter((v) => esEstable(v) && desde("1.18.2")(v)).sort(compararVersiones);
  }
  if (tipo === "arclight") {
    return [...(await jarsArclight()).keys()].filter((k) => desde("1.18")(k.replace(SUFIJO_CARGADOR, ""))).sort((a, b) => compararVersiones(a.replace(SUFIJO_CARGADOR, ""), b.replace(SUFIJO_CARGADOR, "")) || a.localeCompare(b));
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

/** Qué puede llevar el servidor: plugins, mods o (Mohist/Arclight) las dos cosas. */
function clases(s: Servidor): Clase[] {
  const out: Clase[] = [];
  if (MODS[s.tipo] ?? s.cargadorMods) out.push("mods");
  if (PLUGINS[s.tipo]) out.push("plugins");
  return out;
}
function claseDe(s: Servidor, pedida: unknown): Clase {
  const c = clases(s);
  const elegida = c.find((x) => x === pedida) ?? c[0];
  if (!elegida) throw new Error("Este servidor no usa mods ni plugins");
  return elegida;
}
const cargadores = (s: Servidor, clase: Clase): string[] => (clase === "plugins" ? (PLUGINS[s.tipo] ?? []) : [MODS[s.tipo] ?? s.cargadorMods ?? ""].filter(Boolean));

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
    return { ...s, mc: mcDe(s), clases: clases(s), estado: (v?.estado ?? "detenido") as Estado, jugadores: [...(v?.jugadores ?? [])], desde: v?.inicio ?? null, ip: ipLocal() };
  };

  async function instalar(s: Servidor, java: string): Promise<Partial<Servidor>> {
    const destino = join(s.carpeta, "server.jar");
    const v = encodeURIComponent(s.version);
    /** Instalador de Forge/NeoForge: deja libraries/.../win_args.txt para arrancar. */
    const conInstalador = async (nombre: string, urlInstalador: string, args: string): Promise<Partial<Servidor>> => {
      const inst = join(s.carpeta, "instalador.jar");
      await descargar(urlInstalador, inst, (p) => progreso(`Bajando ${nombre}… ${p}%`));
      progreso(`Instalando ${nombre} (puede tardar un par de minutos)…`);
      await new Promise<void>((ok, mal) => {
        const p = spawn(java, ["-jar", "instalador.jar", "--installServer"], { cwd: s.carpeta, windowsHide: true });
        p.stdout.on("data", (d: Buffer) => progreso(`${nombre}: ${d.toString().trim().split("\n").pop()?.slice(0, 90) ?? ""}`));
        p.on("exit", (c) => (c === 0 ? ok() : mal(new Error(`El instalador de ${nombre} falló`))));
        p.on("error", mal);
      });
      await rm(inst, { force: true });
      await rm(join(s.carpeta, "instalador.jar.log"), { force: true });
      if (!existsSync(join(s.carpeta, args))) throw new Error(`${nombre} no dejó su archivo de arranque`);
      return { argsForge: args };
    };
    if (s.tipo === "paper" || s.tipo === "folia" || s.tipo === "velocity") {
      const b = await json<{ downloads: Record<string, { url: string }> }>(`https://fill.papermc.io/v3/projects/${s.tipo}/versions/${v}/builds/latest`);
      const url = b.downloads["server:default"]?.url;
      if (!url) throw new Error("No hay descarga para esa versión");
      await descargar(url, destino, (p) => progreso(`Bajando ${s.tipo} ${s.version}… ${p}%`));
    } else if (s.tipo === "purpur") {
      await descargar(`https://api.purpurmc.org/v2/purpur/${v}/latest/download`, destino, (p) => progreso(`Bajando Purpur ${s.version}… ${p}%`));
    } else if (s.tipo === "mohist") {
      await descargar(`https://api.mohistmc.com/project/mohist/${v}/builds/latest/download`, destino, (p) => progreso(`Bajando Mohist ${s.version}… ${p}%`));
      return { cargadorMods: compararVersiones(s.version, "1.20.1") < 0 ? "neoforge" : "forge" };
    } else if (s.tipo === "arclight") {
      const url = (await jarsArclight()).get(s.version);
      if (!url) throw new Error("Arclight no tiene esa versión");
      await descargar(url, destino, (p) => progreso(`Bajando Arclight… ${p}%`));
      return { cargadorMods: SUFIJO_CARGADOR.exec(s.version)?.[1] ?? "forge" };
    } else if (s.tipo === "neoforge") {
      const nv = await neoForgeDe(s.version);
      if (!nv) throw new Error("NeoForge no tiene versión para ese Minecraft");
      return conInstalador(`NeoForge ${nv}`, `https://maven.neoforged.net/releases/net/neoforged/neoforge/${nv}/neoforge-${nv}-installer.jar`, `libraries/net/neoforged/neoforge/${nv}/win_args.txt`);
    } else if (s.tipo === "quilt") {
      const inst = (await json<{ version: string; url: string }[]>("https://meta.quiltmc.org/v3/versions/installer"))[0];
      if (!inst) throw new Error("No encontré el instalador de Quilt");
      const archivo = join(s.carpeta, "instalador.jar");
      await descargar(inst.url, archivo, (p) => progreso(`Bajando Quilt… ${p}%`));
      // Ruta relativa: el instalador de Quilt corta la ruta en los espacios ("MiSetup Servidores").
      progreso("Instalando Quilt…");
      await new Promise<void>((ok, mal) => {
        const p = spawn(java, ["-jar", "instalador.jar", "install", "server", s.version, "--download-server", "--install-dir=."], { cwd: s.carpeta, windowsHide: true });
        p.stdout.on("data", (d: Buffer) => progreso(`Quilt: ${d.toString().trim().split("\n").pop()?.slice(0, 90) ?? ""}`));
        p.on("exit", (c) => (c === 0 ? ok() : mal(new Error("El instalador de Quilt falló (¿Quilt ya soporta esa versión?)"))));
        p.on("error", mal);
      });
      await rm(archivo, { force: true });
      if (!existsSync(join(s.carpeta, "quilt-server-launch.jar"))) throw new Error("Quilt no dejó su archivo de arranque");
      return { jar: "quilt-server-launch.jar" };
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
      return conInstalador(`Forge ${fv}`, `https://maven.minecraftforge.net/net/minecraftforge/forge/${completo}/forge-${completo}-installer.jar`, `libraries/net/minecraftforge/forge/${completo}/win_args.txt`);
    }
    return {};
  }

  manejar("srv:lista", () => leer().map(vista));
  manejar("srv:versiones", (tipo) => versiones(tipo as Tipo));

  manejar("srv:crear", async (datos) => {
    const d = datos as { nombre?: unknown; tipo?: unknown; version?: unknown; ramMb?: unknown; puerto?: unknown; eula?: unknown; comando?: unknown };
    const nombre = typeof d.nombre === "string" ? d.nombre.trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 40) : "";
    if (!nombre) throw new Error("Ponle nombre al servidor");
    const tipo = TIPOS.find((t) => t === d.tipo);
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

    if (d.eula !== true && tipo !== "velocity") throw new Error("Para crear un servidor de Minecraft tienes que aceptar la EULA de Mojang");
    const version = typeof d.version === "string" && /^[\w.-]{2,20}$/.test(d.version) ? d.version : "";
    if (!version) throw new Error("Elige la versión");
    const carpeta = join(BASE_SERVIDORES(), nombre);
    if (existsSync(carpeta)) throw new Error("Ya hay una carpeta con ese nombre en Documentos\\MiSetup Servidores");
    await mkdir(carpeta, { recursive: true });
    try {
      progreso("Revisando qué Java necesita esa versión…");
      // Velocity 4 se compiló con Java 25; la 3 corre con 21.
      const { java: mayor } = tipo === "velocity" ? { java: Number(version.split(".")[0]) >= 4 ? 25 : 21 } : await javaDe(mcDe({ tipo, version }));
      const java = await asegurarJava(mayor, progreso);
      const s: Servidor = { ...base, carpeta, version, java: mayor };
      Object.assign(s, await instalar(s, java));
      if (tipo !== "velocity") {
        await writeFile(join(carpeta, "eula.txt"), `# Aceptada por el usuario en Mi Setup el ${new Date().toISOString()}\neula=true\n`);
        escribirPropiedades(carpeta, { "server-port": String(puerto), motd: `${nombre} · MexicanLand`, "max-players": "10" });
      }
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
      // Velocity (proxy) no lee server.properties: el puerto va en la línea de comandos.
      const args = s.argsForge
        ? [...memoria, `@${s.argsForge}`, "nogui"]
        : s.tipo === "velocity"
          ? [...memoria, "-jar", "server.jar", "--port", String(s.puerto)]
          : [...memoria, "-jar", s.jar ?? "server.jar", "nogui"];
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
      if (s.tipo !== "personalizado" && s.tipo !== "velocity") escribirPropiedades(s.carpeta, { "server-port": String(p) });
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
  manejar("srv:addons", async (id, clase) => {
    const s = obtener(id);
    const dir = join(s.carpeta, claseDe(s, clase));
    if (!existsSync(dir)) return [];
    const nombres = (await readdir(dir)).filter((n) => /\.(jar|zip)$/i.test(n));
    return Promise.all(nombres.map(async (n) => ({ nombre: n, tamano: (await stat(join(dir, n))).size })));
  });

  /** Búsqueda en Modrinth con páginas de 24 (pagina 0, 1, 2…). clase "modpacks" busca modpacks del cargador del servidor. */
  manejar("srv:modrinthBuscar", async (id, q, clase, pagina) => {
    const s = obtener(id);
    const esPack = clase === "modpacks";
    const c = esPack ? "mods" : claseDe(s, clase);
    const tipoProyecto = esPack ? "modpack" : c === "plugins" ? "plugin" : "mod";
    const mc = mcDe(s);
    const cargs = esPack ? [MODS[s.tipo] ?? ""].filter(Boolean) : cargadores(s, c);
    if (esPack && !cargs.length) throw new Error("Los modpacks son para servidores Fabric, Quilt, Forge o NeoForge");
    const facets = [[`project_type:${tipoProyecto}`], cargs.map((x) => `categories:${x}`), ...(mc ? [[`versions:${mc}`]] : [])];
    const n = typeof pagina === "number" && pagina >= 0 && pagina < 400 ? Math.floor(pagina) : 0;
    const url = new URL("https://api.modrinth.com/v2/search");
    url.searchParams.set("query", typeof q === "string" ? q.slice(0, 100) : "");
    url.searchParams.set("facets", JSON.stringify(facets));
    url.searchParams.set("limit", "24");
    url.searchParams.set("offset", String(n * 24));
    url.searchParams.set("index", q ? "relevance" : "downloads");
    const d = await json<{ hits: { project_id: string; title: string; description: string; icon_url: string | null; downloads: number; author: string; slug: string }[] }>(url.toString());
    return d.hits.map((h) => ({ id: h.project_id, titulo: h.title, descripcion: h.description, icono: h.icon_url, descargas: h.downloads, autor: h.author, url: `https://modrinth.com/${tipoProyecto}/${h.slug}` }));
  });

  manejar("srv:modrinthInstalar", async (id, proyecto, clase) => {
    const s = obtener(id);
    const c = claseDe(s, clase);
    if (typeof proyecto !== "string" || !/^[\w-]{4,40}$/.test(proyecto)) throw new Error("Proyecto inválido");
    const mc = mcDe(s);
    const url = `https://api.modrinth.com/v2/project/${proyecto}/version?loaders=${encodeURIComponent(JSON.stringify(cargadores(s, c)))}${mc ? `&game_versions=${encodeURIComponent(JSON.stringify([mc]))}` : ""}`;
    const vers = await json<{ files: { url: string; filename: string; primary: boolean }[] }[]>(url);
    const archivo = vers[0]?.files.find((f) => f.primary) ?? vers[0]?.files[0];
    if (!archivo) throw new Error(`No hay versión para ${mc || s.version}`);
    const dir = join(s.carpeta, c);
    await mkdir(dir, { recursive: true });
    const nombre = archivo.filename.replace(/[\\/:*?"<>|]/g, "_");
    await descargar(archivo.url, join(dir, nombre), (p) => progreso(`Bajando ${nombre}… ${p}%`));
    progreso("Listo");
    return nombre;
  });

  /**
   * Modpack de Modrinth (.mrpack): baja los mods que usa el servidor (verifica
   * su sha1) y copia overrides/ y server-overrides/. Solo descarga de los
   * dominios que permite el formato .mrpack y nunca escribe fuera de la carpeta.
   */
  manejar("srv:modpackInstalar", async (id, proyecto) => {
    const s = obtener(id);
    if (typeof proyecto !== "string" || !/^[\w-]{4,40}$/.test(proyecto)) throw new Error("Modpack inválido");
    const cargador = MODS[s.tipo];
    if (!cargador) throw new Error("Los modpacks son para servidores Fabric, Quilt, Forge o NeoForge");
    if (vivos.get(s.id)?.proceso.exitCode === null) throw new Error("Apaga el servidor antes de instalar el modpack");
    const mc = mcDe(s);
    const vers = await json<{ name: string; files: { url: string; filename: string; primary: boolean }[] }[]>(
      `https://api.modrinth.com/v2/project/${proyecto}/version?loaders=${encodeURIComponent(JSON.stringify([cargador]))}${mc ? `&game_versions=${encodeURIComponent(JSON.stringify([mc]))}` : ""}`,
    );
    const version = vers[0];
    const archivo = version?.files.find((f) => f.filename.endsWith(".mrpack")) ?? version?.files.find((f) => f.primary);
    if (!version || !archivo) throw new Error(`Ese modpack no tiene versión para ${cargador} ${mc || s.version}. Crea un servidor con la versión que pide el modpack.`);
    const tmp = join(tmpdir(), `misetup-pack-${s.id}`);
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    try {
      const zip = join(tmp, "pack.zip");
      await descargar(archivo.url, zip, (p) => progreso(`Bajando el modpack… ${p}%`));
      const extraido = join(tmp, "x");
      await mkdir(extraido);
      await tar(["-x", "-f", zip, "-C", extraido]);
      const indice = JSON.parse(await readFile(join(extraido, "modrinth.index.json"), "utf8")) as {
        files?: { path: string; hashes?: { sha1?: string }; env?: { server?: string }; downloads?: string[] }[];
        dependencies?: Record<string, string>;
      };
      const mcPack = indice.dependencies?.["minecraft"];
      if (mcPack && mc && mcPack !== mc) throw new Error(`El modpack es para Minecraft ${mcPack} y tu servidor es ${mc}. Crea uno con esa versión.`);
      const base = resolve(s.carpeta);
      const destinoSeguro = (ruta: string): string => {
        const final = resolve(base, normalize(ruta).replace(/^[/\\]+/, ""));
        const rel = relative(base, final);
        if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Ruta no permitida en el modpack: ${ruta}`);
        return final;
      };
      const archivos = (indice.files ?? []).filter((f) => f.env?.server !== "unsupported");
      let hechos = 0;
      for (const f of archivos) {
        const url = (f.downloads ?? []).find((u) => /^https:\/\/(cdn\.modrinth\.com|github\.com|raw\.githubusercontent\.com|gitlab\.com)\//.test(u));
        if (!url) continue;
        const destino = destinoSeguro(f.path);
        await mkdir(dirname(destino), { recursive: true });
        await descargar(url, destino, () => undefined);
        if (f.hashes?.sha1) {
          const sha1 = createHash("sha1").update(await readFile(destino)).digest("hex");
          if (sha1 !== f.hashes.sha1) {
            await rm(destino, { force: true });
            throw new Error(`El archivo ${f.path} no coincide con el del modpack (se canceló)`);
          }
        }
        hechos++;
        progreso(`Instalando el modpack… ${hechos}/${archivos.length}`);
      }
      for (const carpeta of ["overrides", "server-overrides"]) {
        const origen = join(extraido, carpeta);
        if (existsSync(origen)) await cp(origen, base, { recursive: true, force: true });
      }
      progreso("Listo");
      return { nombre: version.name, archivos: hechos };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  // CurseForge: la app consulta la API desde tu servidor (con su clave) y aquí solo se baja el archivo.
  manejar("srv:instalarDesdeUrl", async (id, url, nombreArchivo, clase) => {
    const s = obtener(id);
    if (typeof url !== "string" || !/^https:\/\/(edge|mediafilez)\.forgecdn\.net\//.test(url)) throw new Error("Descarga no permitida");
    if (typeof nombreArchivo !== "string" || !/^[\w .+()[\]-]{1,120}\.(jar|zip)$/i.test(nombreArchivo)) throw new Error("Nombre de archivo inválido");
    const dir = join(s.carpeta, claseDe(s, clase));
    await mkdir(dir, { recursive: true });
    await descargar(url, join(dir, nombreArchivo), (p) => progreso(`Bajando ${nombreArchivo}… ${p}%`));
    progreso("Listo");
    return nombreArchivo;
  });

  manejar("srv:quitarAddon", async (id, nombre, clase) => {
    const s = obtener(id);
    if (typeof nombre !== "string" || /[\\/]/.test(nombre)) throw new Error("Nombre inválido");
    await shell.trashItem(join(s.carpeta, claseDe(s, clase), nombre));
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
