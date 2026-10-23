import { NOMBRE_TIPO_EQUIPO, temas, type MetricasDispositivo } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ChevronRight,
  Cpu,
  Globe,
  History,
  LogIn,
  LogOut,
  MemoryStick,
  Monitor,
  MonitorSmartphone,
  Pencil,
  Power,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Anillo, BarrasDiscos, useVentana, type PuntoSerie } from "../components/graficas";
import { usePaginado } from "../components/Paginas";
import { Boton, Cargando, Encabezado, ErrorCaja, Insignia, Punto, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { dispositivoActual } from "../lib/dispositivo";
import { fmtBps, fmtBytes, fmtDuracion, fmtFechaHora, fmtPct, haceCuanto } from "../lib/formato";
import { useTema } from "../lib/tiempo-real";

type TipoEquipo = "pc" | "tablet" | "celular" | "web";

interface Equipo {
  id: string;
  nombre: string;
  tipo: TipoEquipo;
  plataforma: string | null;
  reinstalaciones?: number;
  ultimaVez: string | null;
  conectado: boolean;
  metricas: MetricasDispositivo | null;
}

interface Sesion {
  id: string;
  dispositivo: string;
  navegador: string;
  ip: string | null;
  creada: string;
  ultimoUso: string;
  actual: boolean;
  tipo?: TipoEquipo;
  sistema?: string;
  cliente?: "app" | "navegador";
  estado?: "abierta" | "cerrada" | "vencida";
  cerrada?: string | null;
}

const ESTILO: Record<TipoEquipo, { icono: LucideIcon; caja: string }> = {
  pc: { icono: Monitor, caja: "bg-[color-mix(in_srgb,var(--acento)_16%,transparent)] text-acento" },
  tablet: { icono: Tablet, caja: "bg-sky-400/15 text-sky-300" },
  celular: { icono: Smartphone, caja: "bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] text-ok" },
  web: { icono: Globe, caja: "bg-[color-mix(in_srgb,var(--aviso)_16%,transparent)] text-aviso" },
};

function IconoEquipo({ tipo, grande }: { tipo: TipoEquipo | undefined; grande?: boolean }) {
  const { icono: Icono, caja } = ESTILO[tipo ?? "pc"];
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-xl", caja, grande ? "h-14 w-14" : "h-10 w-10")}>
      <Icono className={grande ? "h-6 w-6" : "h-[18px] w-[18px]"} />
    </span>
  );
}

