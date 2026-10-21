/**
 * Formas propias para los puntos del QR (rombos, estrellas, corazones…).
 * Se dibuja el QR en SVG con la matriz de `qrcode`. Las partes fijas del QR
 * (los tres cuadros de las esquinas, las líneas de tiempo y los cuadros de
 * alineación) se dejan como cuadros normales: así la cámara lo encuentra y lo
 * lee aunque los puntos de datos tengan otra forma (probado con un lector).
 */
import QRCode from "qrcode";

export type FormaPropia = "rombo" | "estrella" | "corazon" | "hexagono" | "cruz" | "gota";
export const FORMAS_PROPIAS: Record<FormaPropia, string> = {
  rombo: "Rombos",
  estrella: "Estrellas",
  corazon: "Corazones",
  hexagono: "Hexágonos",
  cruz: "Cruces",
  gota: "Gotas",
};
export const esFormaPropia = (f: string): f is FormaPropia => f in FORMAS_PROPIAS;

/** Figura de un módulo en (x, y) de tamaño t, como `d` de un <path>. */
export function figura(forma: FormaPropia, x: number, y: number, t: number): string {
  const m = t * 0.05;
  const s = t - 2 * m;
  const cx = x + t / 2;
  const cy = y + t / 2;
  const r = s / 2;
  const n = (v: number) => Math.round(v * 100) / 100;
  switch (forma) {
    case "rombo":
      return `M${n(cx)} ${n(cy - r)}L${n(cx + r)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r)} ${n(cy)}Z`;
    case "estrella": {
      const puntos: string[] = [];
      for (let i = 0; i < 10; i++) {
        const radio = i % 2 === 0 ? r * 1.05 : r * 0.5;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        puntos.push(`${n(cx + radio * Math.cos(a))} ${n(cy + radio * Math.sin(a))}`);
      }
      return `M${puntos.join("L")}Z`;
    }
    case "corazon":
      return `M${n(cx)} ${n(cy + r * 0.9)}C${n(cx - r * 1.3)} ${n(cy - r * 0.1)} ${n(cx - r * 0.55)} ${n(cy - r * 1.05)} ${n(cx)} ${n(cy - r * 0.35)}C${n(cx + r * 0.55)} ${n(cy - r * 1.05)} ${n(cx + r * 1.3)} ${n(cy - r * 0.1)} ${n(cx)} ${n(cy + r * 0.9)}Z`;
    case "hexagono": {
      const p: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        p.push(`${n(cx + r * Math.cos(a))} ${n(cy + r * Math.sin(a))}`);
      }
      return `M${p.join("L")}Z`;
    }
    case "cruz": {
      const g = s / 3;
      return `M${n(x + m + g)} ${n(y + m)}h${n(g)}v${n(g)}h${n(g)}v${n(g)}h${n(-g)}v${n(g)}h${n(-g)}v${n(-g)}h${n(-g)}v${n(-g)}h${n(g)}Z`;
    }
    case "gota":
      return `M${n(x + m)} ${n(cy)}A${n(r)} ${n(r)} 0 0 1 ${n(cx)} ${n(y + m)}H${n(x + t - m)}V${n(cy)}A${n(r)} ${n(r)} 0 0 1 ${n(cx)} ${n(y + t - m)}A${n(r)} ${n(r)} 0 0 1 ${n(x + m)} ${n(cy)}Z`;
  }
}

/** ¿El módulo (fila, col) es parte de uno de los tres cuadros de las esquinas? */
export function enEsquina(f: number, c: number, n: number): boolean {
  const dentro = (f0: number, c0: number) => f >= f0 && f < f0 + 7 && c >= c0 && c < c0 + 7;
  return dentro(0, 0) || dentro(0, n - 7) || dentro(n - 7, 0);
}

export interface OpcionesSvg {
  forma: FormaPropia;
  color: string;
  color2: string | null;
  fondo: string;
  esquinas: "square" | "dot" | "extra-rounded";
  logo: string | null;
}

