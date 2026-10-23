import { MODULES, MODULE_IDS } from "@mi-setup/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowLeft, Bot, Download, List, Lock, Maximize2, Search, Server, User } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Paginas } from "../components/Paginas";
import { Boton, Cargando, Entrada, ErrorCaja, Selector, Vacio, avisarError, cx } from "../components/ui";
import { api, descargar } from "../lib/api";
import { fmtFechaHora } from "../lib/formato";
import { localeActual } from "../lib/idioma";
import { useModoPagina } from "../lib/marco";

interface Fila {
  id: number;
  fecha: string;
  actor: "usuario" | "ia" | "sistema";
  usuario: string | null;
  accion: string;
  modulo: string | null;
  objetivo: string | null;
  resultado: "ok" | "denegado" | "error";
  ip: string | null;
  detalles: Record<string, unknown>;
}

interface Resumen {
  semana: number;
  iaAprobadas: number;
  denegadas: number;
  errores: number;
  porHora: number[];
  top: { accion: string; veces: number }[];
}

interface Filtros {
  modulo: string;
  accion: string;
  actor: string;
  resultado: string;
  q: string;
}

const VACIO: Filtros = { modulo: "", accion: "", actor: "", resultado: "", q: "" };
const ICONO = { usuario: User, ia: Bot, sistema: Server } as const;
const COLOR = { ok: "var(--ok)", denegado: "var(--aviso)", error: "var(--error)" } as const;
const TEXTO_RESULTADO = { ok: "Correcto", denegado: "Denegado", error: "Error" } as const;
const POR_PAGINA = 25;

const suave = (color: string, pct = 14) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const nombreModulo = (m: string | null) => (m ? (MODULES[m as keyof typeof MODULES]?.label ?? m) : "");
const quien = (r: Fila) => (r.actor === "ia" ? "IA" : r.actor === "sistema" ? "Sistema" : (r.usuario ?? "—"));

function useRegistro(f: Filtros) {
  const params = useMemo(() => new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]), [f]);
  const clave = params.toString();
  const filas = useInfiniteQuery({
    queryKey: ["auditoria", "filas", clave],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(params);
      p.set("limite", String(POR_PAGINA));
      if (pageParam) p.set("antesDe", String(pageParam));
      return api<Fila[]>(`/api/auditoria?${p}`);
    },
    getNextPageParam: (ultima) => (ultima.length === POR_PAGINA ? ultima.at(-1)?.id : undefined),
  });
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [clave]);
  const cargadas = filas.data?.pages.length ?? 0;
  const irA = (p: number) => {
    if (p > cargadas && filas.hasNextPage) void filas.fetchNextPage();
    setPagina(p);
  };
  return {
    filas,
    params,
    lista: filas.data?.pages[pagina - 1] ?? [],
    paginas: <Paginas pagina={pagina} total={cargadas + (filas.hasNextPage ? 1 : 0)} alCambiar={irA} />,
    pagina,
  };
}

function FiltrosRegistro({ f, alCambiar }: { f: Filtros; alCambiar: (f: Filtros) => void }) {
  const acciones = useQuery({ queryKey: ["auditoria", "acciones"], queryFn: () => api<string[]>("/api/auditoria/acciones") });
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <Selector value={f.modulo} onChange={(e) => alCambiar({ ...f, modulo: e.target.value })}>
        <option value="">Todos los módulos</option>
        {MODULE_IDS.map((m) => (
          <option key={m} value={m}>
            {MODULES[m].label}
          </option>
        ))}
      </Selector>
      <Selector value={f.accion} onChange={(e) => alCambiar({ ...f, accion: e.target.value })}>
        <option value="">Todas las acciones</option>
        {acciones.data?.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </Selector>
      <Selector value={f.actor} onChange={(e) => alCambiar({ ...f, actor: e.target.value })}>
        <option value="">Usuarios, IA y sistema</option>
        <option value="usuario">Usuarios</option>
        <option value="ia">IA</option>
        <option value="sistema">Sistema</option>
      </Selector>
      <Selector value={f.resultado} onChange={(e) => alCambiar({ ...f, resultado: e.target.value })}>
        <option value="">Cualquier resultado</option>
        <option value="ok">Correcto</option>
        <option value="denegado">Denegado</option>
        <option value="error">Error</option>
      </Selector>
    </div>
  );
}

function Etiqueta({ resultado }: { resultado: Fila["resultado"] }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: suave(COLOR[resultado]), color: COLOR[resultado] }}>
      {TEXTO_RESULTADO[resultado]}
    </span>
  );
}

function Caja({ titulo, icono: Icono, acciones, children, className }: { titulo: string; icono: typeof Activity; acciones?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("min-w-0 rounded-tarjeta border border-borde bg-superficie p-4", className)}>
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icono className="h-4 w-4 text-tenue" />
          {titulo}
        </h3>
        {acciones ? <div className="ml-auto flex flex-wrap gap-1.5">{acciones}</div> : null}
      </header>
      {children}
    </section>
  );
}

