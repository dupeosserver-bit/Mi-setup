import { MODULES, temas, type InfoEquipo, type MetricasDispositivo, type ModuleId } from "@mi-setup/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Globe, LayoutGrid, Monitor, MonitorSmartphone, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EsteEquipo } from "../components/EsteEquipo";
import { cx, Punto, Vacio } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, useMe, usePuede } from "../lib/consultas";
import { fmtBytes, haceCuanto } from "../lib/formato";
import { leerMetricas, leerSistema } from "../lib/plataforma";
import { useTema } from "../lib/tiempo-real";
import { CATEGORIAS, MODULOS_UI, categoriaDe } from "../modulos";
import { ResumenInicio, Widget } from "./inicio-widgets";

type TipoEquipo = "pc" | "tablet" | "celular" | "web";

interface Equipo {
  id: string;
  nombre: string;
  tipo: TipoEquipo;
  plataforma?: string | null;
  conectado: boolean;
  ultimaVez: string | null;
}

const ICONO_EQUIPO: Record<TipoEquipo, LucideIcon> = { pc: Monitor, tablet: Tablet, celular: Smartphone, web: Globe };
const FAVORITOS: ModuleId[] = ["vps_terminal", "notas", "finanzas_personales", "musica", "vps_rendimiento", "ia", "sitios", "calendario", "recordatorios", "chat", "portapapeles", "equipos"];

function Anillo({ valor, titulo, detalle, color }: { valor: number | undefined; titulo: string; detalle: string; color: string }) {
  const v = valor === undefined ? 0 : Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 rounded-[18px] border border-borde bg-[color-mix(in_srgb,var(--superficie)_78%,transparent)] p-4 text-center backdrop-blur-md">
      <div className="grid h-[84px] w-[84px] place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${v}%, color-mix(in srgb, var(--texto) 8%, transparent) 0)` }}>
        <span className="grid h-[66px] w-[66px] place-items-center rounded-full bg-superficie text-[17px] font-bold">{valor === undefined ? "—" : `${v}%`}</span>
      </div>
      <b className="text-sm">{titulo}</b>
      <small className="w-full truncate text-xs text-tenue" title={detalle}>
        {detalle}
      </small>
    </div>
  );
}

function fecha(): string {
  const t = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Medidores() {
  const sistema = useQuery<InfoEquipo>({ queryKey: ["este-equipo", "sistema"], queryFn: leerSistema, staleTime: Infinity, retry: false });
  const m = useQuery<MetricasDispositivo>({ queryKey: ["este-equipo", "metricas"], queryFn: leerMetricas, refetchInterval: 2000, retry: false });
  const s = sistema.data;
  const met = m.data ?? {};
  const disco = met.discos?.reduce((t, d) => ({ usado: t.usado + d.usado, total: t.total + d.total }), { usado: 0, total: 0 });
  const ram = met.ram && met.ram.total ? (met.ram.usado / met.ram.total) * 100 : undefined;
  const pctDisco = disco?.total ? (disco.usado / disco.total) * 100 : undefined;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Anillo valor={met.cpu} titulo="Procesador" detalle={s?.procesador ?? "—"} color="var(--acento)" />
      <Anillo valor={met.gpu} titulo="Tarjeta de video" detalle={s?.graficos[0] ?? "—"} color="#7cb7ff" />
      <Anillo valor={ram} titulo="Memoria" detalle={met.ram?.total ? `${fmtBytes(met.ram.usado)} de ${fmtBytes(met.ram.total)}` : "—"} color="var(--ok)" />
      <Anillo valor={pctDisco} titulo="Disco" detalle={disco?.total ? `${fmtBytes(disco.total - disco.usado)} libres` : "—"} color="var(--aviso)" />
    </div>
  );
}

