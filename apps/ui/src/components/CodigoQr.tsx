import { forwardRef, useImperativeHandle, useMemo } from "react";
import { guardarBlob } from "../lib/guardar";
import { ESTILO_BASICO, altoSvg, svgAPng, svgQr, type EstiloQr } from "../lib/qrDiseno";

export { ESTILO_BASICO, type EstiloQr };

export interface CodigoQrRef {
  descargar: (nombre: string, formato?: "png" | "svg") => Promise<void>;
  comoBlob: () => Promise<Blob | null>;
}

export const CodigoQr = forwardRef<CodigoQrRef, { datos: string; tamano?: number; estilo?: EstiloQr; className?: string }>(function CodigoQr(
  { datos, tamano = 220, estilo = ESTILO_BASICO, className },
  ref,
) {
  const svg = useMemo(() => svgQr(datos, tamano, estilo), [datos, tamano, estilo]);
  useImperativeHandle(ref, () => ({
    descargar: async (nombre, formato = "png") => {
      const grande = svgQr(datos, 1024, estilo);
      const b = formato === "svg" ? new Blob([grande], { type: "image/svg+xml" }) : await svgAPng(grande, 1024);
      await guardarBlob(b, `${nombre}.${formato}`);
    },
    comoBlob: () => svgAPng(svgQr(datos, Math.max(480, tamano * 2), estilo), Math.max(480, tamano * 2)).catch(() => null),
  }));
  return <div className={className} style={{ width: tamano, height: altoSvg(tamano, estilo) }} dangerouslySetInnerHTML={{ __html: svg }} />;
});
