/**
 * Portapapeles que funciona en todos lados: en la app de Android usa el
 * portapapeles nativo (el navegador interno no deja leerlo) y en PC y web el
 * del navegador.
 */
import { Capacitor } from "@capacitor/core";

export async function escribirPortapapeles(texto: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: texto });
    return;
  }
  await navigator.clipboard.writeText(texto);
}

/** Texto del portapapeles ("" si no hay o no se dio permiso). */
export async function leerPortapapeles(): Promise<string> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Clipboard } = await import("@capacitor/clipboard");
      const r = await Clipboard.read();
      return r.type.startsWith("text") ? r.value : "";
    }
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}
