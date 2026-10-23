import allura from "../assets/firmas/allura.woff2?url";
import dancingScript from "../assets/firmas/dancing-script.woff2?url";
import greatVibes from "../assets/firmas/great-vibes.woff2?url";

export type LetraFirma = "elegante" | "clasica" | "moderna";

export const LETRAS_FIRMA: Record<LetraFirma, { nombre: string; familia: string; url: string; tamano: number }> = {
  elegante: { nombre: "Elegante", familia: "MiSetupFirmaElegante", url: greatVibes, tamano: 120 },
  clasica: { nombre: "Clásica", familia: "MiSetupFirmaClasica", url: allura, tamano: 128 },
  moderna: { nombre: "Moderna", familia: "MiSetupFirmaModerna", url: dancingScript, tamano: 104 },
};

export const TINTAS = [
  { nombre: "Azul oscuro", color: "#0b1f5c" },
  { nombre: "Negro", color: "#111111" },
  { nombre: "Azul", color: "#1d4ed8" },
] as const;

const cargadas = new Map<LetraFirma, Promise<void>>();

export function cargarLetra(letra: LetraFirma): Promise<void> {
  const previa = cargadas.get(letra);
  if (previa) return previa;
  const { familia, url } = LETRAS_FIRMA[letra];
  const promesa =
    typeof FontFace === "undefined" || !document.fonts
      ? Promise.resolve()
      : new FontFace(familia, `url(${url}) format("woff2")`).load().then((f) => void document.fonts.add(f));
  cargadas.set(letra, promesa);
  return promesa;
}

export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? "").trim().split(/\s+/)[0] ?? "";
}

export const CLAVE_FIRMA_GUARDADA = "mi-setup.firma-dibujada";

export function leerFirmaGuardada(): string | null {
  try {
    const v = localStorage.getItem(CLAVE_FIRMA_GUARDADA);
    return v?.startsWith("data:image/png") ? v : null;
  } catch {
    return null;
  }
}

export function guardarFirma(png: string | null): void {
  try {
    if (png) localStorage.setItem(CLAVE_FIRMA_GUARDADA, png);
    else localStorage.removeItem(CLAVE_FIRMA_GUARDADA);
  } catch {
    return;
  }
}
