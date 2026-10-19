/** Terminal de esta PC (PowerShell o CMD) dentro de la app de Windows. Lo usan Terminal y Código. */
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { escritorio } from "../lib/plataforma";
import { opcionesTerminal, usePreferencias } from "../lib/preferencias";
import { avisar, cx } from "./ui";

/**
 * Ctrl+V / Ctrl+Shift+V pegan; Ctrl+C copia si hay texto seleccionado (si no, va
 * a la terminal como siempre). Clic derecho: copia si hay selección; si no, pega.
 */
export function atajosPortapapeles(term: Terminal, contenedor: HTMLElement): () => void {
  const pegar = async () => {
    const texto = await navigator.clipboard.readText().catch(() => "");
    if (texto) term.paste(texto);
    else avisar("No hay texto en el portapapeles (o no se dio permiso para leerlo)", "info");
  };
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    const tecla = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && tecla === "v") {
      e.preventDefault();
      void pegar();
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && tecla === "c" && (e.shiftKey || term.hasSelection())) {
      void navigator.clipboard.writeText(term.getSelection());
      term.clearSelection();
      return false;
    }
    return true;
  });
  const menu = (e: MouseEvent) => {
    e.preventDefault();
    if (term.hasSelection()) {
      void navigator.clipboard.writeText(term.getSelection());
      term.clearSelection();
      avisar("Copiado", "info");
    } else void pegar();
  };
  contenedor.addEventListener("contextmenu", menu);
  return () => contenedor.removeEventListener("contextmenu", menu);
}

/** Pestañas locales cerradas con la X: esas terminan PowerShell/CMD; cambiar de pantalla las deja vivas. */
export const cierresLocales = new Set<string>();

/** PowerShell o CMD de esta PC (solo en la app de Windows). */
export function ConsolaLocal({
  clave,
  shell,
  ptyInicial,
  visible,
  registrar,
  alId,
  cwd,
  comando,
}: {
  clave: string;
  shell: string;
  /** Sesión que sigue viva en la app (se retoma con lo último que mostró). */
  ptyInicial?: string;
  visible: boolean;
  registrar: (enviar: ((texto: string) => void) | null) => void;
  alId: (id: string) => void;
  /** Carpeta donde abre (pantalla Código) y comando que escribe al empezar. */
  cwd?: string;
  comando?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const ajuste = useRef<FitAddon | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const prefs = usePreferencias();
  const opciones = opcionesTerminal(prefs);
  const opcionesIniciales = useRef(opciones);

  useEffect(() => {
    const contenedor = caja.current;
    const puente = escritorio()?.terminalLocal;
    if (!contenedor || !puente) return;
    const term = new Terminal({ ...opcionesIniciales.current, cursorBlink: true });
    terminal.current = term;
    const fit = new FitAddon();
    ajuste.current = fit;
    term.loadAddon(fit);
    term.open(contenedor);
    fit.fit();
    const quitarAtajos = atajosPortapapeles(term, contenedor);

    let id: string | null = null;
    let vivo = true;
    const offs = [
      puente.alDatos((pid, datos) => {
        if (pid === id) term.write(datos);
      }),
      puente.alSalida((pid, codigo) => {
        if (pid === id) term.writeln(`\r\n\x1b[90m[terminal cerrada${codigo ? ` (código ${codigo})` : ""}]\x1b[0m`);
      }),
    ];
    const conectar = async () => {
      try {
        if (ptyInicial) {
          id = ptyInicial;
          term.write(await puente.historial(ptyInicial));
          puente.tamano(ptyInicial, term.cols, term.rows);
        } else {
          const r = await puente.abrir(shell, term.cols, term.rows, cwd || comando ? { ...(cwd ? { cwd } : {}), ...(comando ? { comando } : {}) } : undefined);
          if (!vivo) return puente.cerrar(r.id);
          id = r.id;
        }
        alId(id);
        term.focus();
      } catch (err) {
        term.writeln(`\x1b[31m${err instanceof Error ? err.message : "No se pudo abrir la terminal"}\x1b[0m`);
      }
    };
    void conectar();

    const entrada = term.onData((datos) => {
      if (id) puente.escribir(id, datos);
    });
    registrar((texto) => {
      if (id) puente.escribir(id, texto);
      term.focus();
    });
    const tamano = term.onResize(({ cols, rows }) => {
      if (id) puente.tamano(id, cols, rows);
    });
    const observador = new ResizeObserver(() => fit.fit());
    observador.observe(contenedor);

    return () => {
      vivo = false;
      registrar(null);
      if (id && cierresLocales.has(clave)) puente.cerrar(id);
      cierresLocales.delete(clave);
      offs.forEach((off) => off());
      quitarAtajos();
      entrada.dispose();
      tamano.dispose();
      observador.disconnect();
      term.dispose();
      terminal.current = null;
    };
  }, [shell, registrar]);

  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    term.options.theme = opciones.theme;
    term.options.fontFamily = opciones.fontFamily;
    term.options.fontSize = opciones.fontSize;
    ajuste.current?.fit();
  }, [opciones.theme, opciones.fontFamily, opciones.fontSize]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => ajuste.current?.fit());
  }, [visible]);

  return <div ref={caja} className={cx("h-full w-full p-1", !visible && "hidden")} style={{ background: opciones.theme.background }} />;
}
