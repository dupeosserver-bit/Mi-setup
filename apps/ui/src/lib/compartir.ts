/**
 * Compartir con otras apps (WhatsApp, Claude, Gemini, correo…) y guardar
 * archivos en el dispositivo. En el celular usa la hoja de compartir del
 * sistema (con las fotos como archivos); en la PC, la de Windows si existe.
 */
import { guardarBlob } from "./guardar";
import { esMovil } from "./plataforma";

export interface ArchivoParaCompartir {
  url: string;
  nombre: string;
}

async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binario = "";
  for (let i = 0; i < buf.length; i += 0x8000) binario += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binario);
}

const limpio = (n: string) => n.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "archivo";

/** Comparte texto y archivos. Devuelve "copiado" si solo se pudo copiar el texto. */
export async function compartirConApps(datos: { titulo: string; texto: string; archivos?: ArchivoParaCompartir[] }): Promise<"compartido" | "copiado"> {
  const archivos = datos.archivos ?? [];
  if (esMovil()) {
    const [{ Share }, { Filesystem, Directory }] = await Promise.all([import("@capacitor/share"), import("@capacitor/filesystem")]);
    const uris: string[] = [];
    for (const a of archivos.slice(0, 10)) {
      const r = await fetch(a.url).catch(() => null);
      if (!r?.ok) continue;
      const guardado = await Filesystem.writeFile({ path: `compartir/${Date.now()}-${limpio(a.nombre)}`, data: await aBase64(await r.blob()), directory: Directory.Cache, recursive: true });
      uris.push(guardado.uri);
    }
    await Share.share({ title: datos.titulo, text: datos.texto, ...(uris.length ? { files: uris } : {}), dialogTitle: "Compartir" });
    return "compartido";
  }
  const files: File[] = [];
  for (const a of archivos.slice(0, 10)) {
    const r = await fetch(a.url).catch(() => null);
    if (r?.ok) files.push(new File([await r.blob()], limpio(a.nombre), { type: r.headers.get("content-type") ?? "application/octet-stream" }));
  }
  const conArchivos = { title: datos.titulo, text: datos.texto, files };
  if (navigator.share && (!files.length || navigator.canShare?.(conArchivos))) {
    try {
      await navigator.share(files.length ? conArchivos : { title: datos.titulo, text: datos.texto });
      return "compartido";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "compartido";
    }
  }
  await navigator.clipboard.writeText(datos.texto);
  return "copiado";
}

/** Guarda un archivo en este dispositivo (celular: carpeta Documentos/MiSetup). */
export async function guardarEnDispositivo(url: string, nombre: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo bajar el archivo");
  return guardarBlob(await r.blob(), nombre, { aviso: false });
}
