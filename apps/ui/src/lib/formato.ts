const fechaHora = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const soloFecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });
const hora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const fmtFechaHora = (v: string | number | Date | null | undefined) => (v ? fechaHora.format(new Date(v)) : "—");
export const fmtFecha = (v: string | number | Date | null | undefined) => (v ? soloFecha.format(new Date(v)) : "—");
export const fmtHora = (v: number) => hora.format(new Date(v));

export function fmtBytes(bytes: number | null | undefined, decimales = 1): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : decimales)} ${unidades[i]}`;
}

export const fmtBps = (bps: number | null | undefined) => (bps === null || bps === undefined ? "—" : `${fmtBytes(bps)}/s`);
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toFixed(0)} %`);

export function fmtDinero(monto: number | string, moneda = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).format(Number(monto));
}

export function fmtDuracion(segundos: number | null | undefined): string {
  if (!segundos && segundos !== 0) return "—";
  const d = Math.floor(segundos / 86400);
  const h = Math.floor((segundos % 86400) / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return d > 0 ? `${d} d ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function haceCuanto(v: string | number | Date | null | undefined): string {
  if (!v) return "nunca";
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

/** Convierte una fecha a valor de <input type="datetime-local"> en hora local. */
export function aInputLocal(v: Date | string): string {
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
