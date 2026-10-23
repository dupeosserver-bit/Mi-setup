import { useMutation, useQuery } from "@tanstack/react-query";
import { BrainCircuit, Box, ChevronRight, Cpu, Download, ExternalLink, FileText, Github, Hourglass, KeyRound, MemoryStick, Search, Send, ShieldCheck, Sparkles, Star, TerminalSquare, Trash2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Paginas, usePaginado } from "../components/Paginas";
import { AreaTexto, Boton, Cargando, Encabezado, ErrorCaja, Modal, Vacio, avisar, avisarError, cx } from "../components/ui";
import { PantallaCompleta } from "../components/vps/EditorCodigo";
import { PildorasServidor, SUAVE } from "../components/vps/piezas";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { TarjetaPropuesta, usePropuestas } from "../lib/ia";
import { localeActual } from "../lib/idioma";
import { abrirExterno } from "../lib/plataforma";
import { useServidores } from "../lib/vps";

interface Agente {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: "docker" | "npm" | "pipx" | "ollama";
  ramMb: number;
  uso: string;
  web: string;
  puerto: number | null;
}
interface Repo {
  nombre: string;
  url: string;
  descripcion: string;
  estrellas: number;
  lenguaje: string | null;
  licencia: string | null;
  actualizado: string;
  temas: string[];
}

type Filtro = "todos" | "instalados" | "docker" | "terminal" | "local";

const TIPO = { docker: "Docker", npm: "Terminal (npm)", pipx: "Terminal (Python)", ollama: "Modelo local" } as const;
const ESTILO: Record<Agente["tipo"], { icono: LucideIcon; tono: string }> = {
  docker: { icono: Box, tono: "bg-[color-mix(in_srgb,#4c8dff_14%,transparent)] text-sky-300" },
  npm: { icono: TerminalSquare, tono: SUAVE.aviso },
  pipx: { icono: TerminalSquare, tono: SUAVE.ok },
  ollama: { icono: BrainCircuit, tono: SUAVE.acento },
};
const FILTROS: [Filtro, string][] = [
  ["todos", "Todos"],
  ["instalados", "Instalados"],
  ["docker", "Docker"],
  ["terminal", "Terminal"],
  ["local", "Modelos locales"],
];

const ram = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

function preguntarIa(navegar: ReturnType<typeof useNavigate>, texto: string) {
  try {
    sessionStorage.setItem("mi-setup.pregunta", texto);
  } catch {
    avisar("No se pudo pasar el texto a la IA; pégalo tú en el chat.", "info");
  }
  navegar("/ia?pregunta=@sesion");
}

function Memoria({ servidor }: { servidor: string }) {
  const estado = useQuery({ queryKey: ["agentes", "estado", servidor], queryFn: () => api<{ instalados: string[]; ram: { totalMb: number; libreMb: number } }>(`/api/vps/servidores/${servidor}/agentes`) });
  const r = estado.data?.ram;
  const usado = r ? Math.min(100, ((r.totalMb - r.libreMb) / Math.max(1, r.totalMb)) * 100) : 0;
  return (
    <section className="flex min-w-0 flex-col justify-center rounded-tarjeta border border-borde bg-superficie p-4">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 text-tenue">
          <MemoryStick className="h-4 w-4" />
          Memoria del servidor
        </span>
        <b className="tabular-nums">{r ? `${ram(r.libreMb)} libres de ${ram(r.totalMb)}` : "—"}</b>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-tarjeta">
        <div className={cx("h-full rounded-full", usado > 85 ? "bg-peligro" : usado > 70 ? "bg-aviso" : "bg-acento")} style={{ width: `${usado}%` }} />
      </div>
    </section>
  );
}

function Pendientes() {
  const propuestas = usePropuestas();
  const pendientes = (propuestas.data ?? []).filter((p) => p.estado === "pendiente");
  if (!pendientes.length) {
    return (
      <section className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-4">
        <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", SUAVE.ok)}>
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Nada esperando tu «Aprobar»</p>
          <p className="text-xs text-tenue">Los agentes solo proponen; nada se ejecuta sin ti.</p>
        </div>
      </section>
    );
  }
  return (
    <Link
      to="/ia"
      className="flex items-center gap-3 rounded-tarjeta border border-[color-mix(in_srgb,var(--aviso)_45%,transparent)] bg-[color-mix(in_srgb,var(--aviso)_8%,var(--superficie))] p-4"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-aviso text-lg font-bold text-fondo">{pendientes.length}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{pendientes.length === 1 ? "Propuesta esperando tu «Aprobar»" : "Propuestas esperando tu «Aprobar»"}</p>
        <p className="text-xs text-tenue">Nada se ejecuta sin ti</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-tenue" />
    </Link>
  );
}

