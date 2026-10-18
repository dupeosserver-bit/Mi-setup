/** Equipos: estado conectado/desconectado y métricas en vivo de PC y celular. */
import { temas, type MetricasDispositivo } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Laptop, MonitorSmartphone, Pencil, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Anillo, BarrasDiscos, LineaEnVivo, useVentana, type PuntoSerie } from "../components/graficas";
import { Boton, Cargando, Encabezado, ErrorCaja, Insignia, Punto, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { dispositivoActual } from "../lib/dispositivo";
import { fmtBps, fmtBytes, fmtDuracion, fmtPct, haceCuanto } from "../lib/formato";
import { useTema } from "../lib/tiempo-real";

interface Equipo {
  id: string;
  nombre: string;
  tipo: "pc" | "celular" | "web";
  plataforma: string | null;
  ultimaVez: string | null;
  conectado: boolean;
  metricas: MetricasDispositivo | null;
}

const ICONOS = { pc: Laptop, celular: Smartphone, web: MonitorSmartphone } as const;

function aPunto(d: unknown): PuntoSerie | null {
  const m = d as MetricasDispositivo & { t: number };
  if (!m?.t) return null;
  return {
    t: m.t,
    cpu: m.cpu,
    ram: m.ram && m.ram.total > 0 ? (m.ram.usado / m.ram.total) * 100 : undefined,
    rx: m.red?.rxBps,
    tx: m.red?.txBps,
  };
}

function Detalle({ equipo }: { equipo: Equipo }) {
  const puntos = useVentana(equipo.conectado ? temas.metricasEquipo(equipo.id) : null, aPunto);
  const ultimo = puntos.at(-1);
  const m = equipo.metricas;
  if (!equipo.conectado) {
    return <Vacio texto={`Desconectado (${haceCuanto(equipo.ultimaVez)}). Las gráficas en vivo aparecen cuando el equipo se conecta.`} />;
  }
  return (
    <div className="space-y-4">
      {equipo.tipo === "pc" || ultimo?.cpu !== undefined ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-tenue">CPU · {fmtPct(ultimo?.cpu)}</p>
            <LineaEnVivo datos={puntos} series={[{ clave: "cpu", nombre: "CPU" }]} formato={(v) => `${v.toFixed(0)}%`} dominio={[0, 100]} />
          </div>
          <div>
            <p className="mb-1 text-xs text-tenue">
              RAM · {fmtPct(ultimo?.ram)} {m?.ram ? `(${fmtBytes(m.ram.usado)} de ${fmtBytes(m.ram.total)})` : ""}
            </p>
            <LineaEnVivo datos={puntos} series={[{ clave: "ram", nombre: "RAM", color: "#8E8E93" }]} formato={(v) => `${v.toFixed(0)}%`} dominio={[0, 100]} />
          </div>
          <div className="md:col-span-2">
            <p className="mb-1 text-xs text-tenue">
              Red · ↓ {fmtBps(ultimo?.rx)} · ↑ {fmtBps(ultimo?.tx)}
            </p>
            <LineaEnVivo
              datos={puntos}
              series={[
                { clave: "rx", nombre: "Descarga", color: "#30D158" },
                { clave: "tx", nombre: "Subida", color: "#E5E5EA" },
              ]}
              formato={(v) => fmtBps(v)}
            />
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {m?.bateria ? (
          <Anillo valor={m.bateria.nivel} total={100} etiqueta="Batería" detalle={m.bateria.cargando ? "Cargando" : "Sin cargar"} invertido />
        ) : null}
        {m?.discos?.slice(0, 2).map((d) => (
          <Anillo key={d.nombre} valor={d.usado} total={d.total} etiqueta={d.nombre} detalle={`${fmtBytes(d.total - d.usado)} libres`} />
        ))}
        <div className="space-y-1 text-sm">
          {m?.conexion ? <p>Red: <span className="text-tenue">{m.conexion}</span></p> : null}
          {m?.uptime ? <p>Encendido: <span className="text-tenue">{fmtDuracion(m.uptime)}</span></p> : null}
          {equipo.plataforma ? <p>Sistema: <span className="text-tenue">{equipo.plataforma}</span></p> : null}
        </div>
      </div>
      {m?.discos && m.discos.length > 2 ? <BarrasDiscos discos={m.discos} /> : null}
    </div>
  );
}

export default function Equipos() {
  const [params, setParams] = useSearchParams();
  const puedeEditar = usePuede("equipos", "escritura");
  const actual = dispositivoActual();
  useTema(temas.dispositivos, () => void queryClient.invalidateQueries({ queryKey: ["equipos"] }));
  const { data, isLoading, error } = useQuery({
    queryKey: ["equipos"],
    queryFn: () => api<Equipo[]>("/api/equipos"),
    refetchInterval: 30_000,
  });
  const seleccionado = params.get("id") ?? data?.[0]?.id ?? null;
  const [renombrando, setRenombrando] = useState<string | null>(null);

  const renombrar = useMutation({
    mutationFn: ({ id, nombre }: { id: string; nombre: string }) => api(`/api/equipos/${id}`, { metodo: "PATCH", cuerpo: { nombre } }),
    onSuccess: () => {
      setRenombrando(null);
      void queryClient.invalidateQueries({ queryKey: ["equipos"] });
    },
    onError: avisarError,
  });

  const borrar = async (e: Equipo) => {
    if (!(await confirmar({ titulo: "Quitar equipo", mensaje: `¿Quitar "${e.nombre}" de la lista? Si vuelve a abrir la app se registrará de nuevo.` }))) return;
    try {
      await api(`/api/equipos/${e.id}`, { metodo: "DELETE" });
      avisar("Equipo quitado");
      await queryClient.invalidateQueries({ queryKey: ["equipos"] });
    } catch (err) {
      avisarError(err);
    }
  };

  if (isLoading) return <Cargando />;
  return (
    <>
      <Encabezado titulo="Equipos" descripcion="PC y celular vinculados. Latido cada 15 s; se marcan como desconectados a los 45 s." />
      <ErrorCaja error={error} />
      {data && data.length === 0 ? <Vacio icono={MonitorSmartphone} texto="Abre la app en tu PC o en tu celular para registrarlos." /> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {data?.map((e) => {
            const Icono = ICONOS[e.tipo];
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setParams({ id: e.id })}
                className={cx(
                  "flex w-full items-center gap-3 rounded-tarjeta border p-3 text-left",
                  seleccionado === e.id ? "border-acento/60 bg-tarjeta" : "border-borde bg-superficie hover:bg-tarjeta",
                )}
              >
                <Icono className="h-5 w-5 text-tenue" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {e.nombre} {e.id === actual ? <Insignia>este</Insignia> : null}
                  </p>
                  <p className="text-xs text-tenue">{e.conectado ? "En línea" : haceCuanto(e.ultimaVez)}</p>
                </div>
                <Punto conectado={e.conectado} />
              </button>
            );
          })}
        </div>
        {data?.map((e) =>
          e.id === seleccionado ? (
            <Tarjeta
              key={e.id}
              titulo={
                renombrando === e.id ? (
                  <form
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      const nombre = new FormData(ev.currentTarget).get("nombre");
                      renombrar.mutate({ id: e.id, nombre: String(nombre) });
                    }}
                  >
                    <input name="nombre" defaultValue={e.nombre} autoFocus className="rounded-lg border border-borde bg-fondo px-2 py-1 text-sm" />
                  </form>
                ) : (
                  <span className="flex items-center gap-2">
                    {e.nombre} <Punto conectado={e.conectado} texto />
                  </span>
                )
              }
              acciones={
                puedeEditar ? (
                  <>
                    <Boton tamano="icono" variante="fantasma" icono={Pencil} onClick={() => setRenombrando(e.id)} aria-label="Renombrar" />
                    <Boton tamano="icono" variante="fantasma" icono={Trash2} onClick={() => void borrar(e)} aria-label="Quitar" />
                  </>
                ) : null
              }
            >
              <Detalle equipo={e} />
            </Tarjeta>
          ) : null,
        )}
      </div>
    </>
  );
}
