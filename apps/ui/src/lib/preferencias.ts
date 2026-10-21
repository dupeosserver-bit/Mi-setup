/**
 * Preferencias de la cuenta aplicadas a la interfaz: tema (variables CSS),
 * fuente, zoom (tamaño de letra base) y temas de la terminal. Se guardan en el
 * servidor (se sincronizan entre PC y celular) y se copian en este
 * dispositivo para aplicarlas al instante al abrir la app.
 */
import { FUENTES_APP, FUENTES_TERMINAL, PREFERENCIAS_INICIALES, preferenciasSchema, type Preferencias, type TemaTerminal } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ITheme } from "@xterm/xterm";
import { useEffect, useRef, useState, type PointerEvent as EventoPuntero } from "react";
import { create } from "zustand";
import { api } from "./api";
import { queryClient } from "./consultas";
import { idiomaGuardado, ponerIdioma } from "./idioma";
import { useSesion } from "./sesion";

const CLAVE = "mi-setup.prefs";

function leerLocal(): Preferencias {
  try {
    const r = preferenciasSchema.safeParse(JSON.parse(localStorage.getItem(CLAVE) ?? "{}"));
    return r.success ? r.data : PREFERENCIAS_INICIALES;
  } catch {
    return PREFERENCIAS_INICIALES;
  }
}

let quitarEscucha: (() => void) | null = null;
let idiomaPuesto: string | null = null;

/**
 * Fondo de pantalla con paneles transparentes: mezcla el color del tema con transparente.
 * Se lee el color del tema sin el ajuste anterior para no encimar transparencias.
 */
function aplicarVidrio(p: Preferencias): void {
  const raiz = document.documentElement;
  raiz.style.setProperty("--velo", String(p.vidrio.velo));
  for (const v of ["--superficie", "--tarjeta"]) raiz.style.removeProperty(v);
  if (p.vidrio.paneles <= 0) return;
  const estilo = getComputedStyle(raiz);
  for (const v of ["--superficie", "--tarjeta"]) {
    const base = estilo.getPropertyValue(v).trim();
    if (base) raiz.style.setProperty(v, `color-mix(in srgb, ${base} ${100 - p.vidrio.paneles}%, transparent)`);
  }
}

/** Aplica tema, fuente y zoom al documento. */
export function aplicarPreferencias(p: Preferencias): void {
  const raiz = document.documentElement;
  quitarEscucha?.();
  quitarEscucha = null;
  if (p.tema === "sistema") {
    const consulta = window.matchMedia("(prefers-color-scheme: light)");
    const poner = () => {
      raiz.dataset["tema"] = consulta.matches ? "claro" : "oscuro";
      aplicarVidrio(p);
    };
    poner();
    consulta.addEventListener("change", poner);
    quitarEscucha = () => consulta.removeEventListener("change", poner);
  } else {
    raiz.dataset["tema"] = p.tema;
  }
  aplicarVidrio(p);
  raiz.style.setProperty("--fuente", FUENTES_APP[p.fuente].css);
  // El zoom escala el tamaño base: toda la interfaz usa rem, así que crece o se achica entera.
  raiz.style.fontSize = `${(16 * p.zoom) / 100}px`;
  if (p.idioma && p.idioma !== idiomaPuesto) {
    idiomaPuesto = p.idioma;
    void ponerIdioma(p.idioma);
  }
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    /* sin almacenamiento: se aplica igual */
  }
}

/** Al arrancar: aplica lo último guardado en este dispositivo (sin esperar al servidor). */
export function aplicarPreferenciasGuardadas(): void {
  // El idioma elegido en este dispositivo manda al arrancar (también en la pantalla de entrar).
  aplicarPreferencias({ ...leerLocal(), idioma: idiomaGuardado() });
}

export function usePreferencias() {
  const hay = useSesion((s) => Boolean(s.refreshToken));
  const consulta = useQuery({
    queryKey: ["preferencias"],
    queryFn: () => api<Preferencias>("/api/preferencias"),
    enabled: hay,
    placeholderData: leerLocal,
  });
  useEffect(() => {
    if (consulta.data && !consulta.isPlaceholderData) aplicarPreferencias(consulta.data);
  }, [consulta.data, consulta.isPlaceholderData]);
  return consulta.data ?? PREFERENCIAS_INICIALES;
}