function ListaPropuestas() {
  const propuestas = usePropuestas();
  const pendientes = (propuestas.data ?? []).filter((p) => p.estado === "pendiente").slice(0, 3);
  if (!pendientes.length) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {pendientes.map((p) => (
        <div key={p.id} className="flex items-start gap-3 rounded-tarjeta border border-borde bg-superficie p-3">
          <Hourglass className="mt-3 h-4 w-4 shrink-0 text-aviso" />
          <div className="min-w-0 flex-1">
            <TarjetaPropuesta p={p} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Catalogo({ servidor }: { servidor: string }) {
  const puede = usePuede("vps_agentes", "administrar");
  const servidores = useServidores();
  const nombre = servidores.data?.find((s) => s.id === servidor)?.nombre ?? "";
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const catalogo = useQuery({ queryKey: ["agentes", "catalogo"], queryFn: () => api<Agente[]>("/api/vps/agentes/catalogo") });
  const estado = useQuery({ queryKey: ["agentes", "estado", servidor], queryFn: () => api<{ instalados: string[]; ram: { totalMb: number; libreMb: number } }>(`/api/vps/servidores/${servidor}/agentes`) });
  const [salida, setSalida] = useState<{ titulo: string; texto: string; uso?: string } | null>(null);
  const accion = useMutation({
    mutationFn: (d: { agente: Agente; accion: "instalar" | "quitar" }) =>
      api<{ ok: boolean; salida: string; uso: string }>(`/api/vps/servidores/${servidor}/agentes/${d.agente.id}`, { cuerpo: { accion: d.accion, confirmacion: nombre } }),
    onSuccess: (r, d) => {
      setSalida({ titulo: r.ok ? `${d.agente.nombre}: listo` : `${d.agente.nombre}: hubo un problema`, texto: r.salida, ...(r.ok && d.accion === "instalar" ? { uso: r.uso } : {}) });
      void queryClient.invalidateQueries({ queryKey: ["agentes", "estado", servidor] });
    },
    onError: avisarError,
  });
  const pedir = async (a: Agente, que: "instalar" | "quitar") => {
    const r = estado.data?.ram;
    const poca = que === "instalar" && r && r.libreMb < a.ramMb ? ` Ojo: pide unos ${a.ramMb} MB de memoria y tienes ${r.libreMb} MB libres.` : "";
    const ok = await confirmar({
      titulo: `${que === "instalar" ? "Instalar" : "Quitar"} ${a.nombre}`,
      mensaje: `${que === "instalar" ? "Se instala en tu servidor." : "Se quita del servidor (los datos de sus volúmenes se quedan)."}${poca} Después se pedirá tu contraseña o huella.`,
      peligroso: true,
      textoExacto: nombre,
      boton: que === "instalar" ? "Instalar" : "Quitar",
    });
    if (ok) accion.mutate({ agente: a, accion: que });
  };
  const instalados = estado.data?.instalados ?? [];
  const lista = (catalogo.data ?? []).filter((a) =>
    filtro === "todos" ? true : filtro === "instalados" ? instalados.includes(a.id) : filtro === "docker" ? a.tipo === "docker" : filtro === "terminal" ? a.tipo === "npm" || a.tipo === "pipx" : a.tipo === "ollama",
  );
  const pg = usePaginado(lista, 8);
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Box className="h-4 w-4 text-tenue" />
          Catálogo
        </h2>
        <div className="flex max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {FILTROS.map(([id, t]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={cx("h-8 shrink-0 rounded-full border px-3 text-xs font-medium", filtro === id ? "border-acento text-acento " + SUAVE.acento : "border-borde text-tenue hover:text-texto")}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <ErrorCaja error={catalogo.error ?? estado.error} />
      {accion.isPending ? <Cargando texto="Instalando en el servidor (puede tardar unos minutos)…" /> : null}
      {catalogo.data && !lista.length ? <Vacio icono={Box} texto="Nada en este filtro." /> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {pg.visibles.map((a) => {
          const instalado = instalados.includes(a.id);
          const { icono: Icono, tono } = ESTILO[a.tipo];
          return (
            <article key={a.id} className="flex min-w-0 gap-3 rounded-tarjeta border border-borde bg-superficie p-4">
              <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tono)}>
                <Icono className="h-5 w-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{a.nombre}</h3>
                  {instalado ? <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", SUAVE.ok)}>Instalado</span> : <span className="rounded-full bg-tarjeta px-2 py-0.5 text-[11px] text-tenue">{TIPO[a.tipo]}</span>}
                </div>
                <p className="mt-1 text-sm text-tenue">{a.descripcion}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-tenue">
                  <Cpu className="h-3 w-3" /> {ram(a.ramMb)}
                  {a.puerto ? ` · panel en 127.0.0.1:${a.puerto}` : ""}
                </p>
                {instalado ? <p className="mt-1 text-xs text-ok">{a.uso}</p> : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  {puede ? (
                    instalado ? (
                      <Boton tamano="sm" icono={Trash2} disabled={accion.isPending} onClick={() => void pedir(a, "quitar")}>
                        Quitar
                      </Boton>
                    ) : (
                      <Boton tamano="sm" variante="primario" icono={Download} disabled={accion.isPending} onClick={() => void pedir(a, "instalar")}>
                        Instalar
                      </Boton>
                    )
                  ) : null}
                  <Boton tamano="sm" variante="fantasma" icono={ExternalLink} onClick={() => abrirExterno(a.web)}>
                    Ver
                  </Boton>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {pg.paginas}
      <Modal abierto={salida !== null} titulo={salida?.titulo ?? ""} alCerrar={() => setSalida(null)}>
        {salida?.uso ? <p className="mb-2 rounded-xl bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] p-2 text-sm">{salida.uso}</p> : null}
        <pre className="max-h-80 overflow-auto rounded-xl bg-fondo p-3 font-mono text-xs">{salida?.texto || "(sin salida)"}</pre>
      </Modal>
    </section>
  );
}

function BuscarGithub({ alInstalar }: { alInstalar: (r: Repo) => void }) {
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState({ q: "", pagina: 1 });
  const q = useQuery({
    queryKey: ["agentes", "github", busqueda],
    queryFn: () => api<{ total: number; pagina: number; resultados: Repo[] }>(`/api/vps/agentes/buscar?q=${encodeURIComponent(busqueda.q)}&pagina=${busqueda.pagina}`),
    retry: false,
  });
  const paginas = Math.max(1, Math.ceil((q.data?.total ?? 0) / 12));
  return (
    <section className="rounded-tarjeta border border-borde bg-superficie p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
        <Github className="h-4 w-4 text-tenue" />
        Buscar más agentes en GitHub
      </h2>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBusqueda({ q: texto.trim(), pagina: 1 });
        }}
      >
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-borde bg-fondo px-3 text-sm">
          <Search className="h-4 w-4 shrink-0 text-tenue" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. coding, browser, voice, discord…" maxLength={80} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tenue" />
        </label>
        <Boton type="submit" variante="primario">
          Buscar
        </Boton>
      </form>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data && !q.data.resultados.length ? <Vacio icono={Search} texto="Nada con eso; prueba otra palabra (en inglés suele haber más)." /> : null}
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {q.data?.resultados.map((r) => (
          <article key={r.nombre} className="flex min-w-0 flex-col rounded-xl border border-borde bg-fondo p-3">
            <div className="flex items-center gap-2">
              <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline" onClick={() => abrirExterno(r.url)}>
                {r.nombre}
              </button>
              <span className="flex shrink-0 items-center gap-1 text-xs text-aviso">
                <Star className="h-3 w-3" /> {r.estrellas.toLocaleString(localeActual())}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-tenue">{r.descripcion}</p>
            <p className="mt-1 text-[11px] text-tenue">{[r.lenguaje, r.licencia, `actualizado ${haceCuanto(r.actualizado)}`].filter(Boolean).join(" · ")}</p>
            <Boton className="mt-auto self-start" tamano="sm" icono={Sparkles} onClick={() => alInstalar(r)}>
              Instalar con ayuda de la IA
            </Boton>
          </article>
        ))}
      </div>
      {q.data && paginas > 1 ? <Paginas pagina={busqueda.pagina} total={paginas} alCambiar={(n) => setBusqueda({ ...busqueda, pagina: n })} /> : null}
      <p className="mt-2 text-xs text-tenue">Lo de GitHub lo hizo otra gente: la IA revisa el proyecto y propone los comandos, y nada corre hasta que tú lo apruebes.</p>
    </section>
  );
}

function NuevoAgente({ repo, servidor, alCerrar }: { repo: Repo | null; servidor: string; alCerrar: () => void }) {
  const navegar = useNavigate();
  const nombreServidor = useServidores().data?.find((s) => s.id === servidor)?.nombre ?? "tu servidor";
  const [instrucciones, setInstrucciones] = useState(
    repo ? `Quiero instalar ${repo.nombre} para que me ayude con…\n\nQué puede hacer:\n- \n\nQué NO puede hacer:\n- Entrar a bancos, correos ni redes sociales.\n- Abrir puertos a internet.\n` : "",
  );
  const mandar = () => {
    const base = repo
      ? `Quiero instalar el agente ${repo.nombre} (${repo.url}) en mi servidor «${nombreServidor}». Revisa su README, dime qué hace, cuánta memoria pide y si es seguro, y propón los comandos (de preferencia con Docker, escuchando solo en 127.0.0.1) para que yo los apruebe.`
      : `Quiero un agente en mi servidor «${nombreServidor}». Propón cómo instalarlo y los comandos (de preferencia con Docker, escuchando solo en 127.0.0.1) para que yo los apruebe.`;
    preguntarIa(navegar, `${base}\n\nEstas son mis instrucciones para el agente:\n${instrucciones.trim()}`);
  };
  return (
    <PantallaCompleta
      titulo={repo ? `Instalar ${repo.nombre}` : "Agente a tu medida"}
      subtitulo={`IA › Agentes de IA · se instala en «${nombreServidor}»`}
      alCerrar={alCerrar}
      acciones={repo ? <Boton tamano="sm" variante="fantasma" icono={ExternalLink} onClick={() => abrirExterno(repo.url)}>Ver en GitHub</Boton> : null}
    >
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-h-0 flex-col p-3 sm:p-5">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-tenue" />
            Instrucciones para el agente
          </p>
          <AreaTexto
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            placeholder="Escribe con tus palabras qué quieres que haga, qué no puede hacer y cómo te debe avisar."
            className="min-h-[14rem] flex-1 resize-none text-base leading-relaxed"
          />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-tenue">
            <KeyRound className="h-3.5 w-3.5" />
            Las claves que necesite se toman de Ajustes → Servicios y claves; aquí nunca se muestran.
          </p>
        </div>
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-borde bg-superficie p-4 lg:border-l lg:border-t-0">
          <p className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-acento" />
            Cómo sigue
          </p>
          <ol className="space-y-3 text-sm">
            {[
              ["Mandas tus instrucciones", "La IA lee el proyecto y lo que escribiste."],
              ["La IA propone los pasos", "Con sus comandos, la memoria que pide y si es seguro."],
              ["Tú decides", "Nada se ejecuta hasta que tocas «Aprobar» en la IA asistente."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold", SUAVE.acento)}>{i + 1}</span>
                <span>
                  <b className="block">{t}</b>
                  <span className="text-xs text-tenue">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="space-y-1.5 rounded-xl bg-fondo p-3 text-xs">
            <p className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-ok" /> Se pide que solo escuche dentro del servidor</p>
            <p className="flex items-center gap-2"><MemoryStick className="h-3.5 w-3.5 text-ok" /> Se revisa la memoria antes de instalar</p>
            {repo ? <p className="flex items-center gap-2"><Github className="h-3.5 w-3.5 text-aviso" /> Lo hizo otra gente: revísalo antes de aprobar</p> : null}
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <Boton variante="primario" icono={Send} disabled={!instrucciones.trim()} onClick={mandar}>
              Mandar a la IA
            </Boton>
            <Boton variante="fantasma" onClick={alCerrar}>
              Cancelar
            </Boton>
          </div>
        </aside>
      </div>
    </PantallaCompleta>
  );
}

export default function VpsAgentes() {
  const [servidor, setServidor] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<{ repo: Repo | null } | null>(null);
  if (nuevo && servidor) return <NuevoAgente repo={nuevo.repo} servidor={servidor} alCerrar={() => setNuevo(null)} />;
  return (
    <div className="space-y-4">
      <p className="-mb-3 flex items-center gap-1.5 text-xs font-semibold text-acento">
        <Sparkles className="h-3.5 w-3.5" />
        IA <ChevronRight className="h-3 w-3 text-tenue" /> Agentes de IA
      </p>
      <Encabezado
        titulo="Agentes de IA"
        descripcion="Asistentes y modelos que corren en tu servidor. Solo proponen: tú apruebas."
        acciones={
          <>
            <PildorasServidor valor={servidor} alCambiar={setServidor} />
            <Boton variante="primario" icono={Sparkles} disabled={!servidor} onClick={() => setNuevo({ repo: null })}>
              Agente a tu medida
            </Boton>
          </>
        }
      />
      {servidor ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Memoria servidor={servidor} />
          <Pendientes />
        </div>
      ) : null}
      <ListaPropuestas />
      {servidor ? <Catalogo servidor={servidor} /> : <Vacio icono={BrainCircuit} texto="Elige o agrega tu servidor en VPS → Terminal." />}
      <BuscarGithub alInstalar={(r) => (servidor ? setNuevo({ repo: r }) : avisar("Primero agrega un servidor en Terminal.", "info"))} />
      <p className="text-xs text-tenue">
        Consejo: antes de instalar varios, revisa la memoria. Si el servidor se queda sin memoria, activa «Protección de memoria» y «Memoria de respaldo» en Seguridad del servidor.{" "}
        <button type="button" className="underline" onClick={() => avisar("Los paneles quedan solo dentro del servidor: ábrelos con un túnel SSH o pon un subdominio en Sitios.")}>
          ¿Cómo abro los paneles?
        </button>
      </p>
    </div>
  );
}
