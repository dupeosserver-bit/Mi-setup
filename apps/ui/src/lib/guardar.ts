/**
 * Guardar archivos en el dispositivo. El WebView de Android ignora los
 * enlaces <a download>, así que en el celular el archivo se escribe en
 * Documentos/MiSetup (o, si Android no deja, se abre la hoja de compartir
 * para guardarlo en Archivos, Drive, etc.). En la PC y la web se descarga.
 */
import { esMovil } from "./plataforma";

const limpio = (n: string) => n.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "archivo";

async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binario = "";
  for (let i = 0; i < buf.length; i += 0x8000) binario += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binario);
}

// Import diferido: components/ui importa api.ts, que a su vez usa este archivo.
const avisar = (texto: string, tono: "ok" | "error" = "ok") => void import("../components/ui").then((m) => m.avisar(texto, tono));

/** Guarda el archivo y devuelve dónde quedó (texto para mostrar). */
export async function guardarBlob(blob: Blob, nombre: string, opciones: { aviso?: boolean } = {}): Promise<string> {
  const archivo = limpio(nombre);
  let donde: string;
  if (esMovil()) {
    const [{ Filesystem, Directory }, datos] = await Promise.all([import("@capacitor/filesystem"), aBase64(blob)]);
    try {
      await Filesystem.writeFile({ path: `MiSetup/${archivo}`, data: datos, directory: Directory.Documents, recursive: true });
      donde = `Documentos/MiSetup/${archivo}`;
    } catch {
      // Sin permiso para Documentos: se ofrece con la hoja de compartir (Guardar en Archivos, Drive…).
      const { Share } = await import("@capacitor/share");
      const temporal = await Filesystem.writeFile({ path: `guardar/${Date.now()}-${archivo}`, data: datos, directory: Directory.Cache, recursive: true });
      await Share.share({ title: archivo, files: [temporal.uri], dialogTitle: "Guardar o compartir" });
      donde = "donde elegiste";
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    donde = "Descargas";
  }
  if (opciones.aviso !== false) avisar(`Guardado en ${donde}`);
  return donde;
}

/** Guarda lo que hay en una URL (blob:, data: o del servidor). */
export async function guardarUrl(url: string, nombre: string, opciones: { aviso?: boolean } = {}): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo bajar el archivo");
  return guardarBlob(await r.blob(), nombre, opciones);
}

/** En el celular, los <a download> de la app pasan por guardarBlob en lugar de no hacer nada. */
export function interceptarDescargas(): void {
  if (!esMovil()) return;
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[download]") as HTMLAnchorElement | null;
      if (!a?.href) return;
      e.preventDefault();
      guardarUrl(a.href, a.getAttribute("download") || "archivo").catch((err: unknown) => avisar(err instanceof Error ? err.message : "No se pudo guardar", "error"));
    },
    true,
  );
}