const escapar = (t: string) => t.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export function svgQr(datos: string, tamano: number, o: OpcionesSvg): string {
  // Con figuras se pierde algo de «tinta»: se usa la corrección de errores más alta.
  const qr = QRCode.create(datos || " ", { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const margen = 4;
  const t = tamano / (n + margen * 2);
  const o0 = margen * t;
  const relleno = o.color2 ? "url(#degradado)" : o.color;
  const logoLado = o.logo ? Math.floor(n * 0.22) | 1 : 0;
  const logoDesde = Math.floor((n - logoLado) / 2);
  const tapaLogo = (f: number, c: number) => o.logo !== null && f >= logoDesde - 1 && f < logoDesde + logoLado + 1 && c >= logoDesde - 1 && c < logoDesde + logoLado + 1;
  const fijos = (qr.modules as unknown as { reservedBit?: Uint8Array }).reservedBit;
  const caminos: string[] = [];
  const cuadros: string[] = [];
  const r = (v: number) => Math.round(v * 100) / 100;
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(f, c) || enEsquina(f, c, n) || tapaLogo(f, c)) continue;
      // +0.3 px para que los cuadros fijos vecinos no dejen rayitas blancas entre ellos.
      if (fijos?.[f * n + c]) cuadros.push(`M${r(o0 + c * t)} ${r(o0 + f * t)}h${r(t + 0.3)}v${r(t + 0.3)}h${r(-t - 0.3)}Z`);
      else caminos.push(figura(o.forma, o0 + c * t, o0 + f * t, t));
    }
  }
  // Los tres cuadros de las esquinas.
  const esquina = (f0: number, c0: number) => {
    const x = o0 + c0 * t;
    const y = o0 + f0 * t;
    const radio = o.esquinas === "dot" ? 3.5 * t : o.esquinas === "extra-rounded" ? 1.6 * t : 0;
    const radioHueco = Math.max(0, radio - t);
    const radioCentro = o.esquinas === "dot" ? 1.5 * t : o.esquinas === "extra-rounded" ? 0.8 * t : 0;
    /** Rectángulo redondeado como camino (para hacer el aro con evenodd). */
    const rr = (px: number, py: number, lado: number, rad: number) =>
      `M${px + rad} ${py}h${lado - 2 * rad}a${rad} ${rad} 0 0 1 ${rad} ${rad}v${lado - 2 * rad}a${rad} ${rad} 0 0 1 ${-rad} ${rad}h${-(lado - 2 * rad)}a${rad} ${rad} 0 0 1 ${-rad} ${-rad}v${-(lado - 2 * rad)}a${rad} ${rad} 0 0 1 ${rad} ${-rad}Z`;
    return `<path fill-rule="evenodd" fill="${o.color}" d="${rr(x, y, 7 * t, radio)} ${rr(x + t, y + t, 5 * t, radioHueco)}"/><rect x="${x + 2 * t}" y="${y + 2 * t}" width="${3 * t}" height="${3 * t}" rx="${radioCentro}" fill="${o.color}"/>`;
  };
  const logo = o.logo
    ? `<image href="${escapar(o.logo)}" x="${o0 + logoDesde * t}" y="${o0 + logoDesde * t}" width="${logoLado * t}" height="${logoLado * t}" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  const degradado = o.color2 ? `<defs><linearGradient id="degradado" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.color}"/><stop offset="1" stop-color="${o.color2}"/></linearGradient></defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamano}" height="${tamano}" viewBox="0 0 ${tamano} ${tamano}">${degradado}<rect width="100%" height="100%" fill="${o.fondo}"/><path fill="${relleno}" d="${caminos.join("")}"/><path fill="${o.color}" d="${cuadros.join("")}"/>${esquina(0, 0)}${esquina(0, n - 7)}${esquina(n - 7, 0)}${logo}</svg>`;
}

/** Dibuja el SVG en un canvas (para PNG y para revisar que se lea). */
export async function svgAPng(svg: string, tamano: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = tamano;
    c.height = tamano;
    c.getContext("2d")!.drawImage(img, 0, 0, tamano, tamano);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo crear la imagen"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Revisa con un lector de QR que la imagen se pueda leer y diga lo mismo. */
export async function seLee(png: Blob, esperado: string): Promise<boolean> {
  const { default: jsQR } = await import("jsqr");
  const bmp = await createImageBitmap(png);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const datos = ctx.getImageData(0, 0, c.width, c.height);
  return jsQR(datos.data, c.width, c.height, { inversionAttempts: "attemptBoth" })?.data === esperado;
}
