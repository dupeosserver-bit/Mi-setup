export const LADO_ICONO = 512;
export const TIPOS_ICONO = ["image/png", "image/jpeg"];
export const MAX_ICONO = 10 * 1024 * 1024;

export interface RevisionIcono {
  ok: boolean;
  aviso?: string;
}

export function revisarArchivoIcono(f: { type: string; size: number }): RevisionIcono {
  if (!TIPOS_ICONO.includes(f.type)) return { ok: false, aviso: "Usa una imagen JPG o PNG." };
  if (f.size > MAX_ICONO) return { ok: false, aviso: "La imagen pasa de 10 MB; usa una más ligera." };
  return { ok: true };
}

export function recorteCuadrado(ancho: number, alto: number): { x: number; y: number; lado: number } {
  const lado = Math.min(ancho, alto);
  return { x: Math.round((ancho - lado) / 2), y: Math.round((alto - lado) / 2), lado };
}

export function avisoTamano(ancho: number, alto: number): string | undefined {
  if (Math.min(ancho, alto) < LADO_ICONO) return `Tu imagen mide ${ancho}×${alto}; en el celular se puede ver borrosa. Mejor una de ${LADO_ICONO}×${LADO_ICONO} o más.`;
  if (Math.abs(ancho - alto) > Math.min(ancho, alto) * 0.05) return "No era cuadrada: la recortamos al centro.";
  return undefined;
}

export async function prepararIcono(origen: Blob): Promise<{ archivo: Blob; aviso?: string }> {
  const bitmap = await createImageBitmap(origen);
  const { x, y, lado } = recorteCuadrado(bitmap.width, bitmap.height);
  const lienzo = document.createElement("canvas");
  lienzo.width = LADO_ICONO;
  lienzo.height = LADO_ICONO;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo preparar la imagen");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, x, y, lado, lado, 0, 0, LADO_ICONO, LADO_ICONO);
  const aviso = avisoTamano(bitmap.width, bitmap.height);
  bitmap.close();
  const archivo = await new Promise<Blob>((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo preparar la imagen"))), "image/png"));
  return aviso ? { archivo, aviso } : { archivo };
}

export async function dataUrlABlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
