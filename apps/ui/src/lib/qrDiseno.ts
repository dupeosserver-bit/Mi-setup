import QRCode from "qrcode";

export type FormaModulo = "cuadrados" | "suaves" | "fluidos" | "verticales";
export type FormaEsquina = "cuadradas" | "redondeadas" | "hoja" | "gota";
export type MarcoQr = "ninguno" | "abajo" | "arriba";

export interface EstiloQr {
  color: string;
  color2: string | null;
  angulo: number;
  fondo: string;
  modulos: FormaModulo;
  esquinas: FormaEsquina;
  colorEsquinas: string | null;
  logo: string | null;
  marco: MarcoQr;
  textoMarco: string;
}

export const ESTILO_BASICO: EstiloQr = {
  color: "#000000",
  color2: null,
  angulo: 45,
  fondo: "#ffffff",
  modulos: "cuadrados",
  esquinas: "cuadradas",
  colorEsquinas: null,
  logo: null,
  marco: "ninguno",
  textoMarco: "Escanéame",
};

export const FORMAS_MODULO: Record<FormaModulo, string> = { cuadrados: "Cuadrados", suaves: "Suaves", fluidos: "Fluidos", verticales: "Verticales" };
export const FORMAS_ESQUINA: Record<FormaEsquina, string> = { cuadradas: "Cuadradas", redondeadas: "Redondeadas", hoja: "Hoja", gota: "Gota" };
export const MARCOS: Record<MarcoQr, string> = { ninguno: "Sin marco", abajo: "Texto abajo", arriba: "Texto arriba" };

export const ESTILOS_LISTOS: { nombre: string; estilo: Partial<EstiloQr> }[] = [
  { nombre: "Clásico", estilo: { color: "#111111", color2: null, fondo: "#ffffff", modulos: "cuadrados", esquinas: "cuadradas", colorEsquinas: null } },
  { nombre: "Pastel rosa", estilo: { color: "#a61e4d", color2: "#e64980", fondo: "#fff0f6", modulos: "suaves", esquinas: "redondeadas", colorEsquinas: "#a61e4d" } },
  { nombre: "Menta", estilo: { color: "#087f5b", color2: "#0ca678", fondo: "#f0fff8", modulos: "fluidos", esquinas: "hoja", colorEsquinas: null } },
  { nombre: "Noche", estilo: { color: "#b497ff", color2: "#7cb7ff", fondo: "#15121f", modulos: "suaves", esquinas: "gota", colorEsquinas: null } },
  { nombre: "Chocolate", estilo: { color: "#5c3d2e", color2: null, fondo: "#fff8f0", modulos: "verticales", esquinas: "redondeadas", colorEsquinas: "#8f5b3a" } },
  { nombre: "Redes", estilo: { color: "#e1306c", color2: "#833ab4", fondo: "#ffffff", modulos: "fluidos", esquinas: "gota", colorEsquinas: null } },
  { nombre: "Océano", estilo: { color: "#0b4f6c", color2: "#0b7285", fondo: "#f5fbff", modulos: "verticales", esquinas: "hoja", colorEsquinas: null } },
  { nombre: "Limón", estilo: { color: "#2b8a3e", color2: "#5c940d", fondo: "#fffde7", modulos: "suaves", esquinas: "cuadradas", colorEsquinas: "#1b5e20" } },
];

export interface MatrizQr {
  n: number;
  oscuro: (f: number, c: number) => boolean;
  fijo: (f: number, c: number) => boolean;
}

export function matrizQr(datos: string, conLogo: boolean): MatrizQr {
  const qr = QRCode.create(datos || " ", { errorCorrectionLevel: conLogo ? "H" : "Q" });
  const n = qr.modules.size;
  const reservado = (qr.modules as unknown as { reservedBit?: Uint8Array }).reservedBit;
  return {
    n,
    oscuro: (f, c) => f >= 0 && c >= 0 && f < n && c < n && Boolean(qr.modules.get(f, c)),
    fijo: (f, c) => Boolean(reservado?.[f * n + c]),
  };
}