function PorHora({ horas }: { horas: number[] }) {
  const max = Math.max(1, ...horas);
  return (
    <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Actividad de hoy por hora">
      {horas.map((v, h) => (
        <div key={h} className="relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${h}:00 · ${v}`}>
          <div className="w-full rounded-t-[4px] bg-acento" style={{ height: `${v ? Math.max(4, (v / max) * 100) : 0}%`, opacity: v ? 1 : 0 }} />
          {h % 6 === 0 ? <span className="absolute -bottom-5 left-0 whitespace-nowrap text-[10px] text-tenue">{h}:00</span> : null}
        </div>
      ))}
    </div>
  );
}

function FilaVistazo({ r, abierta, alTocar }: { r: Fila; abierta: boolean; alTocar: () => void }) {
  const Icono = ICONO[r.actor];
  return (
    <button type="button" onClick={alTocar} className="block w-full rounded-xl px-2 py-2.5 text-left hover:bg-tarjeta">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: suave(r.actor === "ia" ? "var(--acento)" : "var(--texto-2)", 16) }}>
          <Icono className={cx("h-4 w-4", r.actor === "ia" ? "text-acento" : "text-tenue")} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{r.accion}</span>
          <span className="block truncate text-xs text-tenue">
            {[quien(r), nombreModulo(r.modulo), r.objetivo, r.ip].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Etiqueta resultado={r.resultado} />
        <span className="hidden shrink-0 text-xs text-tenue sm:block">{fmtFechaHora(r.fecha)}</span>
      </div>
      {abierta && Object.keys(r.detalles).length ? <pre className="mt-2 overflow-x-auto rounded-lg bg-fondo p-2 text-xs text-tenue">{JSON.stringify(r.detalles, null, 2)}</pre> : null}
    </button>
  );
}

const VISTAZOS = [
  { id: "denegado", texto: "Denegado", f: { resultado: "denegado" } },
  { id: "error", texto: "Errores", f: { resultado: "error" } },
  { id: "ia", texto: "La IA", f: { actor: "ia" } },
  { id: "todo", texto: "Todo", f: {} },
] as const;

