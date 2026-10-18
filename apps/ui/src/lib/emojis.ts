/**
 * Emojis secretos: cada byte del mensaje se convierte en un "selector de
 * variante" de Unicode (caracteres invisibles) pegado al emoji. Se ve igual en
 * WhatsApp, pero por dentro lleva el texto.
 *   bytes 0–15   → U+FE00 – U+FE0F
 *   bytes 16–255 → U+E0100 – U+E01EF
 */

function byteASelector(b: number): string {
  return String.fromCodePoint(b < 16 ? 0xfe00 + b : 0xe0100 + (b - 16));
}

function selectorAByte(cp: number): number | null {
  if (cp >= 0xfe00 && cp <= 0xfe0f) return cp - 0xfe00;
  if (cp >= 0xe0100 && cp <= 0xe01ef) return cp - 0xe0100 + 16;
  return null;
}

export function esconderEnEmoji(emoji: string, mensaje: string): string {
  const bytes = new TextEncoder().encode(mensaje);
  return emoji + Array.from(bytes, byteASelector).join("");
}

/** El mensaje escondido, o null si el texto no trae uno. */
export function revelarDeEmoji(texto: string): string | null {
  const bytes: number[] = [];
  for (const ch of texto) {
    const b = selectorAByte(ch.codePointAt(0) ?? 0);
    if (b !== null) bytes.push(b);
  }
  // Un emoji normal puede traer un solo FE0F (estilo emoji): eso no es un mensaje.
  if (bytes.length < 2) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}
