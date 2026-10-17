/**
 * "Este equipo" (estilo Wintoys): qué tiene la PC o el celular donde está
 * abierta la app (sistema, procesador, gráficos, memoria, almacenamiento,
 * sistema operativo, tiempo encendido) y su uso en vivo.
 */
import type { InfoEquipo, MetricasDispositivo } from "@mi-setup/shared";
import { useQuery } from "@tanstack/react-query";
import { Battery, Clock, Cpu, Gauge, Globe, HardDrive, MemoryStick, Monitor, MonitorSmartphone, type LucideIcon } from "lucide-react";
import { fmtBps, fmtBytes, fmtDuracion } from "../lib/formato";
import { leerMetricas, leerSistema, tipoDispositivo } from "../lib/plataforma";
import { cx } from "./ui";

function Dato({ icono: Icono, etiqueta, valor }: { icono: LucideIcon; etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-borde bg-superficie px-4 py-3">
      <Icono className="h-4 w-4 shrink-0 text-tenue" />
      <span className="shrink-0 text-sm">{etiqueta}</span>
      <span className="ml-auto truncate text-right text-sm text-tenue" title={valor}>
        {valor}
      </span>
    </div>
  );
}

function Uso({ icono: Icono, etiqueta, valor, extra }: { icono: LucideIcon; etiqueta: string; valor: string; extra?: string }) {
  return (
    <div className="flex min-h-28 flex-col justify-between rounded-xl border border-borde bg-superficie p-4">
      <div className="flex items-start justify-between gap-2">
        <Icono className="h-5 w-5 text-tenue" />
        {extra ? <span className="text-xs text-tenue">{extra}</span> : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-sm">{etiqueta}</span>
        <span className="text-2xl font-semibold">{valor}</span>
      </div>
    </div>
  );
}

const pct = (usado?: number, total?: number) => (usado !== undefined && total ? `${Math.round((usado / total) * 100)}%` : "—");

export function EsteEquipo() {
  const tipo = tipoDispositivo();
  const sistema = useQuery<InfoEquipo>({ queryKey: ["este-equipo", "sistema"], queryFn: leerSistema, staleTime: Infinity, retry: false });
  const m = useQuery<MetricasDispositivo>({ queryKey: ["este-equipo", "metricas"], queryFn: leerMetricas, refetchInterval: 2000, retry: false });
  const s = sistema.data;
  const met = m.data ?? {};
  const disco = met.discos?.reduce((t, d) => ({ usado: t.usado + d.usado, total: t.total + d.total }), { usado: 0, total: 0 });
  const titulo = tipo === "pc" ? "Esta PC" : tipo === "celular" ? "Este celular" : "Este navegador";

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <MonitorSmartphone className="h-4 w-4 text-tenue" /> {titulo}
        {s?.nombreEquipo ? <span className="text-sm font-normal text-tenue">· {s.nombreEquipo}</span> : null}
      </h2>
      <div className="grid gap-2 md:grid-cols-2">
        <Dato icono={Monitor} etiqueta="Sistema" valor={s?.sistema ?? "…"} />
        <Dato icono={Cpu} etiqueta="Procesador" valor={s ? `${s.procesador}${s.nucleos && !s.procesador.includes("núcleos") ? ` · ${s.nucleos} núcleos` : ""}` : "…"} />
        <Dato icono={Gauge} etiqueta="Gráficos" valor={s?.graficos.length ? s.graficos.join(", ") : "—"} />
        <Dato icono={MemoryStick} etiqueta="Memoria" valor={s?.memoria ? fmtBytes(s.memoria, 0) : met.ram?.total ? fmtBytes(met.ram.total, 0) : "—"} />
        <Dato icono={HardDrive} etiqueta="Almacenamiento" valor={s?.almacenamiento ? fmtBytes(s.almacenamiento, 0) : disco?.total ? fmtBytes(disco.total, 0) : "—"} />
        <Dato icono={MonitorSmartphone} etiqueta={tipo === "celular" ? "Android" : "Sistema operativo"} valor={s?.so ?? "…"} />
        {met.uptime !== undefined ? <Dato icono={Clock} etiqueta="Tiempo encendido" valor={fmtDuracion(met.uptime)} /> : null}
        {met.bateria ? <Dato icono={Battery} etiqueta="Batería" valor={`${met.bateria.nivel}%${met.bateria.cargando ? " · cargando" : ""}`} /> : null}
      </div>
      <div className={cx("grid gap-2", tipo === "pc" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2")}>
        {met.cpu !== undefined ? <Uso icono={Cpu} etiqueta="Procesador" valor={`${Math.round(met.cpu)}%`} /> : null}
        {met.gpu !== undefined ? <Uso icono={Gauge} etiqueta="Tarjeta de video" valor={`${Math.round(met.gpu)}%`} /> : null}
        {met.ram && met.ram.total > met.ram.usado ? <Uso icono={MemoryStick} etiqueta="Memoria" valor={pct(met.ram.usado, met.ram.total)} extra={`${fmtBytes(met.ram.usado)} de ${fmtBytes(met.ram.total)}`} /> : null}
        {disco?.total ? <Uso icono={HardDrive} etiqueta="Disco" valor={pct(disco.usado, disco.total)} extra={`${fmtBytes(disco.total - disco.usado)} libres`} /> : null}
        {met.red ? <Uso icono={Globe} etiqueta="Red" valor="" extra={`↑ ${fmtBps(met.red.txBps)} ↓ ${fmtBps(met.red.rxBps)}`} /> : null}
        {met.conexion && !met.red ? <Uso icono={Globe} etiqueta="Conexión" valor={met.conexion} /> : null}
      </div>
    </section>
  );
}