function Resumen({ alAbrir }: { alAbrir: () => void }) {
  const desde = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const resumen = useQuery({
    queryKey: ["auditoria", "resumen", desde],
    queryFn: () => api<Resumen>(`/api/auditoria/resumen?desde=${encodeURIComponent(desde)}&zona=${new Date().getTimezoneOffset()}`),
  });
  const [vistazo, setVistazo] = useState<(typeof VISTAZOS)[number]["id"]>("denegado");
  const elegido = VISTAZOS.find((v) => v.id === vistazo)!;
  const reg = useRegistro({ ...VACIO, ...elegido.f });
  const [abierta, setAbierta] = useState<number | null>(null);
  const d = resumen.data;
  const n = (v: number | undefined) => (v ?? 0).toLocaleString(localeActual());
  const maxTop = Math.max(1, ...(d?.top.map((t) => t.veces) ?? []));
  const numeros = [
    { v: d?.semana, t: "cosas esta semana", c: "var(--texto)" },
    { v: d?.iaAprobadas, t: "aprobaciones de la IA", c: "var(--ok)" },
    { v: d?.denegadas, t: "denegadas", c: "var(--aviso)" },
    { v: d?.errores, t: "errores", c: "var(--error)" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">Registro de actividad</h1>
          <p className="text-sm text-tenue">Nadie puede editarlo ni borrarlo. Incluye cada propuesta, aprobación y resultado de la IA.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Exportar params={new URLSearchParams()} />
          <Boton variante="primario" icono={Maximize2} onClick={alAbrir}>
            Abrir registro completo
          </Boton>
        </div>
      </header>
      <ErrorCaja error={resumen.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {numeros.map((x) => (
          <div key={x.t} className="rounded-tarjeta border border-borde bg-superficie p-4">
            <b className="block text-2xl font-semibold tabular-nums" style={{ color: x.c }}>
              {resumen.isLoading ? "…" : n(x.v)}
            </b>
            <small className="text-xs text-tenue">{x.t}</small>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Caja titulo="Hoy, por hora" icono={Activity}>
          <div className="pb-5">{d ? <PorHora horas={d.porHora} /> : <Cargando />}</div>
        </Caja>
        <Caja titulo="Lo que más pasa" icono={List}>
          {d && !d.top.length ? <p className="text-sm text-tenue">Todavía no hay actividad esta semana.</p> : null}
          <div className="space-y-2.5">
            {d?.top.map((t) => (
              <div key={t.accion} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                <span className="truncate">{t.accion}</span>
                <span className="h-2 overflow-hidden rounded-full bg-tarjeta">
                  <i className="block h-full rounded-full bg-acento" style={{ width: `${(t.veces / maxTop) * 100}%` }} />
                </span>
                <b className="w-12 text-right tabular-nums text-tenue">{n(t.veces)}</b>
              </div>
            ))}
          </div>
        </Caja>
      </div>
      <Caja
        titulo="Lo que merece un vistazo"
        icono={AlertTriangle}
        acciones={VISTAZOS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVistazo(v.id)}
            className={cx("h-8 rounded-full border px-3 text-xs font-medium", vistazo === v.id ? "border-acento text-texto" : "border-borde text-tenue hover:text-texto")}
            style={vistazo === v.id ? { background: suave("var(--acento)", 16) } : undefined}
          >
            {v.texto}
          </button>
        ))}
      >
        {reg.filas.isLoading ? <Cargando /> : null}
        <ErrorCaja error={reg.filas.error} />
        {!reg.filas.isLoading && reg.pagina === 1 && reg.lista.length === 0 ? <Vacio texto="Nada por aquí. Todo en orden." /> : null}
        <div className="divide-y divide-borde">
          {reg.lista.map((r) => (
            <FilaVistazo key={r.id} r={r} abierta={abierta === r.id} alTocar={() => setAbierta(abierta === r.id ? null : r.id)} />
          ))}
        </div>
        {reg.paginas}
      </Caja>
    </div>
  );
}

function RegistroCompleto({ alCerrar }: { alCerrar: () => void }) {
  useModoPagina("completa");
  const [f, setF] = useState<Filtros>(VACIO);
  const [texto, setTexto] = useState("");
  const [verDatos, setVerDatos] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setF((x) => (x.q === texto.trim() ? x : { ...x, q: texto.trim() })), 350);
    return () => clearTimeout(t);
  }, [texto]);
  const reg = useRegistro(f);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-fondo">
      <header className="flex flex-wrap items-center gap-2 border-b border-borde bg-superficie px-3 py-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Volver" onClick={alCerrar} />
        <b className="text-sm">Registro completo</b>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-tenue" style={{ background: suave("var(--texto-2)", 14) }}>
          <Lock className="h-3 w-3" />
          Solo lectura
        </span>
        <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-tenue" />
          <Entrada className="pl-9" placeholder="Buscar acción o sobre qué" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="ml-auto sm:ml-0">
          <Exportar params={reg.params} />
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-borde bg-superficie px-3 py-2">
        <div className="min-w-0 flex-1">
          <FiltrosRegistro f={f} alCambiar={setF} />
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-tenue">
          <input type="checkbox" checked={verDatos} onChange={(e) => setVerDatos(e.target.checked)} />
          Ver datos
        </label>
      </div>
      <main className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-6">
        {reg.filas.isLoading ? <Cargando /> : null}
        <ErrorCaja error={reg.filas.error} />
        {!reg.filas.isLoading && reg.lista.length === 0 ? <p className="py-6 text-center font-sans text-sm text-tenue">No hay actividad con esos filtros.</p> : null}
        {reg.lista.map((r) => (
          <div key={r.id} className="border-b border-borde/40 py-1">
            <div className="flex min-w-0 flex-wrap gap-x-3">
              <span className="text-tenue">{r.id}</span>
              <span className="text-tenue">{fmtFechaHora(r.fecha)}</span>
              <span className={r.actor === "ia" ? "text-acento" : "text-tenue"}>{quien(r)}</span>
              <span style={{ color: COLOR[r.resultado] }}>{TEXTO_RESULTADO[r.resultado]}</span>
              <span className="min-w-0 break-all text-texto">
                {[nombreModulo(r.modulo), r.accion, r.objetivo].filter(Boolean).join(" · ")}
                {r.ip ? <span className="text-tenue"> · {r.ip}</span> : null}
              </span>
            </div>
            {verDatos && Object.keys(r.detalles).length ? <pre className="ml-4 overflow-x-auto whitespace-pre-wrap break-all text-tenue">{JSON.stringify(r.detalles)}</pre> : null}
          </div>
        ))}
      </main>
      <footer className="border-t border-borde bg-superficie px-3 py-1">{reg.paginas}</footer>
    </div>
  );
}

function Exportar({ params }: { params: URLSearchParams }) {
  return (
    <Boton icono={Download} onClick={() => descargar(`/api/auditoria/exportar?${params}`, "actividad.csv").catch(avisarError)}>
      Exportar CSV
    </Boton>
  );
}

export default function Auditoria() {
  const [params, setParams] = useSearchParams();
  const completa = params.get("vista") === "completa";
  const poner = (v: boolean) => {
    const p = new URLSearchParams(params);
    if (v) p.set("vista", "completa");
    else p.delete("vista");
    setParams(p);
  };
  return completa ? <RegistroCompleto alCerrar={() => poner(false)} /> : <Resumen alAbrir={() => poner(true)} />;
}
