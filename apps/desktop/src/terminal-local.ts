/**
 * Terminal de esta PC (PowerShell o CMD) para la pantalla Terminal.
 * Las sesiones viven en el proceso principal: si cambias de pantalla o se
 * recarga la ventana, la UI vuelve a engancharse y ve lo último que pasó.
 * Solo la ventana principal con la app cargada (deLaApp) puede usarlas.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, type IPty } from "@lydell/node-pty";
import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { dentroDeCarpetas, entornoHerramientas } from "./archivos-locales";

interface Shell {
  id: "pwsh" | "powershell" | "cmd";
  nombre: string;
  ruta: string;
  args: string[];
}

interface Sesion {
  id: string;
  shell: Shell;
  pty: IPty;
  /** Últimos ~200 KB de salida, para volver a pintar la pantalla al regresar. */
  historial: string;
  viva: boolean;
}

const MAX_HISTORIAL = 200_000;
const MAX_SESIONES = 8;

function shellsDisponibles(): Shell[] {
  const sistema = process.env["SystemRoot"] ?? "C:\\Windows";
  const lista: Shell[] = [];
  const pwsh = [join(process.env["ProgramFiles"] ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe")].find((r) => existsSync(r));
  if (pwsh) lista.push({ id: "pwsh", nombre: "PowerShell 7", ruta: pwsh, args: ["-NoLogo"] });
  lista.push({ id: "powershell", nombre: "PowerShell", ruta: join(sistema, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), args: ["-NoLogo"] });
  lista.push({ id: "cmd", nombre: "CMD", ruta: join(sistema, "System32", "cmd.exe"), args: [] });
  return lista.filter((s) => existsSync(s.ruta));
}

const numero = (v: unknown, min: number, max: number, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : def);

export function registrarTerminalLocal(
  deLaApp: (e: IpcMainEvent | IpcMainInvokeEvent) => boolean,
  ventana: () => BrowserWindow | null,
): { cerrarTodas: () => void } {
  const sesiones = new Map<string, Sesion>();
  const enviar = (canal: string, ...args: unknown[]) => {
    const w = ventana();
    if (w && !w.isDestroyed()) w.webContents.send(canal, ...args);
  };

  ipcMain.handle("pty:shells", (e) => (deLaApp(e) ? shellsDisponibles().map(({ id, nombre }) => ({ id, nombre })) : []));

  ipcMain.handle("pty:lista", (e) =>
    deLaApp(e) ? [...sesiones.values()].map((s) => ({ id: s.id, shell: s.shell.id, nombre: s.shell.nombre, viva: s.viva })) : [],
  );

  ipcMain.handle("pty:historial", (e, id: unknown) => (deLaApp(e) && typeof id === "string" ? (sesiones.get(id)?.historial ?? "") : ""));

  ipcMain.handle("pty:abrir", async (e, shellId: unknown, cols: unknown, rows: unknown, opciones: unknown) => {
    if (!deLaApp(e)) return null;
    const shell = shellsDisponibles().find((s) => s.id === shellId) ?? shellsDisponibles()[0];
    if (!shell) throw new Error("No encontré PowerShell ni CMD en esta PC");
    if ([...sesiones.values()].filter((s) => s.viva).length >= MAX_SESIONES) throw new Error(`Máximo ${MAX_SESIONES} terminales abiertas a la vez`);
    // Desde la pantalla Código: abrir en la carpeta del proyecto (solo carpetas que elegiste) y escribir un comando.
    const o = (typeof opciones === "object" && opciones !== null ? opciones : {}) as { cwd?: unknown; comando?: unknown };
    const cwd = o.cwd !== undefined ? dentroDeCarpetas(o.cwd) : homedir();
    if (!cwd) throw new Error("Esa carpeta no está en tus carpetas de código");
    const comando = typeof o.comando === "string" && o.comando.length <= 500 && !/[\r\n]/.test(o.comando) ? o.comando : null;
    const pty = spawn(shell.ruta, shell.args, {
      name: "xterm-256color",
      cols: numero(cols, 20, 500, 100),
      rows: numero(rows, 5, 200, 30),
      cwd,
      env: { ...(process.env as Record<string, string>), ...(await entornoHerramientas()) },
    });
    if (comando) setTimeout(() => pty.write(`${comando}\r`), 900);
    const id = crypto.randomUUID();
    const sesion: Sesion = { id, shell, pty, historial: "", viva: true };
    sesiones.set(id, sesion);
    pty.onData((datos) => {
      sesion.historial = (sesion.historial + datos).slice(-MAX_HISTORIAL);
      enviar("pty:datos", id, datos);
    });
    pty.onExit(({ exitCode }) => {
      sesion.viva = false;
      enviar("pty:salida", id, exitCode);
    });
    return { id, nombre: shell.nombre };
  });

  ipcMain.on("pty:escribir", (e, id: unknown, datos: unknown) => {
    if (!deLaApp(e) || typeof id !== "string" || typeof datos !== "string") return;
    const s = sesiones.get(id);
    if (s?.viva) s.pty.write(datos);
  });

  ipcMain.on("pty:tamano", (e, id: unknown, cols: unknown, rows: unknown) => {
    if (!deLaApp(e) || typeof id !== "string") return;
    const s = sesiones.get(id);
    if (s?.viva) s.pty.resize(numero(cols, 20, 500, 100), numero(rows, 5, 200, 30));
  });

  ipcMain.on("pty:cerrar", (e, id: unknown) => {
    if (!deLaApp(e) || typeof id !== "string") return;
    const s = sesiones.get(id);
    if (!s) return;
    if (s.viva) s.pty.kill();
    sesiones.delete(id);
  });

  return {
    cerrarTodas: () => {
      for (const s of sesiones.values()) if (s.viva) s.pty.kill();
      sesiones.clear();
    },
  };
}
