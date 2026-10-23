export type TipoTecla = "mod" | "nav" | "sim" | "fn" | "combo";

export interface Tecla {
  id: string;
  etiqueta: string;
  tipo: TipoTecla;
  icono?: "izquierda" | "arriba" | "abajo" | "derecha";
}

export interface Modificadores {
  ctrl: boolean;
  alt: boolean;
}

const SIMBOLOS = "|\\/-~:;!@$*^%=`<>(){}[]\"'#&_+?.,".split("");

const NAV: Record<string, string> = {
  esc: "\x1b",
  tab: "\t",
  "shift+tab": "\x1b[Z",
  enter: "\r",
  borrar: "\x7f",
  ins: "\x1b[2~",
  del: "\x1b[3~",
  home: "\x1b[H",
  end: "\x1b[F",
  pgUp: "\x1b[5~",
  pgDn: "\x1b[6~",
  izquierda: "\x1b[D",
  arriba: "\x1b[A",
  abajo: "\x1b[B",
  derecha: "\x1b[C",
};

const FUNCIONES = ["\x1bOP", "\x1bOQ", "\x1bOR", "\x1bOS", "\x1b[15~", "\x1b[17~", "\x1b[18~", "\x1b[19~", "\x1b[20~", "\x1b[21~", "\x1b[23~", "\x1b[24~"];

const COMBOS: Record<string, string> = {
  "ctrl+C": "\x03",
  "ctrl+D": "\x04",
  "ctrl+Z": "\x1a",
  "ctrl+L": "\x0c",
  "ctrl+R": "\x12",
  "ctrl+A": "\x01",
  "ctrl+E": "\x05",
  "ctrl+U": "\x15",
  "ctrl+W": "\x17",
  "ctrl+B %": "\x02%",
  'ctrl+B "': '\x02"',
  "ctrl+B O": "\x02o",
  "ctrl+B X": "\x02x",
  "ctrl+B C": "\x02c",
  "ctrl+B N": "\x02n",
  "ctrl+B D": "\x02d",
};

const FLECHAS: Record<string, Tecla["icono"]> = { izquierda: "izquierda", arriba: "arriba", abajo: "abajo", derecha: "derecha" };

export const TECLAS: Record<string, Tecla> = Object.fromEntries(
  [
    ...["ctrl", "alt"].map((id) => ({ id, etiqueta: id, tipo: "mod" as const })),
    ...Object.keys(NAV).map((id) => ({ id, etiqueta: id, tipo: "nav" as const, ...(FLECHAS[id] ? { icono: FLECHAS[id] } : {}) })),
    ...SIMBOLOS.map((s) => ({ id: s, etiqueta: s, tipo: "sim" as const })),
    ...FUNCIONES.map((_, i) => ({ id: `F${i + 1}`, etiqueta: `F${i + 1}`, tipo: "fn" as const })),
    ...Object.keys(COMBOS).map((id) => ({ id, etiqueta: id, tipo: "combo" as const })),
  ].map((t) => [t.id, t]),
);

export const FILA_1 = ["shift+tab", "ctrl", "esc", "izquierda", "arriba", "abajo", "derecha", "alt", "tab", "ins", "del", "home", "end", "pgUp", "pgDn", "ctrl+C", "ctrl+D", "ctrl+Z", "ctrl+L", "ctrl+R"];
export const FILA_2 = [...SIMBOLOS.slice(0, 24), ...FUNCIONES.map((_, i) => `F${i + 1}`)];

export const GRUPOS_PANEL: { titulo: string; teclas: string[] }[] = [
  { titulo: "Teclas especiales", teclas: ["shift+tab", "ctrl", "esc", "alt", "tab", "ins", "del", "enter"] },
  { titulo: "Moverse", teclas: ["home", "pgUp", "pgDn", "end"] },
  { titulo: "Atajos", teclas: ["ctrl+C", "ctrl+D", "ctrl+Z", "ctrl+L", "ctrl+R", "ctrl+A", "ctrl+E", "ctrl+U", "ctrl+W"] },
  { titulo: "Ventanas (tmux)", teclas: ["ctrl+B %", 'ctrl+B "', "ctrl+B O", "ctrl+B X", "ctrl+B C", "ctrl+B N", "ctrl+B D"] },
  { titulo: "Símbolos", teclas: SIMBOLOS },
  { titulo: "Funciones", teclas: FUNCIONES.map((_, i) => `F${i + 1}`) },
];

export function filasValidas(fila: string[] | null | undefined, porDefecto: string[]): string[] {
  const limpia = (fila ?? []).filter((id) => TECLAS[id]);
  return limpia.length ? limpia : porDefecto;
}

function conCtrl(texto: string): string {
  if (texto.length !== 1) return texto;
  const c = texto.toUpperCase().charCodeAt(0);
  if (c >= 64 && c <= 95) return String.fromCharCode(c - 64);
  if (texto === " ") return "\x00";
  if (texto === "?") return "\x7f";
  return texto;
}

const MOD_FLECHA: Record<string, string> = { izquierda: "D", arriba: "A", abajo: "B", derecha: "C" };

export function secuenciaDe(id: string, mods: Modificadores = { ctrl: false, alt: false }): string {
  const flecha = MOD_FLECHA[id];
  if (flecha && (mods.ctrl || mods.alt)) return `\x1b[1;${1 + (mods.alt ? 2 : 0) + (mods.ctrl ? 4 : 0)}${flecha}`;
  const base = NAV[id] ?? COMBOS[id] ?? (id.startsWith("F") && /^F\d+$/.test(id) ? FUNCIONES[Number(id.slice(1)) - 1] : undefined) ?? (TECLAS[id]?.tipo === "sim" ? id : "");
  return aplicarModificadores(base, mods, TECLAS[id]?.tipo === "sim");
}

export function aplicarModificadores(texto: string, mods: Modificadores, esCaracter = true): string {
  if (!texto) return "";
  let salida = esCaracter && mods.ctrl ? conCtrl(texto) : texto;
  if (mods.alt) salida = `\x1b${salida}`;
  return salida;
}
