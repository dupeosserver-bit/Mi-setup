import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ESTILO_BASICO, ESTILOS_LISTOS, FORMAS_ESQUINA, FORMAS_MODULO, MARCOS, contraste, enEsquina, matrizQr, svgQr, type EstiloQr, type FormaEsquina, type FormaModulo, type MarcoQr } from "../src/lib/qrDiseno";

const TEXTO = "https://wa.me/528112345678?text=Quiero%20un%20pastel";

async function leer(svg: string) {
  const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" })?.data;
}

describe("QR nuevo", () => {
  it("la forma no cambia la matriz ni el tamaño", () => {
    const base = QRCode.create(TEXTO, { errorCorrectionLevel: "Q" });
    const m = matrizQr(TEXTO, false);
    expect(m.n).toBe(base.modules.size);
    for (let f = 0; f < m.n; f++) for (let c = 0; c < m.n; c++) expect(m.oscuro(f, c)).toBe(Boolean(base.modules.get(f, c)));
    const tamanos = (Object.keys(FORMAS_MODULO) as FormaModulo[]).map((modulos) => /viewBox="([^"]+)"/.exec(svgQr(TEXTO, 400, { ...ESTILO_BASICO, modulos }))?.[1]);
    expect(new Set(tamanos).size).toBe(1);
    expect(enEsquina(0, 0, m.n)).toBe(true);
    expect(enEsquina(m.n - 1, m.n - 1, m.n)).toBe(false);
  });

  it("cada forma y cada esquina se lee con un lector de QR", async () => {
    for (const modulos of Object.keys(FORMAS_MODULO) as FormaModulo[]) {
      for (const esquinas of Object.keys(FORMAS_ESQUINA) as FormaEsquina[]) {
        const e: EstiloQr = { ...ESTILO_BASICO, modulos, esquinas, color: "#1d3557", color2: "#457b9d" };
        expect(await leer(svgQr(TEXTO, 600, e)), `${modulos} + ${esquinas}`).toBe(TEXTO);
      }
    }
  }, 60_000);

  it("los estilos listos y los marcos se leen", async () => {
    for (const { nombre, estilo } of ESTILOS_LISTOS) {
      for (const marco of Object.keys(MARCOS) as MarcoQr[]) {
        const e: EstiloQr = { ...ESTILO_BASICO, ...estilo, marco };
        expect(await leer(svgQr(TEXTO, 640, e)), `${nombre} + ${marco}`).toBe(TEXTO);
      }
    }
  }, 60_000);

  it("con logo en el centro se sigue leyendo", async () => {
    const logo = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#e63946"/></svg>').toString("base64")}`;
    expect(await leer(svgQr(TEXTO, 600, { ...ESTILO_BASICO, logo, modulos: "suaves", esquinas: "redondeadas" }))).toBe(TEXTO);
  }, 30_000);

  it("mide el contraste", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contraste("#ffffff", "#ffffff")).toBe(1);
  });
});