/** Cambia una parte de las preferencias, la aplica al momento y la guarda en el servidor. */
export function useGuardarPreferencias() {
  const actuales = usePreferencias();
  const m = useMutation({
    mutationFn: (p: Preferencias) => api<Preferencias>("/api/preferencias", { metodo: "PUT", cuerpo: p }),
    onSuccess: (p) => queryClient.setQueryData(["preferencias"], p),
  });
  return (cambio: (p: Preferencias) => Preferencias) => {
    const nuevas = cambio(actuales);
    aplicarPreferencias(nuevas);
    queryClient.setQueryData(["preferencias"], nuevas);
    m.mutate(nuevas);
  };
}

// ---------------------------------------------------------------- terminal

export const TEMAS_XTERM: Record<TemaTerminal, ITheme> = {
  "mi-setup": { background: "#121212", foreground: "#F2F2F7", cursor: "#E5E5EA", selectionBackground: "#48484A" },
  termius: {
    background: "#141729",
    foreground: "#21D07A",
    cursor: "#21D07A",
    selectionBackground: "#2A3150",
    green: "#21D07A",
    brightGreen: "#5BE39E",
    blue: "#4C8DFF",
    cyan: "#3BC9DB",
    magenta: "#E95A97",
  },
  dracula: {
    background: "#282A36",
    foreground: "#F8F8F2",
    cursor: "#F8F8F2",
    selectionBackground: "#44475A",
    black: "#21222C",
    red: "#FF5555",
    green: "#50FA7B",
    yellow: "#F1FA8C",
    blue: "#BD93F9",
    magenta: "#FF79C6",
    cyan: "#8BE9FD",
    white: "#F8F8F2",
  },
  monokai: {
    background: "#272822",
    foreground: "#F8F8F2",
    cursor: "#F8F8F0",
    selectionBackground: "#49483E",
    red: "#F92672",
    green: "#A6E22E",
    yellow: "#E6DB74",
    blue: "#66D9EF",
    magenta: "#AE81FF",
    cyan: "#A1EFE4",
  },
  nord: {
    background: "#2E3440",
    foreground: "#D8DEE9",
    cursor: "#D8DEE9",
    selectionBackground: "#434C5E",
    red: "#BF616A",
    green: "#A3BE8C",
    yellow: "#EBCB8B",
    blue: "#81A1C1",
    magenta: "#B48EAD",
    cyan: "#88C0D0",
  },
  "solarized-oscuro": {
    background: "#002B36",
    foreground: "#839496",
    cursor: "#93A1A1",
    selectionBackground: "#073642",
    red: "#DC322F",
    green: "#859900",
    yellow: "#B58900",
    blue: "#268BD2",
    magenta: "#D33682",
    cyan: "#2AA198",
  },
  "hacker-verde": { background: "#0A0F0A", foreground: "#33FF66", cursor: "#33FF66", selectionBackground: "#1E4D2B", green: "#33FF66" },
  "hacker-azul": { background: "#050B18", foreground: "#4FC3F7", cursor: "#4FC3F7", selectionBackground: "#123456", blue: "#4FC3F7" },
  claro: {
    background: "#FAFAFA",
    foreground: "#1C1C1E",
    cursor: "#1C1C1E",
    selectionBackground: "#D1D1D6",
    black: "#1C1C1E",
    red: "#C62828",
    green: "#2E7D32",
    yellow: "#8D6E00",
    blue: "#1565C0",
    magenta: "#8E24AA",
    cyan: "#00838F",
    white: "#8E8E93",
  },
};

export function opcionesTerminal(p: Preferencias) {
  return {
    fontFamily: FUENTES_TERMINAL[p.terminal.fuente].css,
    fontSize: p.terminal.tamano,
    theme: TEMAS_XTERM[p.terminal.tema],
  };
}

// ---------------------------------------------------------------- botones flotantes (+ y la IA)

