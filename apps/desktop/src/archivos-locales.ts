/**
 * Archivos de esta PC para el editor de código (pantalla Código).
 * Solo se puede tocar lo que está dentro de carpetas que TÚ elegiste con la
 * ventana de Windows; la página no puede agregar carpetas por su cuenta.
 * Borrar manda a la Papelera. También: comprimir/descomprimir (tar.exe de
 * Windows), plantillas de proyecto y Java + Gradle para compilar plugins y mods.
 */
import { execFile } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { once } from "node:events";
import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { PLANTILLAS } from "./plantillas";

const MAX_LEER = 5 * 1024 * 1024;
const ARCHIVO_CARPETAS = () => join(app.getPath("userData"), "carpetas-codigo.json");
const DIR_HERRAMIENTAS = () => join(app.getPath("userData"), "herramientas");

// Microsoft Build of OpenJDK: su zip abre con el tar de Windows (el de Adoptium usa Deflate64 y no).
const JDK_URL = "https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip";
const GRADLE_URL = "https://services.gradle.org/distributions/gradle-8.12-bin.zip";

function leerCarpetas(): string[] {
  try {
    const d = JSON.parse(readFileSync(ARCHIVO_CARPETAS(), "utf8")) as { carpetas?: unknown };
    return Array.isArray(d.carpetas) ? d.carpetas.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

function guardarCarpetas(carpetas: string[]): void {
  writeFileSync(ARCHIVO_CARPETAS(), JSON.stringify({ carpetas }, null, 2));
}

/** ¿La ruta está dentro de alguna carpeta elegida? (sin escaparse con ..) */
export function dentroDeCarpetas(ruta: unknown): string | null {
  if (typeof ruta !== "string" || !ruta) return null;
  const r = resolve(ruta);
  for (const raiz of leerCarpetas()) {
    const base = resolve(raiz);
    const rel = relative(base, r);
    if (!rel.startsWith("..") && !isAbsolute(rel)) return r;
  }
  return null;
}

function exigir(ruta: unknown): string {
  const r = dentroDeCarpetas(ruta);
  if (!r) throw new Error("Esa ruta no está en tus carpetas de código. Agrégala con «Abrir carpeta».");
  return r;
}

/** Nombre de archivo o carpeta sin rutas ni caracteres prohibidos en Windows. */
function nombreValido(n: unknown): string {
  if (typeof n !== "string" || !n.trim() || /[\\/:*?"<>|]/.test(n) || n === "." || n === "..") throw new Error("Nombre inválido");
  return n.trim();
}

function tar(args: string[], cwd?: string): Promise<void> {
  return new Promise((ok, mal) =>
    // Siempre el tar de Windows (bsdtar): otro tar en el PATH (p. ej. el de Git) confunde "C:" con un servidor.
    execFile(join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "tar.exe"), args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 10 * 60_000 }, (err, _o, e) =>
      err ? mal(new Error((e || err.message).toString().slice(0, 300))) : ok(),
    ),
  );
}

// ---------------------------------------------------------------- Java y Gradle

async function buscarDentro(dir: string, prefijo: string): Promise<string | null> {
  if (!existsSync(dir)) return null;
  const nombre = (await readdir(dir)).find((n) => n.startsWith(prefijo));
  return nombre ? join(dir, nombre) : null;
}

export async function rutasHerramientas(): Promise<{ java: string | null; gradle: string | null }> {
  const java = await buscarDentro(join(DIR_HERRAMIENTAS(), "java"), "jdk");
  const gradle = await buscarDentro(join(DIR_HERRAMIENTAS(), "gradle"), "gradle");
  return { java: java && existsSync(join(java, "bin", "java.exe")) ? java : null, gradle: gradle && existsSync(join(gradle, "bin", "gradle.bat")) ? gradle : null };
}

/** Variables para que la terminal encuentre java y gradle (si ya se instalaron). */
export async function entornoHerramientas(): Promise<Record<string, string>> {
  const { java, gradle } = await rutasHerramientas();
  const extra = [java && join(java, "bin"), gradle && join(gradle, "bin")].filter(Boolean) as string[];
  if (!extra.length) return {};
  const pathActual = process.env["Path"] ?? process.env["PATH"] ?? "";
  return { ...(java ? { JAVA_HOME: java } : {}), Path: [...extra, pathActual].join(";"), PATH: [...extra, pathActual].join(";") };
}

async function descargar(url: string, destino: string, alAvance: (pct: number) => void): Promise<void> {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok || !r.body) throw new Error(`No se pudo descargar (${r.status})`);
  const total = Number(r.headers.get("content-length") ?? 0);
  let llevados = 0;
  let ultimo = -1;
  const salida = createWriteStream(destino);
  const lector = r.body.getReader();
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      // Se copia cada trozo: el que entrega fetch puede reusarse y corromper el archivo.
      if (!salida.write(Buffer.from(value))) await once(salida, "drain");
      llevados += value.length;
      const pct = total ? Math.floor((llevados / total) * 100) : 0;
      if (pct !== ultimo) {
        ultimo = pct;
        alAvance(pct);
      }
    }
  } finally {
    await new Promise<void>((ok, mal) => salida.end((err?: Error | null) => (err ? mal(err) : ok())));
  }
  if (total && llevados !== total) throw new Error("La descarga quedó incompleta; vuelve a intentarlo.");
}