export function enEsquina(f: number, c: number, n: number): boolean {
  const dentro = (f0: number, c0: number) => f >= f0 && f < f0 + 7 && c >= c0 && c < c0 + 7;
  return dentro(0, 0) || dentro(0, n - 7) || dentro(n - 7, 0);
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function rectRedondo(x: number, y: number, w: number, h: number, radios: [number, number, number, number]): string {
  const lim = Math.min(w, h) / 2;
  const [a, b, c, d] = radios.map((v) => Math.max(0, Math.min(v, lim))) as [number, number, number, number];
  return `M${r2(x + a)} ${r2(y)}H${r2(x + w - b)}${b ? `A${r2(b)} ${r2(b)} 0 0 1 ${r2(x + w)} ${r2(y + b)}` : ""}V${r2(y + h - c)}${c ? `A${r2(c)} ${r2(c)} 0 0 1 ${r2(x + w - c)} ${r2(y + h)}` : ""}H${r2(x + d)}${d ? `A${r2(d)} ${r2(d)} 0 0 1 ${r2(x)} ${r2(y + h - d)}` : ""}V${r2(y + a)}${a ? `A${r2(a)} ${r2(a)} 0 0 1 ${r2(x + a)} ${r2(y)}` : ""}Z`;
}

type Esquina = "si" | "sd" | "ii";

function radiosEsquina(forma: FormaEsquina, cual: Esquina, base: number): [number, number, number, number] {
  if (forma === "cuadradas") return [0, 0, 0, 0];
  if (forma === "redondeadas") return [base, base, base, base];
  if (forma === "hoja") return cual === "sd" ? [0, base, 0, base] : [base, 0, base, 0];
  if (cual === "si") return [base, base, 0, base];
  if (cual === "sd") return [base, base, base, 0];
  return [base, 0, base, base];
}

function esquinaSvg(forma: FormaEsquina, cual: Esquina, x: number, y: number, t: number, relleno: string): string {
  const exterior = forma === "redondeadas" ? 1.6 * t : 3.5 * t;
  const interior = forma === "redondeadas" ? 0.8 * t : 1.5 * t;
  const fuera = rectRedondo(x, y, 7 * t, 7 * t, radiosEsquina(forma, cual, exterior));
  const hueco = rectRedondo(x + t, y + t, 5 * t, 5 * t, radiosEsquina(forma, cual, Math.max(0, exterior - t)));
  const centro = rectRedondo(x + 2 * t, y + 2 * t, 3 * t, 3 * t, radiosEsquina(forma, cual, interior));
  return `<path fill-rule="evenodd" fill="${relleno}" d="${fuera}${hueco}"/><path fill="${relleno}" d="${centro}"/>`;
}

function modulosSvg(m: MatrizQr, forma: FormaModulo, o0: number, t: number, saltar: (f: number, c: number) => boolean): string {
  const { n } = m;
  const ve = (f: number, c: number) => m.oscuro(f, c) && !saltar(f, c);
  const partes: string[] = [];
  const x = (c: number) => o0 + c * t;
  const y = (f: number) => o0 + f * t;
  if (forma === "verticales" || forma === "fluidos") {
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (m.oscuro(f, c) && !saltar(f, c) && m.fijo(f, c)) partes.push(`M${r2(x(c))} ${r2(y(f))}h${r2(t + 0.3)}v${r2(t + 0.3)}h${r2(-t - 0.3)}Z`);
  }
  const libre = (f: number, c: number) => ve(f, c) && !((forma === "verticales" || forma === "fluidos") && m.fijo(f, c));
  if (forma === "verticales") {
    const ancho = t * 0.94;
    for (let c = 0; c < n; c++) {
      let f = 0;
      while (f < n) {
        if (!libre(f, c)) {
          f++;
          continue;
        }
        const inicio = f;
        while (f < n && libre(f, c)) f++;
        const alto = (f - inicio) * t - t * 0.04;
        partes.push(rectRedondo(x(c) + (t - ancho) / 2, y(inicio) + t * 0.02, ancho, alto, [ancho / 2, ancho / 2, ancho / 2, ancho / 2]));
      }
    }
    return partes.join("");
  }
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (!libre(f, c)) continue;
      if (forma === "cuadrados") {
        partes.push(`M${r2(x(c))} ${r2(y(f))}h${r2(t + 0.3)}v${r2(t + 0.3)}h${r2(-t - 0.3)}Z`);
      } else if (forma === "suaves") {
        const lado = t * 0.98;
        const d = (t - lado) / 2;
        partes.push(rectRedondo(x(c) + d, y(f) + d, lado, lado, [t * 0.28, t * 0.28, t * 0.28, t * 0.28]));
      } else {
        const der = libre(f, c + 1);
        const aba = libre(f + 1, c);
        const izq = libre(f, c - 1);
        const arr = libre(f - 1, c);
        const r = t / 2;
        partes.push(rectRedondo(x(c), y(f), t + (der ? 0.3 : 0), t + (aba ? 0.3 : 0), [arr || izq ? 0 : r, arr || der ? 0 : r, aba || der ? 0 : r, aba || izq ? 0 : r]));
      }
    }
  }
  return partes.join("");
}

