/** Terminal de esta PC (PowerShell o CMD) dentro de la app de Windows. Lo usan Terminal y Código. */
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { escritorio } from "../lib/plataforma";
import { escribirPortapapeles, leerPortapapeles } from "../lib/portapapeles";
import { opcionesTerminal, usePreferencias } from "../lib/preferencias";
import { avisar, cx } from "./ui";

/**
 * Ctrl+V / Ctrl+Shift+V pegan; Ctrl+C copia si hay texto seleccionado (si no, va
 * a la terminal como siempre). Clic derecho: copia si hay selección; si no, pega.
 */
export function atajosPortapapeles(term: Terminal, contenedor: HTMLElement): () => void {
  const pegar = async () => {
    const texto = await leerPortapapeles();
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
      void escribirPortapapeles(term.getSelection());
      term.clearSelection();
      return false;
    }
    return true;
  });
  const menu = (e: MouseEvent) => {
    e.preventDefault();
    if (term.hasSelection()) {
      void escribirPortapapeles(term.getSelection());
      term.clearSelection();
      avisar("Copiado", "info");
    } else void pegar();
  };
  contenedor.addEventListener("contextmenu", menu);
  return () => contenedor.removeEventListener("contextmenu", menu);
}

/** Avisos de la terminal a su pantalla: tocaste un enlace o seleccionaste texto. */
export const EVENTO_ENLACE = "mi-setup:terminal-enlace";
export const EVENTO_SELECCION = "mi-setup:terminal-seleccion";

/**
 * Enlaces de la terminal (los normales y los de Claude Code, aunque se partan en
 * varias líneas): en vez del aviso del navegador en inglés, la pantalla de
 * Terminal muestra su menú «Abrir / Copiar enlace».
 */
export function enlacesTerminal(term: Terminal): void {
  const avisarEnlace = (uri: string) => window.dispatchEvent(new CustomEvent(EVENTO_ENLACE, { detail: uri }));
  term.options.linkHandler = { activate: (_e, uri) => avisarEnlace(uri), allowNonHttpProtocols: false };
  term.loadAddon(new WebLinksAddon((_e, uri) => avisarEnlace(uri)));
}

/**
 * Celular: mantener presionado selecciona una palabra y, sin soltar, se arrastra para
 * seleccionar más. Al soltar, la pantalla ofrece «Copiar». Devuelve la función para quitarlo.
 */
export function seleccionTactil(term: Terminal, contenedor: HTMLElement): () => void {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let inicio: { x: number; y: number } | null = null;
  let ancla: { col: number; fila: number } | null = null;
  let seleccionando = false;
  const celda = (x: number, y: number) => {
    const pantalla = contenedor.querySelector<HTMLElement>(".xterm-screen") ?? contenedor;
    const r = pantalla.getBoundingClientRect();
    const col = Math.min(term.cols - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * term.cols)));
    const fila = Math.min(term.rows - 1, Math.max(0, Math.floor(((y - r.top) / r.height) * term.rows))) + term.buffer.active.viewportY;
    return { col, fila };
  };
  const marcar = (a: { col: number; fila: number }, b: { col: number; fila: number }) => {
    const [p, q] = a.fila < b.fila || (a.fila === b.fila && a.col <= b.col) ? [a, b] : [b, a];
    term.select(p.col, p.fila, (q.fila - p.fila) * term.cols + (q.col - p.col) + 1);
  };
  const palabra = (c: { col: number; fila: number }) => {
    const linea = term.buffer.active.getLine(c.fila)?.translateToString(false) ?? "";
    let desde = c.col;
    let hasta = c.col;
    while (desde > 0 && /\S/.test(linea[desde - 1] ?? "")) desde--;
    while (hasta < linea.length - 1 && /\S/.test(linea[hasta + 1] ?? "")) hasta++;
    return { desde: { col: desde, fila: c.fila }, hasta: { col: hasta, fila: c.fila } };
  };
  const quitar = () => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = undefined;
  };
  const alTocar = (e: TouchEvent) => {
    const t = e.touches[0];
    if (e.touches.length !== 1 || !t) return quitar();
    inicio = { x: t.clientX, y: t.clientY };
    temporizador = setTimeout(() => {
      if (!inicio) return;
      seleccionando = true;
      const p = palabra(celda(inicio.x, inicio.y));
      ancla = p.desde;
      marcar(p.desde, p.hasta);
      navigator.vibrate?.(15);
    }, 450);
  };
  const alMover = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    if (seleccionando && ancla) {
      e.preventDefault();
      marcar(ancla, celda(t.clientX, t.clientY));
    } else if (inicio && Math.hypot(t.clientX - inicio.x, t.clientY - inicio.y) > 10) quitar();
  };
  const alSoltar = (e: TouchEvent) => {
    quitar();
    inicio = null;
    if (!seleccionando) return;
    seleccionando = false;
    e.preventDefault();
    const texto = term.getSelection();
    if (texto) window.dispatchEvent(new CustomEvent(EVENTO_SELECCION, { detail: texto }));
  };
  contenedor.addEventListener("touchstart", alTocar, { passive: true });
  contenedor.addEventListener("touchmove", alMover, { passive: false });
  contenedor.addEventListener("touchend", alSoltar, { passive: false });
  contenedor.addEventListener("touchcancel", quitar);
  return () => {
    quitar();
    contenedor.removeEventListener("touchstart", alTocar);
    contenedor.removeEventListener("touchmove", alMover);
    contenedor.removeEventListener("touchend", alSoltar);
    contenedor.removeEventListener("touchcancel", quitar);
  };
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
  alTeclear,
}: {
  clave: string;
  shell: string;
  /** Sesión que sigue viva en la app (se retoma con lo último que mostró). */
  ptyInicial?: string;
  visible: boolean;
  registrar: (enviar: ((texto: string, enfocar?: boolean) => void) | null) => void;
  alId: (id: string) => void;
  /** Carpeta donde abre (pantalla Código) y comando que escribe al empezar. */
  cwd?: string;
  comando?: string;
  alTeclear?: (datos: string) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const ajuste = useRef<FitAddon | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const prefs = usePreferencias();
  const opciones = opcionesTerminal(prefs);
  const opcionesIniciales = useRef(opciones);
  const teclear = useRef(alTeclear);
  teclear.current = alTeclear;

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
    enlacesTerminal(term);

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
      teclear.current?.(datos);
    });
    registrar((texto, enfocar = true) => {
      if (id) puente.escribir(id, texto);
      if (enfocar) term.focus();
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
