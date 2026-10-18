/**
 * Código QR dibujado en el navegador (no sale nada de tu equipo). Lo usan el
 * 2FA de Ajustes y el estudio de QR (con logo, colores y formas).
 */
import QRCodeStyling, { type Options } from "qr-code-styling";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface EstiloQr {
  color: string;
  fondo: string;
  /** Forma de los puntos. */
  puntos: "square" | "dots" | "rounded" | "extra-rounded" | "classy" | "classy-rounded";
  /** Forma de las esquinas grandes. */
  esquinas: "square" | "dot" | "extra-rounded";
  /** Logo en el centro (data URL). */
  logo: string | null;
  /** Degradado opcional de segundo color. */
  color2: string | null;
}

export const ESTILO_BASICO: EstiloQr = { color: "#000000", fondo: "#ffffff", puntos: "square", esquinas: "square", logo: null, color2: null };

export interface CodigoQrRef {
  descargar: (nombre: string, formato?: "png" | "svg") => Promise<void>;
  comoBlob: () => Promise<Blob | null>;
}

function opciones(datos: string, tamano: number, e: EstiloQr): Options {
  return {
    width: tamano,
    height: tamano,
    data: datos || " ",
    margin: 8,
    // Con logo se sube la corrección de errores para que el QR se siga leyendo.
    qrOptions: { errorCorrectionLevel: e.logo ? "H" : "M" },
    ...(e.logo ? { image: e.logo } : {}),
    imageOptions: { crossOrigin: "anonymous", margin: 6, imageSize: 0.35, hideBackgroundDots: true },
    dotsOptions: e.color2
      ? { type: e.puntos, gradient: { type: "linear", rotation: Math.PI / 4, colorStops: [{ offset: 0, color: e.color }, { offset: 1, color: e.color2 }] } }
      : { type: e.puntos, color: e.color },
    cornersSquareOptions: { type: e.esquinas, color: e.color },
    cornersDotOptions: { color: e.color },
    backgroundOptions: { color: e.fondo },
  };
}

export const CodigoQr = forwardRef<CodigoQrRef, { datos: string; tamano?: number; estilo?: EstiloQr; className?: string }>(function CodigoQr(
  { datos, tamano = 220, estilo = ESTILO_BASICO, className },
  ref,
) {
  const caja = useRef<HTMLDivElement>(null);
  const qr = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    if (!caja.current) return;
    if (!qr.current) {
      qr.current = new QRCodeStyling(opciones(datos, tamano, estilo));
      caja.current.innerHTML = "";
      qr.current.append(caja.current);
    } else {
      qr.current.update(opciones(datos, tamano, estilo));
    }
  }, [datos, tamano, estilo]);

  useImperativeHandle(ref, () => ({
    descargar: async (nombre, formato = "png") => {
      await qr.current?.download({ name: nombre, extension: formato });
    },
    comoBlob: async () => {
      const b = await qr.current?.getRawData("png");
      return b instanceof Blob ? b : null;
    },
  }));

  return <div ref={caja} className={className} style={{ width: tamano, height: tamano }} />;
});
