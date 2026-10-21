/**
 * Imagen (PNG) con la lista de cobros de una persona, para mandarla por
 * WhatsApp. Se dibuja en el dispositivo; no pasa por el servidor.
 */

export interface LineaCobro {
  pago: string;
  fecha: string;
  monto: number;
  estado: "pagado" | "pendiente" | "debe";
}

const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

function recortar(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string {
  if (ctx.measureText(texto).width <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > ancho) t = t.slice(0, -1);
  return `${t}…`;
}

export async function imagenDeCobro(datos: { nombre: string; de?: string; lineas: LineaCobro[]; debe: number; pendiente: number }): Promise<Blob> {
  const pendientes = datos.lineas.filter((l) => l.estado !== "pagado").slice(0, 18);
  const W = 1080;
  const alto = 360 + Math.max(1, pendientes.length) * 96 + 200;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = alto;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Tu dispositivo no pudo dibujar la imagen");
  const fuente = (peso: number, tam: number) => `${peso} ${tam}px Inter, "Segoe UI", Roboto, Arial, sans-serif`;

  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, W, alto);
  ctx.fillStyle = "#1e1e1e";
  ctx.beginPath();
  ctx.roundRect(48, 48, W - 96, alto - 96, 40);
  ctx.fill();

  ctx.fillStyle = "#a1a1aa";
  ctx.font = fuente(500, 34);
  ctx.fillText(datos.de ? `Cuentas de ${datos.de}` : "Cuentas compartidas", 96, 130);
  ctx.fillStyle = "#ffffff";
  ctx.font = fuente(700, 64);
  ctx.fillText(recortar(ctx, `Hola, ${datos.nombre}`, W - 192), 96, 210);
  ctx.fillStyle = "#a1a1aa";
  ctx.font = fuente(400, 32);
  ctx.fillText(pendientes.length ? "Esto es lo que va:" : "Estás al corriente. ¡Gracias!", 96, 270);

  let y = 330;
  for (const l of pendientes) {
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.roundRect(96, y, W - 192, 80, 20);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = fuente(600, 32);
    ctx.fillText(recortar(ctx, l.pago, 560), 128, y + 38);
    ctx.fillStyle = l.estado === "debe" ? "#f87171" : "#a1a1aa";
    ctx.font = fuente(400, 24);
    ctx.fillText(`${fechaCorta(l.fecha)}${l.estado === "debe" ? " · vencido" : ""}`, 128, y + 68);
    ctx.fillStyle = "#ffffff";
    ctx.font = fuente(700, 34);
    const m = dinero(l.monto);
    ctx.fillText(m, W - 128 - ctx.measureText(m).width, y + 52);
    y += 96;
  }

  y += 30;
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(96, y);
  ctx.lineTo(W - 96, y);
  ctx.stroke();
  ctx.fillStyle = "#a1a1aa";
  ctx.font = fuente(500, 32);
  ctx.fillText("Total", 96, y + 64);
  ctx.fillStyle = "#ffffff";
  ctx.font = fuente(800, 48);
  const total = dinero(datos.debe + datos.pendiente);
  ctx.fillText(total, W - 96 - ctx.measureText(total).width, y + 68);
  if (datos.debe > 0) {
    ctx.fillStyle = "#f87171";
    ctx.font = fuente(500, 26);
    const v = `Vencido: ${dinero(datos.debe)}`;
    ctx.fillText(v, W - 96 - ctx.measureText(v).width, y + 112);
  }

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo crear la imagen"))), "image/png"));
}
