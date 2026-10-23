export type TipoEquipo = "pc" | "tablet" | "celular";

export interface AgenteClasificado {
  tipo: TipoEquipo;
  sistema: string;
  cliente: "app" | "navegador";
}

export const MAX_HISTORIAL_SESIONES = 9;

export const NOMBRE_TIPO_EQUIPO: Record<TipoEquipo | "web", string> = {
  pc: "Computadora",
  tablet: "Tablet",
  celular: "Celular",
  web: "Navegador",
};

function sistemaDe(ua: string): string {
  const android = /Android\s+([\d.]+)/i.exec(ua);
  if (android) return `Android ${android[1]!.split(".")[0]}`;
  if (/iPad/i.test(ua)) return "iPadOS";
  const ios = /(?:iPhone|iPod).*?OS\s+(\d+)/i.exec(ua);
  if (ios) return `iOS ${ios[1]}`;
  if (/iPhone|iPod/i.test(ua)) return "iOS";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Otro";
}

export function clasificarAgente(ua: string | null | undefined, tactil = false): AgenteClasificado {
  const texto = ua ?? "";
  const sistema = sistemaDe(texto);
  const app = /Electron|MiSetup/i.test(texto) || /;\s*wv\)/.test(texto);
  let tipo: TipoEquipo = "pc";
  if (/iPad/i.test(texto) || (/Android/i.test(texto) && !/Mobile/i.test(texto)) || (/Macintosh/i.test(texto) && tactil)) tipo = "tablet";
  else if (/iPhone|iPod|Mobi|Android/i.test(texto)) tipo = "celular";
  return { tipo, sistema: tipo === "tablet" && sistema === "macOS" ? "iPadOS" : sistema, cliente: app ? "app" : "navegador" };
}
