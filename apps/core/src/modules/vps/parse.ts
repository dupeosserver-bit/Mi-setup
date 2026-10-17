/** Lectura de /proc y df en el VPS (funciones puras, probadas en test/vps.test.ts). */

export const SCRIPT_METRICAS = [
  "head -1 /proc/stat",
  "echo ---",
  "cat /proc/meminfo",
  "echo ---",
  "df -P -B1 -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null",
  "echo ---",
  "cat /proc/net/dev",
  "echo ---",
  "cat /proc/loadavg",
  "echo ---",
  "cat /proc/uptime",
].join("; ");

export interface Muestra {
  cpuTotal: number;
  cpuOcioso: number;
  rx: number;
  tx: number;
  t: number;
}

export interface MetricasVps {
  t: number;
  cpu?: number;
  ram: { usado: number; total: number };
  swap: { usado: number; total: number };
  discos: { nombre: string; usado: number; total: number }[];
  red?: { rxBps: number; txBps: number };
  carga: [number, number, number];
  uptime: number;
}

function memoria(texto: string): Record<string, number> {
  const r: Record<string, number> = {};
  for (const linea of texto.split("\n")) {
    const m = /^(\w+):\s+(\d+)/.exec(linea);
    if (m?.[1] && m[2]) r[m[1]] = Number(m[2]) * 1024;
  }
  return r;
}

export function parsearMetricas(salida: string, t: number, previa: Muestra | null): { metricas: MetricasVps; muestra: Muestra } {
  const [stat = "", meminfo = "", df = "", netdev = "", loadavg = "", uptime = ""] = salida.split(/^---$/m).map((s) => s.trim());

  const cpu = stat.split(/\s+/).slice(1).map(Number);
  const cpuOcioso = (cpu[3] ?? 0) + (cpu[4] ?? 0);
  const cpuTotal = cpu.slice(0, 8).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

  const mem = memoria(meminfo);
  const total = mem["MemTotal"] ?? 0;
  const disponible = mem["MemAvailable"] ?? mem["MemFree"] ?? 0;

  const discos = df
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c.length >= 6 && Number(c[1]) > 0)
    .map((c) => ({ nombre: c[5] ?? c[0] ?? "", usado: Number(c[2]), total: Number(c[1]) }));

  let rx = 0;
  let tx = 0;
  for (const linea of netdev.split("\n").slice(2)) {
    const [iface, datos] = linea.split(":");
    if (!iface || !datos || iface.trim() === "lo") continue;
    const c = datos.trim().split(/\s+/).map(Number);
    rx += c[0] ?? 0;
    tx += c[8] ?? 0;
  }

  const carga = loadavg.split(/\s+/).slice(0, 3).map(Number) as [number, number, number];
  const muestra: Muestra = { cpuTotal, cpuOcioso, rx, tx, t };

  const metricas: MetricasVps = {
    t,
    ram: { usado: Math.max(0, total - disponible), total },
    swap: { usado: Math.max(0, (mem["SwapTotal"] ?? 0) - (mem["SwapFree"] ?? 0)), total: mem["SwapTotal"] ?? 0 },
    discos,
    carga,
    uptime: Number(uptime.split(/\s+/)[0] ?? 0),
  };
  if (previa) {
    const dTotal = cpuTotal - previa.cpuTotal;
    const dOcioso = cpuOcioso - previa.cpuOcioso;
    const segundos = (t - previa.t) / 1000;
    if (dTotal > 0) metricas.cpu = Math.min(100, Math.max(0, ((dTotal - dOcioso) / dTotal) * 100));
    if (segundos > 0) metricas.red = { rxBps: Math.max(0, (rx - previa.rx) / segundos), txBps: Math.max(0, (tx - previa.tx) / segundos) };
  }
  return { metricas, muestra };
}