function Chispa({ valores, color }: { valores: number[]; color: string }) {
  if (valores.length < 2) return <div className="h-10" />;
  const max = 100;
  const ancho = 120;
  const puntos = valores.map((v, i) => `${(i / (valores.length - 1)) * ancho},${38 - (Math.min(v, max) / max) * 34}`).join(" ");
  return (
    <svg viewBox={`0 0 ${ancho} 40`} preserveAspectRatio="none" className="mt-2 h-10 w-full" aria-hidden="true">
      <polygon points={`0,40 ${puntos} ${ancho},40`} fill={color} opacity="0.18" />
      <polyline points={puntos} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

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

function Dato({ icono: Icono, titulo, children }: { icono: LucideIcon; titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-borde bg-tarjeta/60 p-3">
      <p className="flex items-center gap-1.5 text-xs text-tenue">
        <Icono className="h-3.5 w-3.5" />
        {titulo}
      </p>
      {children}
    </div>
  );
}

function Detalle({ equipo, puedeEditar, actual }: { equipo: Equipo; puedeEditar: boolean; actual: boolean }) {
  const puntos = useVentana(equipo.conectado ? temas.metricasEquipo(equipo.id) : null, aPunto);
  const ultimo = puntos.at(-1);
  const m = equipo.metricas;
  const [renombrando, setRenombrando] = useState(false);
  const cpu = puntos.map((p) => p.cpu).filter((v): v is number => v !== undefined);
  const ram = puntos.map((p) => p.ram).filter((v): v is number => v !== undefined);
  const ramActual = ultimo?.ram ?? (m?.ram && m.ram.total > 0 ? (m.ram.usado / m.ram.total) * 100 : undefined);
  const red = ultimo ?? { rx: m?.red?.rxBps, tx: m?.red?.txBps };

  const renombrar = useMutation({
    mutationFn: (nombre: string) => api(`/api/equipos/${equipo.id}`, { metodo: "PATCH", cuerpo: { nombre } }),
    onSuccess: () => {
      setRenombrando(false);
      void queryClient.invalidateQueries({ queryKey: ["equipos"] });
    },
    onError: avisarError,
  });

  const borrar = async () => {
    if (!(await confirmar({ titulo: "Quitar equipo", mensaje: `¿Quitar "${equipo.nombre}" de la lista? Si vuelve a abrir la app se registrará de nuevo.` }))) return;
    try {
      await api(`/api/equipos/${equipo.id}`, { metodo: "DELETE" });
      avisar("Equipo quitado");
      await queryClient.invalidateQueries({ queryKey: ["equipos"] });
    } catch (err) {
      avisarError(err);
    }
  };

  return (
    <Tarjeta className="min-w-0">
      <div className="flex flex-wrap items-start gap-4">
        <IconoEquipo tipo={equipo.tipo} grande />
        <div className="min-w-0 flex-1">
          {renombrando ? (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                renombrar.mutate(String(new FormData(ev.currentTarget).get("nombre") ?? ""));
              }}
            >
              <input name="nombre" defaultValue={equipo.nombre} autoFocus maxLength={60} className="w-full max-w-sm rounded-lg border border-borde bg-fondo px-3 py-1.5 text-lg font-semibold" />
            </form>
          ) : (
            <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold">
              <span className="truncate">{equipo.nombre}</span>
              {actual ? <Insignia tono="ok">Este</Insignia> : null}
            </h2>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-borde px-2.5 py-1 text-tenue">{NOMBRE_TIPO_EQUIPO[equipo.tipo]}</span>
            {equipo.plataforma ? <span className="rounded-full border border-borde px-2.5 py-1 text-tenue">{equipo.plataforma}</span> : null}
            {equipo.reinstalaciones ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-borde px-2.5 py-1 text-tenue">
                <RefreshCw className="h-3 w-3" />
                {`Reinstalaciones: ${equipo.reinstalaciones} · sigue siendo 1 equipo`}
              </span>
            ) : null}
          </div>
        </div>
        <Punto conectado={equipo.conectado} texto />
      </div>

      {equipo.conectado ? (
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Dato icono={Cpu} titulo="Procesador">
            <p className="mt-1 text-xl font-semibold">{fmtPct(ultimo?.cpu ?? m?.cpu)}</p>
            <Chispa valores={cpu} color="var(--acento)" />
          </Dato>
          <Dato icono={MemoryStick} titulo="Memoria">
            <p className="mt-1 text-xl font-semibold">{fmtPct(ramActual)}</p>
            <Chispa valores={ram} color="#7cb7ff" />
            {m?.ram ? <p className="text-xs text-tenue">{fmtBytes(m.ram.usado)} de {fmtBytes(m.ram.total)}</p> : null}
          </Dato>
          <Dato icono={ArrowDownUp} titulo="Red">
            <p className="mt-1 text-sm font-semibold">↓ {fmtBps(red.rx)}</p>
            <p className="text-sm font-semibold">↑ {fmtBps(red.tx)}</p>
            {m?.conexion ? <p className="mt-1 truncate text-xs text-tenue">{m.conexion}</p> : null}
          </Dato>
          <Dato icono={Power} titulo="Encendido">
            <p className="mt-1 text-xl font-semibold">{m?.uptime ? fmtDuracion(m.uptime) : "—"}</p>
          </Dato>
        </div>
      ) : (
        <div className="mt-4">
          <Vacio texto={`Desconectado (${haceCuanto(equipo.ultimaVez)}). Los datos en vivo aparecen cuando el equipo se conecta.`} />
        </div>
      )}

      {equipo.conectado && (m?.bateria || m?.discos?.length) ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {m?.bateria ? <Anillo valor={m.bateria.nivel} total={100} etiqueta="Batería" detalle={m.bateria.cargando ? "Cargando" : "Sin cargar"} invertido /> : null}
          {m?.discos?.slice(0, 3).map((d) => (
            <Anillo key={d.nombre} valor={d.usado} total={d.total} etiqueta={d.nombre} detalle={`${fmtBytes(d.total - d.usado)} libres`} />
          ))}
        </div>
      ) : null}
      {equipo.conectado && m?.discos && m.discos.length > 3 ? <BarrasDiscos discos={m.discos} /> : null}

      {puedeEditar ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Boton tamano="sm" variante="secundario" icono={Pencil} onClick={() => setRenombrando((v) => !v)}>
            Renombrar
          </Boton>
          <Boton tamano="sm" variante="secundario" icono={Trash2} onClick={() => void borrar()}>
            Quitar equipo
          </Boton>
        </div>
      ) : null}
    </Tarjeta>
  );
}

