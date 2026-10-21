import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FORMAS_PROPIAS, svgQr, type FormaPropia } from "../src/lib/qrFormas";

describe("QR con figuras: se siguen leyendo", () => {
  it("cada forma y cada tipo de esquina se lee con un lector de QR", async () => {
    const texto = "https://wa.me/528112345678?text=Quiero%20un%20pastel";
    for (const forma of Object.keys(FORMAS_PROPIAS) as FormaPropia[]) {
      for (const esquinas of ["square", "dot", "extra-rounded"] as const) {
        const svg = svgQr(texto, 600, { forma, color: "#1d3557", color2: "#e63946", fondo: "#ffffff", esquinas, logo: null });
        const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, `${forma} + ${esquinas}`).toBe(texto);
      }
    }
  }, 30_000);
});