export default function Inicio() {
  const { data: me } = useMe();
  const verEquipos = usePuede("equipos");
  const [detalles, setDetalles] = useState(false);
  const [todos, setTodos] = useState(false);
  useTema(verEquipos ? temas.dispositivos : null, () => void queryClient.invalidateQueries({ queryKey: ["equipos"] }));
  const equipos = useQuery({ queryKey: ["equipos"], queryFn: () => api<Equipo[]>("/api/equipos"), enabled: verEquipos });

  const visibles = useMemo(
    () =>
      Object.entries(me?.permisos ?? {})
        .filter(([, nivel]) => nivel !== "ninguno")
        .map(([id]) => id as ModuleId)
        .filter((id) => MODULOS_UI[id]),
    [me?.permisos],
  );
  const favoritos = useMemo(() => {
    const elegidos = FAVORITOS.filter((id) => visibles.includes(id));
    const resto = visibles.filter((id) => !elegidos.includes(id));
    return [...elegidos, ...resto].slice(0, 8);
  }, [visibles]);
  const maestra = me?.usuario.role === "maestra";

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <header className="mb-4">
        <h1 className="font-titulo text-[26px] font-bold tracking-tight">Hola, {me?.usuario.displayName ?? ""}</h1>
        <p className="mt-0.5 text-sm text-tenue">Todo tu setup en un solo lugar · {fecha()}</p>
      </header>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Medidores />
          <div>
            <button type="button" onClick={() => setDetalles((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-acento">
              <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", detalles && "rotate-180")} />
              {detalles ? "Ocultar detalles de este equipo" : "Ver detalles de este equipo"}
            </button>
            {detalles ? (
              <div className="mt-3">
                <EsteEquipo />
              </div>
            ) : null}
          </div>
          <Widget titulo="Tus accesos" icono={LayoutGrid} accion={<button type="button" onClick={() => setTodos((v) => !v)}>{todos ? "Ver menos" : "Ver todos"}</button>}>
            {todos ? (
              <div className="space-y-4">
                {CATEGORIAS.map((c) => {
                  const mods = visibles.filter((id) => categoriaDe(id, maestra) === c.id).sort((a, b) => Number(MODULES[a].category !== c.id) - Number(MODULES[b].category !== c.id));
                  if (mods.length === 0) return null;
                  return (
                    <section key={c.id}>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-tenue">{c.titulo}</h3>
                      <Accesos ids={mods} />
                    </section>
                  );
                })}
              </div>
            ) : (
              <Accesos ids={favoritos} />
            )}
          </Widget>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          {verEquipos ? (
            <Widget titulo="Mis equipos" icono={MonitorSmartphone} accion={<Link to="/equipos">Ver</Link>}>
              {equipos.data?.length ? (
                <ul>
                  {equipos.data.slice(0, 5).map((e) => {
                    const Icono = ICONO_EQUIPO[e.tipo] ?? Monitor;
                    return (
                      <li key={e.id} className="border-b border-borde last:border-0">
                        <Link to={`/equipos?id=${e.id}`} className="flex items-center gap-3 py-2.5">
                          <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-tarjeta text-acento">
                            <Icono className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <b className="block truncate text-sm">{e.nombre}</b>
                            <small className="block truncate text-xs text-tenue">{e.conectado ? `Conectado${e.plataforma ? ` · ${e.plataforma}` : ""}` : haceCuanto(e.ultimaVez)}</small>
                          </span>
                          <Punto conectado={e.conectado} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Vacio icono={MonitorSmartphone} texto="Aún no hay equipos registrados." />
              )}
            </Widget>
          ) : null}
          <ResumenInicio />
        </div>
      </div>
    </div>
  );
}

function Accesos({ ids }: { ids: ModuleId[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
      {ids.map((id) => {
        const mod = MODULOS_UI[id];
        return (
          <Link key={id} to={mod.ruta} className="flex min-w-0 items-center gap-2 rounded-[11px] border border-borde bg-tarjeta px-3 py-2.5 text-sm font-medium hover:border-[color-mix(in_srgb,var(--texto)_20%,transparent)]">
            <mod.icono className="h-4 w-4 shrink-0 text-acento" />
            <span className="truncate">{MODULES[id].label}</span>
          </Link>
        );
      })}
    </div>
  );
}
