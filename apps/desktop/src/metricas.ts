/** Agente de la PC: lee CPU, RAM, discos, red y tiempo encendido con systeminformation. */
import si from "systeminformation";

interface Metricas {
  cpu: number;
  ram: { usado: number; total: number };
  discos: { nombre: string; usado: number; total: number }[];
  red: { rxBps: number; txBps: number };
  uptime: number;
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

export async function leerMetricas(): Promise<Metricas> {
  const [carga, mem, red, lista] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.networkStats("*").catch(() => []),
    leerDiscos(),
  ]);
  const suma = (k: "rx_sec" | "tx_sec") => red.reduce((t, i) => t + Math.max(0, Number(i[k]) || 0), 0);
  return {
    cpu: Math.min(100, Math.max(0, carga.currentLoad)),
    ram: { usado: mem.active, total: mem.total },
    discos: lista,
    red: { rxBps: suma("rx_sec"), txBps: suma("tx_sec") },
    uptime: si.time().uptime,
  };
}