export type ModoFlotantes = "auto" | "siempre" | "ocultos";
interface EstadoFlotantes {
  modo: ModoFlotantes;
  dx: number;
  dy: number;
  escribiendo: boolean;
  cambiar(p: Partial<Pick<EstadoFlotantes, "modo" | "dx" | "dy">>): void;
}
const CLAVE_FLOTANTES = "mi-setup.flotantes";

function leerFlotantes(): Pick<EstadoFlotantes, "modo" | "dx" | "dy"> {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_FLOTANTES) ?? "{}") as Partial<EstadoFlotantes>;
    return { modo: v.modo === "siempre" || v.modo === "ocultos" ? v.modo : "auto", dx: Number(v.dx) || 0, dy: Number(v.dy) || 0 };
  } catch {
    return { modo: "auto", dx: 0, dy: 0 };
  }
}

/** Dónde están los botones flotantes y si se ven (se guarda en este dispositivo). */
export const useFlotantes = create<EstadoFlotantes>()((set, get) => ({
  ...leerFlotantes(),
  escribiendo: false,
  cambiar: (p) => {
    set(p);
    const { modo, dx, dy } = get();
    try {
      localStorage.setItem(CLAVE_FLOTANTES, JSON.stringify({ modo, dx, dy }));
    } catch {
      /* sin almacenamiento */
    }
  },
}));

if (typeof window !== "undefined") {
  // Mientras escribes (teclado abierto) los botones se esconden para no tapar.
  const editable = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "range", "file", "submit"].includes((el as HTMLInputElement).type)));
  window.addEventListener("focusin", (e) => useFlotantes.setState({ escribiendo: editable(e.target) }));
  window.addEventListener("focusout", () => setTimeout(() => useFlotantes.setState({ escribiendo: editable(document.activeElement) }), 50));
}

/**
 * Para cada botón flotante: si se ve, su desplazamiento y cómo arrastrarlo
 * (mantén presionado medio segundo y muévelo; se queda donde lo sueltes).
 */
export function useBotonFlotante() {
  const { modo, dx, dy, escribiendo, cambiar } = useFlotantes();
  const [moviendo, setMoviendo] = useState(false);
  const datos = useRef<{ x: number; y: number; dx: number; dy: number; timer: ReturnType<typeof setTimeout> | null; activo: boolean; movido: boolean }>({ x: 0, y: 0, dx: 0, dy: 0, timer: null, activo: false, movido: false });
  const oculto = modo === "ocultos" || (modo === "auto" && escribiendo);
  const limitar = (v: number, max: number) => Math.max(-max, Math.min(max, v));
  return {
    oculto,
    moviendo,
    estilo: { transform: `translate(${dx}px, ${dy}px)`, touchAction: moviendo ? "none" : undefined } as const,
    eventos: {
      onPointerDown: (e: EventoPuntero<HTMLElement>) => {
        const d = datos.current;
        Object.assign(d, { x: e.clientX, y: e.clientY, dx, dy, activo: false, movido: false });
        d.timer = setTimeout(() => {
          d.activo = true;
          setMoviendo(true);
        }, 450);
      },
      onPointerMove: (e: EventoPuntero<HTMLElement>) => {
        const d = datos.current;
        if (!d.activo) {
          // Si se mueve antes de tiempo es un desplazamiento normal de la página.
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 && d.timer) clearTimeout(d.timer);
          return;
        }
        d.movido = true;
        cambiar({ dx: limitar(d.dx + e.clientX - d.x, window.innerWidth - 80), dy: limitar(d.dy + e.clientY - d.y, window.innerHeight - 120) });
      },
      onPointerUp: () => {
        const d = datos.current;
        if (d.timer) clearTimeout(d.timer);
        d.activo = false;
        setMoviendo(false);
      },
      /** Después de arrastrar no cuenta como toque. */
      onClickCapture: (e: EventoPuntero<HTMLElement> | React.MouseEvent<HTMLElement>) => {
        if (datos.current.movido) {
          e.preventDefault();
          e.stopPropagation();
          datos.current.movido = false;
        }
      },
    },
  };
}
