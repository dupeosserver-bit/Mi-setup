/**
 * Preferencias de la cuenta aplicadas a la interfaz: tema (variables CSS),
 * fuente, zoom (tamaño de letra base) y temas de la terminal. Se guardan en el
 * servidor (se sincronizan entre PC y celular) y se copian en este
 * dispositivo para aplicarlas al instante al abrir la app.
 */
import { FUENTES_APP, FUENTES_TERMINAL, PREFERENCIAS_INICIALES, preferenciasSchema, type Preferencias, type TemaTerminal } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ITheme } from "@xterm/xterm";
import { useEffect } from "react";
import { api } from "./api";
import { queryClient } from "./consultas";
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

/** Aplica tema, fuente y zoom al documento. */
export function aplicarPreferencias(p: Preferencias): void {
  const raiz = document.documentElement;
  quitarEscucha?.();
  quitarEscucha = null;
  if (p.tema === "sistema") {
    const consulta = window.matchMedia("(prefers-color-scheme: light)");
    const poner = () => {
      raiz.dataset["tema"] = consulta.matches ? "claro" : "oscuro";
    };
    poner();
    consulta.addEventListener("change", poner);
    quitarEscucha = () => consulta.removeEventListener("change", poner);
  } else {
    raiz.dataset["tema"] = p.tema;
  }
  raiz.style.setProperty("--fuente", FUENTES_APP[p.fuente].css);
  // El zoom escala el tamaño base: toda la interfaz usa rem, así que crece o se achica entera.
  raiz.style.fontSize = `${(16 * p.zoom) / 100}px`;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    /* sin almacenamiento: se aplica igual */
  }
}

/** Al arrancar: aplica lo último guardado en este dispositivo (sin esperar al servidor). */
export function aplicarPreferenciasGuardadas(): void {
  aplicarPreferencias(leerLocal());
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
