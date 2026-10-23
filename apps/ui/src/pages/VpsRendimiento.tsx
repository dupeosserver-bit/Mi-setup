import { temas } from "@mi-setup/shared";
import { Activity, Cpu, Gauge, HardDrive, MemoryStick, Network, Power } from "lucide-react";
import { useState } from "react";
import { Anillo, LineaEnVivo, useVentana, type PuntoSerie } from "../components/graficas";
import { Encabezado, Tarjeta, Vacio } from "../components/ui";
import { BotonTerminal, Chispa, Cuadro, EnVivo, Leyenda, PildorasServidor } from "../components/vps/piezas";
import { fmtBps, fmtBytes, fmtDuracion, fmtPct } from "../lib/formato";
import { useTema } from "../lib/tiempo-real";
import { useServidores } from "../lib/vps";

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

const BAJADA = "#4C8DFF";
const SUBIDA = "#F08A3C";

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

function serie(puntos: PuntoSerie[], clave: string): number[] {
  return puntos.map((p) => p[clave]).filter((v): v is number => typeof v === "number");
}

function Panel({ id }: { id: string }) {
  const tema = temas.metricasVps(id);
  const puntos = useVentana(tema, aPunto);
  const [ultimo, setUltimo] = useState<Metricas | null>(null);
  useTema<Metricas>(tema, setUltimo);
  const p = puntos.at(-1);
  const carga = ultimo?.carga;

  if (ultimo?.error) return <Vacio icono={Activity} texto={ultimo.error} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cuadro icono={Cpu} titulo="Procesador" valor={fmtPct(p?.cpu)} detalle="en uso ahora" pie={<Chispa valores={serie(puntos, "cpu")} maximo={100} />} />
        <Cuadro
          icono={MemoryStick}
          titulo="Memoria"
          valor={fmtPct(p?.ram)}
          detalle={ultimo?.ram ? `${fmtBytes(ultimo.ram.usado)} de ${fmtBytes(ultimo.ram.total)}` : "—"}
          pie={<Chispa valores={serie(puntos, "ram")} maximo={100} />}
        />
        <Cuadro
          icono={Network}
          titulo="Internet"
          valor={`↓ ${fmtBps(p?.rx)}`}
          detalle={`↑ ${fmtBps(p?.tx)} de subida`}
          pie={<Chispa valores={serie(puntos, "rx")} color={BAJADA} />}
        />
        <Cuadro
          icono={Gauge}
          titulo="Carga"
          valor={carga ? carga[0].toFixed(2) : "—"}
          detalle={carga ? `5 min ${carga[1].toFixed(2)} · 15 min ${carga[2].toFixed(2)}` : "—"}
          pie={<Chispa valores={serie(puntos, "carga")} />}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Tarjeta titulo="Procesador" acciones={<span className="text-xs text-tenue tabular-nums">{fmtPct(p?.cpu)}</span>}>
          <LineaEnVivo datos={puntos} series={[{ clave: "cpu", nombre: "Procesador", color: "var(--acento)" }]} formato={(v) => `${v.toFixed(0)}%`} dominio={[0, 100]} />
        </Tarjeta>
        <Tarjeta
          titulo="Memoria"
          acciones={<span className="text-xs text-tenue tabular-nums">{ultimo?.ram ? `${fmtPct(p?.ram)} · ${fmtBytes(ultimo.ram.usado)} de ${fmtBytes(ultimo.ram.total)}` : fmtPct(p?.ram)}</span>}
        >
          <LineaEnVivo datos={puntos} series={[{ clave: "ram", nombre: "Memoria", color: "var(--acento)" }]} formato={(v) => `${v.toFixed(0)}%`} dominio={[0, 100]} />
        </Tarjeta>
        <Tarjeta titulo="Internet" acciones={<span className="text-xs text-tenue tabular-nums">↓ {fmtBps(p?.rx)} · ↑ {fmtBps(p?.tx)}</span>}>
          <Leyenda series={[{ nombre: "Bajada", color: BAJADA }, { nombre: "Subida", color: SUBIDA }]} />
          <LineaEnVivo
            datos={puntos}
            series={[
              { clave: "rx", nombre: "Bajada", color: BAJADA },
              { clave: "tx", nombre: "Subida", color: SUBIDA },
            ]}
            formato={fmtBps}
          />
        </Tarjeta>
        <Tarjeta titulo="Carga del servidor" acciones={<span className="text-xs text-tenue tabular-nums">{carga?.map((c) => c.toFixed(2)).join(" / ") ?? "—"}</span>}>
          <LineaEnVivo datos={puntos} series={[{ clave: "carga", nombre: "Carga (1 min)", color: "var(--acento)" }]} formato={(v) => v.toFixed(2)} />
        </Tarjeta>
      </div>
      <Tarjeta
        titulo="Discos"
        icono={HardDrive}
        acciones={
          <span className="inline-flex items-center gap-1.5 text-xs text-tenue">
            <Power className="h-3.5 w-3.5" />
            encendido {fmtDuracion(ultimo?.uptime)}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {ultimo?.discos?.map((d) => (
            <Anillo key={d.nombre} valor={d.usado} total={d.total} etiqueta={d.nombre} detalle={`${fmtBytes(d.total - d.usado)} libres de ${fmtBytes(d.total)}`} />
          ))}
          {ultimo?.swap && ultimo.swap.total > 0 ? (
            <Anillo valor={ultimo.swap.usado} total={ultimo.swap.total} etiqueta="Memoria de apoyo" detalle={`${fmtBytes(ultimo.swap.total)} en total`} />
          ) : null}
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
      <Encabezado
        titulo="Rendimiento"
        descripcion={<EnVivo texto="En vivo · últimos 5 minutos · no se guarda historial" />}
        acciones={
          <>
            <PildorasServidor valor={id} alCambiar={setId} />
            <BotonTerminal servidor={id} />
          </>
        }
      />
      {data?.length === 0 ? <Vacio icono={Activity} texto="Agrega un servidor en Terminal." /> : null}
      {id ? <Panel key={id} id={id} /> : null}
    </>
  );
}
