/** Generador de contraseñas (aleatoriedad criptográfica) y medidor de fortaleza. */

export interface OpcionesGenerador {
  longitud: number;
  mayusculas: boolean;
  minusculas: boolean;
  numeros: boolean;
  simbolos: boolean;
  sinAmbiguos: boolean;
  /** Símbolos que se pueden usar (algunos sitios solo aceptan ciertos). */
  simbolosTexto: string;
}

export const SIMBOLOS_POR_DEFECTO = "!@#$%^&*()-_=+[]{};:,.?/~";

export const OPCIONES_POR_DEFECTO: OpcionesGenerador = {
  longitud: 20,
  mayusculas: true,
  minusculas: true,
  numeros: true,
  simbolos: true,
  sinAmbiguos: true,
  simbolosTexto: SIMBOLOS_POR_DEFECTO,
};

const CONJUNTOS = {
  mayusculas: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  minusculas: "abcdefghijklmnopqrstuvwxyz",
  numeros: "0123456789",
  simbolos: "!@#$%^&*()-_=+[]{};:,.?/~",
} as const;
const AMBIGUOS = new Set("Il1O0o|`'\"");

/** Entero uniforme en [0, max) sin sesgo (muestreo con rechazo). */
function aleatorio(max: number): number {
  const limite = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] ?? 0;
    if (v < limite) return v % max;
  }
}

export function generarContrasena(o: OpcionesGenerador): string {
  const elegidos = (Object.keys(CONJUNTOS) as (keyof typeof CONJUNTOS)[])
    .filter((k) => o[k])
    .map((k) => {
      // Símbolos elegidos por el usuario (sin letras, números ni espacios; sin repetidos).
      const base = k === "simbolos" ? [...new Set(o.simbolosTexto.replace(/[\sA-Za-z0-9]/g, ""))].join("") || CONJUNTOS.simbolos : CONJUNTOS[k];
      return [...base].filter((c) => !o.sinAmbiguos || !AMBIGUOS.has(c)).join("");
    })
    .filter((c) => c.length > 0);
  if (elegidos.length === 0) throw new Error("Elige al menos un tipo de carácter");
  const longitud = Math.max(elegidos.length, Math.min(128, Math.floor(o.longitud)));
  const todos = elegidos.join("");
  // Al menos un carácter de cada tipo elegido.
  const chars = elegidos.map((c) => c[aleatorio(c.length)] ?? "");
  while (chars.length < longitud) chars.push(todos[aleatorio(todos.length)] ?? "");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [chars[i], chars[j]] = [chars[j] ?? "", chars[i] ?? ""];
  }
  return chars.join("");
}

const COMUNES = ["password", "contraseña", "contrasena", "123456", "qwerty", "admin", "minecraft", "mexicanland", "letmein", "iloveyou", "abc123", "111111"];

export interface Fortaleza {
  puntos: 0 | 1 | 2 | 3 | 4;
  etiqueta: string;
  bits: number;
}

export function fortaleza(clave: string): Fortaleza {
  if (!clave) return { puntos: 0, etiqueta: "Vacía", bits: 0 };
  let alfabeto = 0;
  if (/[a-z]/.test(clave)) alfabeto += 26;
  if (/[A-Z]/.test(clave)) alfabeto += 26;
  if (/\d/.test(clave)) alfabeto += 10;
  if (/[^a-zA-Z\d]/.test(clave)) alfabeto += 33;
  let bits = clave.length * Math.log2(Math.max(alfabeto, 1));
  const minus = clave.toLowerCase();
  if (COMUNES.some((c) => minus.includes(c))) bits = Math.min(bits, 20);
  if (/(.)\1{2,}/.test(clave)) bits -= 10;
  if (/(012|123|234|345|456|567|678|789|abc|bcd|cde|qwe|asd)/i.test(clave)) bits -= 10;
  bits = Math.max(0, Math.round(bits));
  const puntos = (bits < 28 ? 0 : bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4) as Fortaleza["puntos"];
  return { puntos, etiqueta: ["Muy débil", "Débil", "Aceptable", "Fuerte", "Muy fuerte"][puntos] ?? "", bits };
}
