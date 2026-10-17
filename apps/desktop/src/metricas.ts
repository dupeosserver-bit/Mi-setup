/** Agente de la PC: lee CPU, RAM, discos, red y tiempo encendido con systeminformation. */
import si from "systeminformation";

interface Metricas {
  cpu: number;
  ram: { usado: number; total: number };
  discos: { nombre: string; usado: number; total: number }[];
  red: { rxBps: number; txBps: number };
  uptime: number;
  gpu?: number;
}

let discos: { valor: Metricas["discos"]; leido: number } = { valor: [], leido: 0 };

/** Leer discos es lento en Windows: se cachea 30 s. */
async function leerDiscos(): Promise<Metricas["discos"]> {
  if (Date.now() - discos.leido < 30_000) return discos.valor;
  const lista = await si.fsSize().catch(() => []);
  discos = {
    leido: Date.now(),
    valor: lista
      .filter((d) => d.size > 0)
      .slice(0, 8)
      .map((d) => ({ nombre: d.mount || d.fs, usado: d.used, total: d.size })),
  };
  return discos.valor;
}

let gpu: { valor: number | undefined; leido: number } = { valor: undefined, leido: 0 };

/** Uso de la GPU (NVIDIA lo da con nvidia-smi); se cachea 5 s porque es lento. */
async function leerGpu(): Promise<number | undefined> {
  if (Date.now() - gpu.leido < 5_000) return gpu.valor;
  const g = await si.graphics().catch(() => null);
  const uso = g?.controllers.map((c) => c.utilizationGpu).find((u): u is number => typeof u === "number" && Number.isFinite(u));
  gpu = { valor: uso === undefined ? undefined : Math.min(100, Math.max(0, uso)), leido: Date.now() };
  return gpu.valor;
}

export async function leerMetricas(): Promise<Metricas> {
  const [carga, mem, red, lista, usoGpu] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.networkStats("*").catch(() => []),
    leerDiscos(),
    leerGpu(),
  ]);
  const suma = (k: "rx_sec" | "tx_sec") => red.reduce((t, i) => t + Math.max(0, Number(i[k]) || 0), 0);
  return {
    cpu: Math.min(100, Math.max(0, carga.currentLoad)),
    ram: { usado: mem.active, total: mem.total },
    discos: lista,
    red: { rxBps: suma("rx_sec"), txBps: suma("tx_sec") },
    uptime: si.time().uptime,
    ...(usoGpu === undefined ? {} : { gpu: usoGpu }),
  };
}

export interface Sistema {
  sistema: string;
  procesador: string;
  nucleos: number;
  graficos: string[];
  memoria: number;
  almacenamiento: number;
  so: string;
  nombreEquipo: string;
}

let sistema: Sistema | null = null;

/** Datos fijos del equipo (no cambian mientras la app está abierta). */
export async function leerSistema(): Promise<Sistema> {
  if (sistema) return sistema;
  const [sis, cpu, graf, mem, discosFisicos, so] = await Promise.all([
    si.system().catch(() => null),
    si.cpu().catch(() => null),
    si.graphics().catch(() => null),
    si.mem().catch(() => null),
    si.diskLayout().catch(() => []),
    si.osInfo().catch(() => null),
  ]);
  const placa = [sis?.manufacturer, sis?.model].filter((x) => x && !/default|to be filled|system product/i.test(x)).join(" ");
  sistema = {
    sistema: placa || so?.hostname || "PC",
    procesador: [cpu?.manufacturer, cpu?.brand].filter(Boolean).join(" ").trim() || "Desconocido",
    nucleos: cpu?.cores ?? 0,
    graficos: (graf?.controllers ?? []).map((c) => c.model).filter((m) => m && !/basic display|remote display/i.test(m)),
    memoria: mem?.total ?? 0,
    almacenamiento: discosFisicos.reduce((t, d) => t + (d.size || 0), 0),
    so: [so?.distro, so?.release].filter(Boolean).join(" ") || "Windows",
    nombreEquipo: so?.hostname ?? "",
  };
  return sistema;
}