function describirSesion(s: Sesion): string {
  const cliente = s.cliente === "app" ? (s.tipo === "pc" ? "App de escritorio" : s.tipo === "tablet" ? "App de tablet" : "App del celular") : "Navegador";
  return [cliente, s.sistema, s.ip ?? "IP desconocida", `desde ${fmtFechaHora(s.creada)}`].filter(Boolean).join(" · ");
}

function SesionesAbiertas() {
  const sesiones = useQuery({ queryKey: ["seguridad", "sesiones"], queryFn: () => api<Sesion[]>("/api/seguridad/sesiones") });
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["seguridad"] });
  const cerrar = useMutation({ mutationFn: (id: string) => api(`/api/seguridad/sesiones/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  const otras = useMutation({
    mutationFn: () => api<{ cerradas: number }>("/api/seguridad/sesiones/cerrar-otras", { metodo: "POST" }),
    onSuccess: (r) => {
      avisar(r.cerradas === 1 ? "Se cerró 1 sesión" : `Se cerraron ${r.cerradas} sesiones`);
      refrescar();
    },
    onError: avisarError,
  });
  return (
    <Tarjeta
      titulo="Dónde tienes la sesión abierta"
      icono={ShieldCheck}
      acciones={
        (sesiones.data?.length ?? 0) > 1 ? (
          <Boton
            tamano="sm"
            variante="peligro"
            icono={LogOut}
            cargando={otras.isPending}
            onClick={async () => {
              if (await confirmar({ titulo: "Cerrar todas menos esta", mensaje: "Tus otros aparatos tendrán que volver a entrar. Esta sesión se queda abierta.", boton: "Cerrar las demás" })) otras.mutate();
            }}
          >
            Cerrar todas menos esta
          </Boton>
        ) : null
      }
    >
      <ErrorCaja error={sesiones.error} />
      {sesiones.isLoading ? <Cargando /> : null}
      <ul className="divide-y divide-borde">
        {sesiones.data?.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5">
            <IconoEquipo tipo={s.tipo} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{s.dispositivo}</span>
                {s.actual ? <Insignia tono="ok">Este</Insignia> : null}
              </p>
              <p className="truncate text-xs text-tenue" title={s.navegador}>
                {describirSesion(s)}
              </p>
            </div>
            {s.actual ? (
              <span className="hidden shrink-0 rounded-full bg-[color-mix(in_srgb,var(--ok)_15%,transparent)] px-2.5 py-1 text-xs text-ok sm:inline">Sesión actual</span>
            ) : (
              <Boton tamano="sm" variante="secundario" icono={LogOut} onClick={() => cerrar.mutate(s.id)}>
                Cerrar
              </Boton>
            )}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

const TEXTO_ESTADO = {
  abierta: { texto: "Abierta", tono: "ok" },
  cerrada: { texto: "Cerrada", tono: "neutro" },
  vencida: { texto: "Venció", tono: "aviso" },
} as const;

function HistorialSesiones() {
  const q = useQuery({ queryKey: ["seguridad", "sesiones", "historial"], queryFn: () => api<Sesion[]>("/api/seguridad/sesiones/historial") });
  const { visibles, paginas, total } = usePaginado(q.data, 3);
  return (
    <Tarjeta titulo="Historial de entradas" icono={History} acciones={<span className="rounded-full bg-tarjeta px-2 py-0.5 text-xs text-tenue">últimas 9</span>}>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data && q.data.length === 0 ? <p className="text-sm text-tenue">Todavía no hay entradas.</p> : null}
      <ul className="space-y-1">
        {visibles.map((s) => {
          const estado = TEXTO_ESTADO[s.estado ?? "abierta"];
          return (
            <li key={s.id} className="flex items-start gap-3 rounded-xl p-2">
              <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", s.estado === "abierta" ? "bg-[color-mix(in_srgb,var(--ok)_15%,transparent)] text-ok" : "bg-tarjeta text-tenue")}>
                <LogIn className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{s.actual ? `Entraste desde ${s.dispositivo} (esta sesión)` : `Entraste desde ${s.dispositivo}`}</p>
                <p className="truncate text-xs text-tenue">
                  {fmtFechaHora(s.creada)} · {NOMBRE_TIPO_EQUIPO[s.tipo ?? "pc"]}
                  {s.sistema ? ` · ${s.sistema}` : ""}
                </p>
              </div>
              <Insignia tono={estado.tono}>{estado.texto}</Insignia>
            </li>
          );
        })}
      </ul>
      {total > 1 ? <div className="mt-2">{paginas}</div> : null}
    </Tarjeta>
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
  const seleccionado = data?.find((e) => e.id === params.get("id")) ?? data?.find((e) => e.id === actual) ?? data?.[0] ?? null;

  if (isLoading) return <Cargando />;
  return (
    <>
      <nav aria-label="Ruta" className="mb-1 flex items-center gap-1.5 text-xs text-tenue">
        <User className="h-3.5 w-3.5" />
        Mi cuenta
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-texto">Equipos</span>
      </nav>
      <Encabezado titulo="Equipos" descripcion="Tus aparatos con Mi Setup: cómo van ahora y dónde está abierta tu cuenta." />
      <ErrorCaja error={error} />
      <div className="grid gap-4 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <Tarjeta titulo="Mis equipos" icono={MonitorSmartphone} acciones={data ? <span className="rounded-full bg-tarjeta px-2 py-0.5 text-xs text-tenue">{data.length}</span> : null}>
          {data && data.length === 0 ? <Vacio icono={MonitorSmartphone} texto="Abre la app en tu PC, tablet o celular para registrarlos." /> : null}
          <div className="space-y-1.5">
            {data?.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setParams({ id: e.id }, { replace: true })}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition",
                  seleccionado?.id === e.id ? "border-[color-mix(in_srgb,var(--acento)_50%,transparent)] bg-[color-mix(in_srgb,var(--acento)_10%,transparent)]" : "border-transparent hover:bg-tarjeta",
                )}
              >
                <IconoEquipo tipo={e.tipo} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{e.nombre}</span>
                    {e.id === actual ? <Insignia tono="ok">Este</Insignia> : null}
                  </p>
                  <p className="truncate text-xs text-tenue">
                    {NOMBRE_TIPO_EQUIPO[e.tipo]}
                    {e.plataforma ? ` · ${e.plataforma}` : ""}
                    {e.conectado ? "" : ` · ${haceCuanto(e.ultimaVez)}`}
                  </p>
                </div>
                <Punto conectado={e.conectado} />
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-tenue">
            <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Si reinstalas la app en el mismo aparato, se junta con el que ya tenías.
          </p>
        </Tarjeta>
        {seleccionado ? <Detalle key={seleccionado.id} equipo={seleccionado} puedeEditar={puedeEditar} actual={seleccionado.id === actual} /> : null}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SesionesAbiertas />
        <HistorialSesiones />
      </div>
    </>
  );
}