export function registrarArchivosLocales(deLaApp: (e: IpcMainEvent | IpcMainInvokeEvent) => boolean, ventana: () => BrowserWindow | null): void {
  const manejar = <T>(canal: string, fn: (...args: unknown[]) => Promise<T> | T) =>
    ipcMain.handle(canal, async (e, ...args: unknown[]) => {
      if (!deLaApp(e)) throw new Error("No permitido");
      return fn(...args);
    });
  const avisar = (canal: string, ...datos: unknown[]) => {
    const w = ventana();
    if (w && !w.isDestroyed()) w.webContents.send(canal, ...datos);
  };

  manejar("fs:carpetas", () => leerCarpetas());

  manejar("fs:elegirCarpeta", async () => {
    const w = ventana();
    const r = w
      ? await dialog.showOpenDialog(w, { title: "Elige la carpeta de tu proyecto", properties: ["openDirectory", "createDirectory"] })
      : await dialog.showOpenDialog({ title: "Elige la carpeta de tu proyecto", properties: ["openDirectory", "createDirectory"] });
    const elegida = r.filePaths[0];
    if (r.canceled || !elegida) return null;
    const lista = leerCarpetas();
    if (!lista.includes(elegida)) guardarCarpetas([...lista, elegida]);
    return elegida;
  });

  manejar("fs:quitarCarpeta", (ruta) => {
    guardarCarpetas(leerCarpetas().filter((c) => c !== ruta));
    return true;
  });

  manejar("fs:listar", async (ruta) => {
    const dir = exigir(ruta);
    const nombres = await readdir(dir, { withFileTypes: true });
    const filas = await Promise.all(
      nombres
        .map(async (n) => {
          const s = await stat(join(dir, n.name)).catch(() => null);
          return { nombre: n.name, ruta: join(dir, n.name), tipo: n.isDirectory() ? "carpeta" : "archivo", tamano: s?.size ?? 0, modificado: s?.mtimeMs ?? 0 };
        }),
    );
    return filas.sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre) : a.tipo === "carpeta" ? -1 : 1));
  });

  manejar("fs:leer", async (ruta) => {
    const r = exigir(ruta);
    const s = await stat(r);
    if (s.size > MAX_LEER) throw new Error("El archivo pesa más de 5 MB; ábrelo con otro programa.");
    const buf = await readFile(r);
    if (buf.subarray(0, 8000).includes(0)) throw new Error("Es un archivo binario (imagen, .jar, .exe…); no se puede editar como texto.");
    return buf.toString("utf8");
  });

  manejar("fs:escribir", async (ruta, texto) => {
    if (typeof texto !== "string") throw new Error("Contenido inválido");
    await writeFile(exigir(ruta), texto, "utf8");
    return true;
  });

  manejar("fs:crear", async (carpeta, nombre, tipo) => {
    const destino = join(exigir(carpeta), nombreValido(nombre));
    exigir(destino);
    if (existsSync(destino)) throw new Error("Ya existe algo con ese nombre");
    if (tipo === "carpeta") await mkdir(destino);
    else await writeFile(destino, "", { flag: "wx" });
    return destino;
  });

  manejar("fs:renombrar", async (ruta, nuevo) => {
    const de = exigir(ruta);
    const a = join(dirname(de), nombreValido(nuevo));
    exigir(a);
    if (existsSync(a)) throw new Error("Ya existe algo con ese nombre");
    await rename(de, a);
    return a;
  });

  manejar("fs:borrar", async (ruta) => {
    const r = exigir(ruta);
    if (leerCarpetas().some((c) => resolve(c) === r)) throw new Error("Para quitar una carpeta raíz usa «Quitar de la lista».");
    await shell.trashItem(r);
    return true;
  });

  manejar("fs:mostrar", (ruta) => {
    shell.showItemInFolder(exigir(ruta));
    return true;
  });

  // Zip con el tar.exe que trae Windows 10/11 (sin instalar nada).
  manejar("fs:comprimir", async (rutas, nombreZip) => {
    if (!Array.isArray(rutas) || !rutas.length) throw new Error("Elige qué comprimir");
    const lista = rutas.map(exigir);
    const base = dirname(lista[0]!);
    if (lista.some((r) => dirname(r) !== base)) throw new Error("Todo debe estar en la misma carpeta");
    const zip = join(base, nombreValido(nombreZip).replace(/(\.zip)?$/i, ".zip"));
    exigir(zip);
    await tar(["-a", "-c", "-f", zip, ...lista.map((r) => basename(r))], base);
    return zip;
  });

  manejar("fs:descomprimir", async (ruta) => {
    const zip = exigir(ruta);
    const destino = join(dirname(zip), basename(zip).replace(/\.(zip|jar|tar|tgz|tar\.gz|mrpack)$/i, ""));
    exigir(destino);
    await mkdir(destino, { recursive: true });
    await tar(["-x", "-f", zip, "-C", destino]);
    return destino;
  });

  manejar("fs:plantillas", () => PLANTILLAS.map(({ id, nombre, descripcion, necesitaJava, comando }) => ({ id, nombre, descripcion, necesitaJava, comando })));

  manejar("fs:crearProyecto", async (carpeta, plantillaId, nombre) => {
    const p = PLANTILLAS.find((x) => x.id === plantillaId);
    if (!p) throw new Error("Plantilla desconocida");
    const limpio = nombreValido(nombre).replace(/[^\w-]/g, "");
    if (!limpio) throw new Error("Usa letras, números o guiones en el nombre");
    const raiz = join(exigir(carpeta), limpio);
    exigir(raiz);
    if (existsSync(raiz)) throw new Error("Ya existe una carpeta con ese nombre");
    for (const [ruta, contenido] of Object.entries(p.archivos(limpio))) {
      const destino = join(raiz, ruta);
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, contenido, "utf8");
    }
    return raiz;
  });

  manejar("herr:estado", async () => {
    const r = await rutasHerramientas();
    return { java: Boolean(r.java), gradle: Boolean(r.gradle) };
  });

  // Descarga Java 21 (Microsoft OpenJDK) y Gradle a la carpeta de la app (una sola vez, ~300 MB).
  manejar("herr:instalar", async () => {
    const dir = DIR_HERRAMIENTAS();
    await mkdir(dir, { recursive: true });
    const actuales = await rutasHerramientas();
    const pasos: { id: "java" | "gradle"; url: string; nombre: string }[] = [];
    if (!actuales.java) pasos.push({ id: "java", url: JDK_URL, nombre: "Java 21" });
    if (!actuales.gradle) pasos.push({ id: "gradle", url: GRADLE_URL, nombre: "Gradle" });
    for (const p of pasos) {
      const zip = join(dir, `${p.id}.zip`);
      await descargar(p.url, zip, (pct) => avisar("herr:avance", `Bajando ${p.nombre}… ${pct}%`));
      avisar("herr:avance", `Descomprimiendo ${p.nombre}…`);
      const destino = join(dir, p.id);
      await rm(destino, { recursive: true, force: true });
      await mkdir(destino, { recursive: true });
      await tar(["-x", "-f", zip, "-C", destino]);
      await rm(zip, { force: true });
    }
    avisar("herr:avance", "Listo");
    const r = await rutasHerramientas();
    return { java: Boolean(r.java), gradle: Boolean(r.gradle) };
  });
}