const escapar = (t: string) => t.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);

function luminancia(hex: string): number {
  const v = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!v) return 0;
  const canal = (i: number) => {
    const x = parseInt(v.slice(i, i + 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

export function contrasteMinimo(e: EstiloQr): number {
  const colores = [e.color, e.color2, e.colorEsquinas].filter((c): c is string => Boolean(c));
  return Math.min(...colores.map((c) => contraste(c, e.fondo)));
}

export function altoSvg(tamano: number, e: EstiloQr): number {
  return e.marco === "ninguno" ? tamano : Math.round(tamano * 1.2);
}

export function svgQr(datos: string, tamano: number, e: EstiloQr): string {
  const m = matrizQr(datos, Boolean(e.logo));
  const { n } = m;
  const margen = e.marco === "ninguno" ? 4 : 3;
  const conMarco = e.marco !== "ninguno";
  const borde = conMarco ? tamano * 0.035 : 0;
  const banda = conMarco ? tamano * 0.2 : 0;
  const lado = tamano - 2 * borde;
  const t = lado / (n + margen * 2);
  const qx = borde;
  const qy = e.marco === "arriba" ? banda : borde;
  const o0x = qx + margen * t;
  const o0y = qy + margen * t;
  const logoLado = e.logo ? Math.floor(n * 0.22) | 1 : 0;
  const logoDesde = Math.floor((n - logoLado) / 2);
  const tapaLogo = (f: number, c: number) => e.logo !== null && f >= logoDesde - 1 && f < logoDesde + logoLado + 1 && c >= logoDesde - 1 && c < logoDesde + logoLado + 1;
  const relleno = e.color2 ? "url(#qr-tinta)" : e.color;
  const rellenoEsquina = e.colorEsquinas ?? e.color;
  const alto = altoSvg(tamano, e);
  const rad = (e.angulo * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  const degradado = e.color2
    ? `<linearGradient id="qr-tinta" x1="${r2(0.5 - dx)}" y1="${r2(0.5 - dy)}" x2="${r2(0.5 + dx)}" y2="${r2(0.5 + dy)}"><stop offset="0" stop-color="${e.color}"/><stop offset="1" stop-color="${e.color2}"/></linearGradient>`
    : "";
  const cuerpo = modulosSvg(m, e.modulos, 0, t, (f, c) => enEsquina(f, c, n) || tapaLogo(f, c));
  const esquinas = [esquinaSvg(e.esquinas, "si", 0, 0, t, rellenoEsquina), esquinaSvg(e.esquinas, "sd", (n - 7) * t, 0, t, rellenoEsquina), esquinaSvg(e.esquinas, "ii", 0, (n - 7) * t, t, rellenoEsquina)].join("");
  const logo = e.logo
    ? `<rect x="${r2((logoDesde - 0.5) * t)}" y="${r2((logoDesde - 0.5) * t)}" width="${r2((logoLado + 1) * t)}" height="${r2((logoLado + 1) * t)}" rx="${r2(t * 1.2)}" fill="${e.fondo}"/><image href="${escapar(e.logo)}" x="${r2(logoDesde * t)}" y="${r2(logoDesde * t)}" width="${r2(logoLado * t)}" height="${r2(logoLado * t)}" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  const fondoQr = conMarco ? `<rect x="${r2(qx)}" y="${r2(qy)}" width="${r2(lado)}" height="${r2(lado)}" rx="${r2(tamano * 0.04)}" fill="${e.fondo}"/>` : `<rect width="100%" height="100%" fill="${e.fondo}"/>`;
  const texto = escapar(e.textoMarco.trim().slice(0, 28) || "Escanéame");
  const marco = conMarco
    ? `<rect width="${tamano}" height="${alto}" rx="${r2(tamano * 0.07)}" fill="${e.colorEsquinas ?? e.color}"/><text x="${r2(tamano / 2)}" y="${r2(e.marco === "arriba" ? banda * 0.62 : alto - banda * 0.38)}" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="700" font-size="${r2(tamano * 0.075)}" fill="${e.fondo}">${texto}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamano}" height="${alto}" viewBox="0 0 ${tamano} ${alto}"><defs>${degradado}</defs>${marco}${fondoQr}<g transform="translate(${r2(o0x)} ${r2(o0y)})"><path fill="${relleno}" d="${cuerpo}"/>${esquinas}${logo}</g></svg>`;
}

export async function svgAPng(svg: string, tamano: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const proporcion = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
    const c = document.createElement("canvas");
    c.width = tamano;
    c.height = Math.round(tamano * proporcion);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo crear la imagen"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
