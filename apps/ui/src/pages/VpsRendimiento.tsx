/** Rendimiento del VPS en vivo (sondeo por SSH solo mientras esta pantalla está abierta). */
import { temas } from "@mi-setup/shared";
import { Activity } from "lucide-react";
import { useState } from "react";
import { Anillo, LineaEnVivo, useVentana, type PuntoSerie } from "../components/graficas";
import { Encabezado, Tarjeta, Vacio } from "../components/ui";
import { fmtBps, fmtBytes, fmtDuracion, fmtPct } from "../lib/formato";
import { useTema } from "../lib/tiempo-real";
import { SelectorServidor, useServidores } from "../lib/vps";

interface Metricas {
  t: number;
  error?: string;
  cpu?: number;
  ram?: { usado: number; total: number };
  swap?: { usado: number; total: number };
  discos?: { nombre: string; usado: number; total: number }[];
  red?: { rxBps: number; txBps: number };
  carga?: [number, number, number];
  uptime?: number;
}

function aPunto(d: unknown): PuntoSerie | null {
  const m = d as Metricas;
  if (!m?.t || m.error) return null;
  return {
    t: m.t,
    cpu: m.cpu,
    ram: m.ram && m.ram.total > 0 ? (m.ram.usado / m.ram.total) * 100 : undefined,
    rx: m.red?.rxBps,
    tx: m.red?.txBps,
    carga: m.carga?.[0],
  };
}

function Panel({ id }: { id: string }) {
  const tema = temas.metricasVps(id);
  const puntos = useVentana(tema, aPunto);
  const [ultimo, setUltimo] = useState<Metricas | null>(null);
  useTema<Metricas>(tema, setUltimo);
  const p = puntos.at(-1);

  if (ultimo?.error) return <Vacio icono={Activity} texto={ultimo.error} />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Tarjeta titulo={`CPU · ${fmtPct(p?.cpu)}`}>
          <LineaEnVivo datos={puntos} series={[{ clave: "cpu", nombre: "CPU" }]} formato={(v) => `${v.toFixed(0)}%`} dominio={[0, 100]} />
        </Tarjeta>
        <Tarjeta titulo={`RAM · ${fmtPct(p?.ram)} ${ultimo?.ram ? `(${fmtBytes(ultimo.ram.usado)} de ${fmtBytes(ultimo.ram.total)})` : ""}`}>
          <LineaEnVivo datos={puntos} series={[{ clave: "ram", nombre: "RAM", color: "#8E8E93" }]} formato={(v) => `${v.toFixed(0)}%`} dominio={[0, 100]} />
        </Tarjeta>
        <Tarjeta titulo={`Red · ↓ ${fmtBps(p?.rx)} · ↑ ${fmtBps(p?.tx)}`}>
          <LineaEnVivo
            datos={puntos}
            series={[
              { clave: "rx", nombre: "Entrada", color: "#30D158" },
              { clave: "tx", nombre: "Salida", color: "#E5E5EA" },
            ]}
            formato={fmtBps}
          />
        </Tarjeta>
        <Tarjeta titulo={`Carga · ${ultimo?.carga?.map((c) => c.toFixed(2)).join(" / ") ?? "—"}`}>
          <LineaEnVivo datos={puntos} series={[{ clave: "carga", nombre: "Carga (1 min)", color: "#FFD60A" }]} formato={(v) => v.toFixed(2)} />
        </Tarjeta>
      </div>
      <Tarjeta titulo={`Discos · encendido ${fmtDuracion(ultimo?.uptime)}`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {ultimo?.discos?.map((d) => (
            <Anillo key={d.nombre} valor={d.usado} total={d.total} etiqueta={d.nombre} detalle={`${fmtBytes(d.total - d.usado)} libres`} />
          ))}
          {ultimo?.swap && ultimo.swap.total > 0 ? <Anillo valor={ultimo.swap.usado} total={ultimo.swap.total} etiqueta="Swap" detalle={fmtBytes(ultimo.swap.total)} /> : null}
        </div>
      </Tarjeta>
    </div>
  );
}

export default function VpsRendimiento() {
  const { data } = useServidores();
  const [id, setId] = useState<string | null>(null);
  return (
    <>
      <Encabezado titulo="Rendimiento" descripcion="Últimos 5 minutos, en vivo. No se guarda historial." acciones={<SelectorServidor valor={id} alCambiar={setId} />} />
      {data?.length === 0 ? <Vacio icono={Activity} texto="Agrega un servidor en Terminal." /> : null}
      {id ? <Panel key={id} id={id} /> : null}
    </>
  );
}
