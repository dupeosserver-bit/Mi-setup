import "../lib/monaco";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CircleDashed, Clock3, Flame, GraduationCap, Lightbulb, ListChecks, Play, PlayCircle, RotateCcw, Sparkles, XCircle } from "lucide-react";
import type { editor } from "monaco-editor";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FilaSimbolos } from "../components/FilaSimbolos";
import { MarcoVista } from "../components/MarcoVista";
import { usePaginado } from "../components/Paginas";
import { Boton, Cargando, Encabezado, ErrorCaja, Pestanas, Selector, Tarjeta, cx } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { calificarJava, documentoEjercicio, paginaEjercicio, programaJava, type Corrida } from "../lib/corredor";
import { EJERCICIOS, LENGUAJES, NIVELES, esPagina, retoDelDia, videosDe, type Ejercicio, type Lenguaje, type Nivel } from "../lib/ejercicios";
import { useForma, useModoPagina, useTactil } from "../lib/marco";
import { escritorio } from "../lib/plataforma";

interface Progreso {
  resueltos: Record<string, string>;
  codigos: Record<string, string>;
}

const COLOR_LENGUAJE: Record<Lenguaje, string> = { javascript: "#f5c451", python: "#7cb7ff", html: "#ff8a5b", css: "#b497ff", java: "#ff6b81" };
const MONACO: Record<Lenguaje, string> = { javascript: "javascript", python: "python", html: "html", css: "css", java: "java" };

function Texto({ t }: { t: string }) {
  return (
    <>
      {t.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((parte, i) =>
        parte.startsWith("`") ? (
          <code key={i} className="rounded bg-fondo px-1 font-mono text-[0.9em]">
            {parte.slice(1, -1)}
          </code>
        ) : parte.startsWith("**") ? (
          <strong key={i}>{parte.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </>
  );
}

const mostrar = (v: unknown) => JSON.stringify(v) ?? String(v);

function Etiqueta({ lenguaje }: { lenguaje: Lenguaje }) {
  const c = COLOR_LENGUAJE[lenguaje];
  return (
    <span className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold" style={{ color: c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
      {LENGUAJES[lenguaje]}
    </span>
  );
}

function useArena() {
  const marco = useRef<HTMLIFrameElement>(null);
  const listo = useRef(false);
  const [clave, setClave] = useState(0);
  const espera = useRef<{ id: string; resolver: (c: Corrida) => void } | null>(null);
  const pendiente = useRef<string | null>(null);

  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      if (e.data === "vista-previa-lista" && e.source === marco.current?.contentWindow) {
        listo.current = true;
        if (pendiente.current) marco.current?.contentWindow?.postMessage(pendiente.current, "*");
        pendiente.current = null;
        return;
      }
      const d = e.data as { tipo?: string; id?: string } & Partial<Corrida>;
      if (d?.tipo !== "mi-setup-ejercicio" || !espera.current || d.id !== espera.current.id) return;
      espera.current.resolver({ resultados: d.resultados ?? [], salida: d.salida ?? [], ...(d.error ? { error: d.error } : {}) });
      espera.current = null;
    };
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, []);

  const correr = (doc: string, id: string, limiteMs: number) =>
    new Promise<Corrida>((resolve) => {
      const t = setTimeout(() => {
        if (espera.current?.id !== id) return;
        espera.current = null;
        listo.current = false;
        setClave((k) => k + 1);
        resolve({ resultados: [], salida: [], error: `Tardó más de ${Math.round(limiteMs / 1000)} s. ¿Tienes un ciclo que nunca termina?` });
      }, limiteMs);
      espera.current = {
        id,
        resolver: (c) => {
          clearTimeout(t);
          resolve(c);
        },
      };
      if (listo.current) marco.current?.contentWindow?.postMessage(doc, "*");
      else pendiente.current = doc;
    });

  const elemento = <iframe key={clave} ref={marco} title="Pruebas" sandbox="allow-scripts allow-modals" src={`${API_BASE}/vista-previa`} className="pointer-events-none absolute h-0 w-0 opacity-0" />;
  return { correr, elemento };
}

function Videos({ e }: { e: Ejercicio }) {
  return (
    <div className="space-y-1.5">
      {videosDe(e).map((v) => (
        <a key={v.url} href={v.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-fondo p-2 text-xs hover:text-acento">
          <PlayCircle className="h-4 w-4 shrink-0 text-peligro" />
          <span className="min-w-0 flex-1 truncate">{v.texto}</span>
          <span className="shrink-0 text-tenue">YouTube</span>
        </a>
      ))}
    </div>
  );
}

function Resultados({ e, corrida, corriendo }: { e: Ejercicio; corrida: Corrida | null; corriendo: boolean }) {
  if (corriendo) return <Cargando texto={e.lenguaje === "python" ? "La primera vez baja Python (unos segundos)…" : e.lenguaje === "java" ? "Compilando y probando con Java…" : "Probando…"} />;
  if (!corrida) {
    const lista = e.pruebas?.map((p) => p.texto) ?? e.casosJava?.map((c) => c.llamada) ?? e.casos?.map((c) => `${e.funcion}(${c.args.map((a) => JSON.stringify(a)).join(", ")})`) ?? [];
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-tenue">Lo que se revisa al tocar Probar:</p>
        {lista.map((t) => (
          <p key={t} className="flex items-center gap-2 rounded-lg bg-fondo p-2 font-mono text-xs">
            <CircleDashed className="h-3.5 w-3.5 shrink-0 text-tenue" />
            <span className="min-w-0 break-all">{t}</span>
          </p>
        ))}
      </div>
    );
  }
  const todos = !corrida.error && corrida.resultados.length > 0 && corrida.resultados.every((r) => r.ok);
  return (
    <div className="space-y-2">
      <p className={cx("flex items-center gap-2 text-sm font-semibold", todos ? "text-ok" : "text-peligro")}>
        {todos ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {todos ? "¡Todo bien! Ejercicio resuelto" : `${corrida.resultados.filter((r) => r.ok).length} de ${corrida.resultados.length} pruebas bien`}
      </p>
      {corrida.error ? <ErrorCaja error={new Error(corrida.error)} /> : null}
      <ul className="space-y-1">
        {corrida.resultados.map((r, i) => (
          <li key={i} className="rounded-lg p-2 text-xs" style={{ background: `color-mix(in srgb, var(${r.ok ? "--ok" : "--peligro"}) 12%, transparent)` }}>
            <p className="flex items-center gap-2 font-mono">
              {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ok" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-peligro" />}
              <span className="min-w-0 break-all">{r.texto}</span>
            </p>
            {!r.ok && !esPagina(e.lenguaje) ? (
              <p className="mt-1 pl-5 text-tenue">
                Esperaba <code>{mostrar(r.esperado)}</code> y {r.error ? <>dio error: {r.error}</> : <>salió <code>{mostrar(r.obtenido)}</code></>}
              </p>
            ) : null}
            {!r.ok && esPagina(e.lenguaje) && r.error ? <p className="mt-1 pl-5 text-tenue">{r.error}</p> : null}
          </li>
        ))}
      </ul>
      {corrida.salida.length ? (
        <>
          <p className="text-xs text-tenue">Lo que imprimiste:</p>
          <pre className="max-h-40 overflow-auto rounded-lg bg-fondo p-2 text-xs">{corrida.salida.join("\n")}</pre>
        </>
      ) : null}
    </div>
  );
}

function Panel({ titulo, icono: Icono, children, className = "flex" }: { titulo: string; icono: typeof Lightbulb; children: ReactNode; className?: string }) {
  return (
    <section className={cx("min-h-0 min-w-0 flex-col overflow-hidden bg-superficie", className)}>
      <header className="flex shrink-0 items-center gap-2 border-b border-borde px-3 py-2 text-xs font-semibold">
        <Icono className="h-3.5 w-3.5 text-acento" />
        {titulo}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}

function Resolver({ e, progreso, alCerrar }: { e: Ejercicio; progreso: Progreso | undefined; alCerrar: () => void }) {
  useModoPagina("completa");
  const navegar = useNavigate();
  const forma = useForma();
  const tactil = useTactil();
  const [codigo, setCodigo] = useState(progreso?.codigos[e.id] ?? e.plantilla);
  const [pistas, setPistas] = useState(0);
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [lado, setLado] = useState<"enunciado" | "codigo" | "pruebas">("codigo");
  const [vista, setVista] = useState(0);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { correr, elemento } = useArena();
  const java = escritorio()?.archivosLocales ?? null;
  const pagina = esPagina(e.lenguaje);
  const sinJava = e.lenguaje === "java" && !java;
  const guardar = useMutation({
    mutationFn: (d: { codigo: string; resuelto: boolean }) => api(`/api/ejercicios/progreso/${e.id}`, { metodo: "PUT", cuerpo: d }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ejercicios"] }),
  });
  const resuelto = Boolean(progreso?.resueltos[e.id]);
  const docVivo = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${paginaEjercicio(e, codigo)}</body></html>`, [e, codigo]);
  useEffect(() => {
    if (!pagina) return;
    const t = setTimeout(() => setVista((n) => n + 1), 300);
    return () => clearTimeout(t);
  }, [docVivo, pagina]);

  const probar = async () => {
    setCorriendo(true);
    setCorrida(null);
    if (forma === "celular") setLado("pruebas");
    let c: Corrida;
    if (e.lenguaje === "java") {
      try {
        const r = await java!.correrJava(programaJava(e, codigo));
        c = calificarJava(e, r.salida, r.error);
      } catch (err) {
        c = { resultados: [], salida: [], error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      const id = crypto.randomUUID();
      c = await correr(documentoEjercicio(e, codigo, id), id, e.lenguaje === "python" ? 90_000 : 10_000);
    }
    setCorrida(c);
    setCorriendo(false);
    guardar.mutate({ codigo, resuelto: !c.error && c.resultados.length > 0 && c.resultados.every((r) => r.ok) });
  };

  const ayuda = () => {
    const errores = corrida
      ? (corrida.error ??
        corrida.resultados
          .filter((r) => !r.ok)
          .map((r) => `${r.texto}: esperaba ${mostrar(r.esperado)} y salió ${r.error ? `error «${r.error}»` : mostrar(r.obtenido)}`)
          .join("\n"))
      : "Todavía no lo he probado.";
    const pregunta = `Estoy aprendiendo a programar. Ayúdame con este ejercicio de ${LENGUAJES[e.lenguaje]} SIN darme la solución completa: explícame qué está mal y dame una pista para arreglarlo.\n\nEjercicio: ${e.titulo}\n${e.enunciado}\n\nMi código:\n${codigo}\n\nResultado de las pruebas:\n${errores}`;
    try {
      sessionStorage.setItem("mi-setup.pregunta", pregunta);
      navegar("/ia?pregunta=@sesion");
    } catch {
      navegar(`/ia?pregunta=${encodeURIComponent(pregunta.slice(0, 1800))}`);
    }
  };

  const montar: OnMount = (ed) => {
    editorRef.current = ed;
  };

  const enunciado = (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">
        <Texto t={e.enunciado} />
      </p>
      {sinJava ? <p className="rounded-xl p-3 text-xs" style={{ background: "color-mix(in srgb, var(--aviso) 14%, transparent)" }}>Los ejercicios de Java se califican en la app de Windows (usa su propio Java, se instala solo la primera vez). Aquí puedes escribirlo y pedir ayuda a la IA.</p> : null}
      <div className="space-y-1.5">
        {e.pistas.slice(0, pistas).map((p, i) => (
          <p key={i} className="flex gap-2 rounded-lg p-2 text-xs" style={{ background: "color-mix(in srgb, var(--aviso) 12%, transparent)" }}>
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-aviso" />
            <span>
              <Texto t={p} />
            </span>
          </p>
        ))}
        <Boton tamano="sm" icono={Lightbulb} disabled={pistas >= e.pistas.length} onClick={() => setPistas((n) => n + 1)}>
          Ver pista ({pistas}/{e.pistas.length})
        </Boton>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold">Videos que lo explican</p>
        <Videos e={e} />
      </div>
    </div>
  );

  const editorCaja = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <Editor
          theme="vs-dark"
          language={MONACO[e.lenguaje]}
          value={codigo}
          onMount={montar}
          onChange={(v) => setCodigo(v ?? "")}
          options={{ fontSize: forma === "celular" ? 13 : 14, minimap: { enabled: false }, automaticLayout: true, tabSize: e.lenguaje === "python" || e.lenguaje === "java" ? 4 : 2, scrollBeyondLastLine: false, wordWrap: "on", lineNumbersMinChars: forma === "celular" ? 2 : 3 }}
        />
      </div>
      {tactil ? <FilaSimbolos obtener={() => editorRef.current} /> : null}
    </div>
  );

  const pruebas = <Resultados e={e} corrida={corrida} corriendo={corriendo} />;
  const celular = forma === "celular";

  return (
    <div className="flex h-full min-h-0 flex-col safe-top">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-borde bg-superficie px-2 py-2 sm:px-3">
        <Boton tamano="sm" variante="fantasma" icono={ArrowLeft} onClick={alCerrar} aria-label="Volver a los ejercicios">
          <span className="hidden sm:inline">Ejercicios</span>
        </Boton>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-semibold">
            {resuelto ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" /> : null}
            <span className="truncate">{e.titulo}</span>
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-tenue">
            <Etiqueta lenguaje={e.lenguaje} /> {NIVELES[e.nivel]}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Boton tamano="sm" variante="fantasma" icono={RotateCcw} onClick={() => (setCodigo(e.plantilla), setCorrida(null))} aria-label="Empezar de nuevo">
            <span className="hidden lg:inline">Empezar de nuevo</span>
          </Boton>
          <Boton tamano="sm" icono={Sparkles} onClick={ayuda}>
            <span className="hidden sm:inline">Pedir ayuda a la IA</span>
            <span className="sm:hidden">IA</span>
          </Boton>
          <Boton tamano="sm" variante="primario" icono={Play} cargando={corriendo} disabled={sinJava} onClick={() => void probar()}>
            Probar
          </Boton>
        </div>
      </header>
      {celular ? (
        <div className="shrink-0 px-2 pt-2 [&>*]:mb-2">
          <Pestanas
            valor={lado}
            alCambiar={setLado}
            opciones={[
              { id: "enunciado", texto: "Qué hacer" },
              { id: "codigo", texto: "Código" },
              { id: "pruebas", texto: pagina ? "Tu página" : "Pruebas" },
            ]}
          />
        </div>
      ) : null}
      <div
        className={cx(
          "grid min-h-0 flex-1 gap-px bg-borde",
          celular ? "grid-cols-1" : pagina ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_340px]",
        )}
      >
        {!celular || lado === "enunciado" ? (
          <Panel titulo="Qué hay que hacer" icono={GraduationCap} className={celular ? "flex" : "hidden xl:flex"}>
            {enunciado}
          </Panel>
        ) : null}
        {!celular || lado === "codigo" ? (
          <section className="flex min-h-0 min-w-0 flex-col bg-[#1e1e1e]">
            {!celular ? (
              <div className="shrink-0 border-b border-borde bg-superficie p-3 text-xs xl:hidden">
                <Texto t={e.enunciado} />
              </div>
            ) : null}
            <div className="min-h-0 flex-1">{editorCaja}</div>
          </section>
        ) : null}
        {!celular || lado === "pruebas" ? (
          pagina ? (
            <section className="flex min-h-0 min-w-0 flex-col bg-superficie">
              <header className="flex shrink-0 items-center gap-2 border-b border-borde px-3 py-2 text-xs font-semibold">
                <ListChecks className="h-3.5 w-3.5 text-acento" />
                Tu página
              </header>
              <div className="min-h-0 flex-1 p-2">
                <MarcoVista doc={docVivo} ancho={celular ? 375 : 768} alto={-1} actualizar={vista} />
              </div>
              <div className="max-h-[40%] shrink-0 overflow-auto border-t border-borde p-3">{pruebas}</div>
            </section>
          ) : (
            <Panel titulo="Pruebas" icono={ListChecks}>
              {pruebas}
              {!celular ? (
                <div className="mt-4 xl:hidden">
                  <p className="mb-1.5 text-xs font-semibold">Pistas y videos</p>
                  {enunciado}
                </div>
              ) : null}
            </Panel>
          )
        ) : null}
      </div>
      <div className="relative h-0">{elemento}</div>
    </div>
  );
}

function Tablero({ progreso, abrir }: { progreso: Progreso | undefined; abrir: (id: string) => void }) {
  const [nivel, setNivel] = useState<Nivel>("facil");
  const [lenguaje, setLenguaje] = useState<Lenguaje | "todos">("todos");
  const resueltos = progreso?.resueltos ?? {};
  const total = Object.keys(resueltos).length;
  const lista = useMemo(() => EJERCICIOS.filter((x) => x.nivel === nivel && (lenguaje === "todos" || x.lenguaje === lenguaje)), [nivel, lenguaje]);
  const { visibles, paginas } = usePaginado(lista, 10);
  const reto = retoDelDia(EJERCICIOS, resueltos);
  const continuar = EJERCICIOS.filter((x) => progreso?.codigos[x.id] && !resueltos[x.id]).slice(0, 3);
  const lenguajes = Object.keys(LENGUAJES) as Lenguaje[];
  const temas = lenguajes.map((l) => EJERCICIOS.find((x) => x.lenguaje === l)!).filter(Boolean);

  return (
    <div className="space-y-4">
      <Encabezado titulo="Ejercicios de código" descripcion="Aprende JavaScript, Python, HTML, CSS y Java con retos que se califican solos." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {reto ? (
          <section className="flex min-h-44 flex-col justify-between rounded-tarjeta p-5 text-white" style={{ background: "linear-gradient(135deg, #7c5cff, #c084fc 55%, #f472b6)" }}>
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-90">
                <Flame className="h-3.5 w-3.5" /> Reto del día
              </p>
              <h2 className="mt-1 text-xl font-bold">{reto.titulo}</h2>
              <p className="mt-1 line-clamp-2 text-sm opacity-90">{reto.enunciado.replace(/[`*]/g, "")}</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => abrir(reto.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#2b1b4d]">
                <Play className="h-4 w-4" /> Resolver
              </button>
              <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs">{LENGUAJES[reto.lenguaje]}</span>
              <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs">{NIVELES[reto.nivel]}</span>
            </div>
          </section>
        ) : null}
        <Tarjeta>
          <p className="text-3xl font-bold">
            {total} <span className="text-sm font-normal text-tenue">de {EJERCICIOS.length} resueltos</span>
          </p>
          <div className="mt-3 space-y-2">
            {lenguajes.map((l) => {
              const todos = EJERCICIOS.filter((x) => x.lenguaje === l);
              const hechos = todos.filter((x) => resueltos[x.id]).length;
              return (
                <div key={l} className="grid grid-cols-[72px_1fr_36px] items-center gap-2 text-xs">
                  <span>{LENGUAJES[l]}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-fondo">
                    <span className="block h-full rounded-full" style={{ width: `${(hechos / Math.max(1, todos.length)) * 100}%`, background: COLOR_LENGUAJE[l] }} />
                  </span>
                  <span className="text-right text-tenue">
                    {hechos}/{todos.length}
                  </span>
                </div>
              );
            })}
          </div>
        </Tarjeta>
        <Tarjeta titulo="Continúa donde te quedaste" icono={Clock3}>
          {continuar.length ? (
            <div className="space-y-1.5">
              {continuar.map((x) => (
                <button key={x.id} type="button" onClick={() => abrir(x.id)} className="flex w-full items-center gap-2 rounded-xl bg-fondo p-2 text-left text-sm hover:text-acento">
                  <Etiqueta lenguaje={x.lenguaje} />
                  <span className="min-w-0 flex-1 truncate">{x.titulo}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-tenue">Aquí salen los ejercicios que empezaste y no has terminado.</p>
          )}
        </Tarjeta>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Tarjeta
          titulo="Todos los ejercicios"
          icono={ListChecks}
          acciones={
            <Selector className="h-8 w-auto text-xs" value={lenguaje} onChange={(ev) => setLenguaje(ev.target.value as Lenguaje | "todos")} aria-label="Lenguaje">
              <option value="todos">Todos los lenguajes</option>
              {lenguajes.map((l) => (
                <option key={l} value={l}>
                  {LENGUAJES[l]}
                </option>
              ))}
            </Selector>
          }
        >
          <Pestanas
            valor={nivel}
            alCambiar={setNivel}
            opciones={(Object.keys(NIVELES) as Nivel[]).map((n) => ({
              id: n,
              texto: `${NIVELES[n]} ${EJERCICIOS.filter((x) => x.nivel === n && resueltos[x.id]).length}/${EJERCICIOS.filter((x) => x.nivel === n).length}`,
            }))}
          />
          <div className="divide-y divide-borde">
            {visibles.map((x) => {
              const hecho = Boolean(resueltos[x.id]);
              const empezado = Boolean(progreso?.codigos[x.id]);
              return (
                <button key={x.id} type="button" onClick={() => abrir(x.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-2.5 text-left text-sm hover:text-acento sm:grid-cols-[minmax(0,1fr)_90px_110px]">
                  <span className="min-w-0 truncate font-medium">{x.titulo}</span>
                  <span className="justify-self-end sm:justify-self-start">
                    <Etiqueta lenguaje={x.lenguaje} />
                  </span>
                  <span className={cx("hidden items-center gap-1.5 text-xs sm:flex", hecho ? "text-ok" : "text-tenue")}>
                    {hecho ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
                    {hecho ? "Resuelto" : empezado ? "En curso" : "Por hacer"}
                  </span>
                </button>
              );
            })}
          </div>
          {paginas}
        </Tarjeta>
        <Tarjeta titulo="Para aprender" icono={PlayCircle}>
          <p className="mb-2 text-xs text-tenue">Videos en YouTube por tema.</p>
          <div className="space-y-1.5">
            {temas.map((x) => (
              <Videos key={x.id} e={{ ...x, temas: [`${LENGUAJES[x.lenguaje]} desde cero`] }} />
            ))}
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}

export default function Ejercicios() {
  const [params, setParams] = useSearchParams();
  const progreso = useQuery({ queryKey: ["ejercicios"], queryFn: () => api<Progreso>("/api/ejercicios/progreso") });
  const actual = EJERCICIOS.find((x) => x.id === params.get("e")) ?? null;
  if (actual && progreso.isLoading) return <Cargando />;
  if (actual) return <Resolver key={actual.id} e={actual} progreso={progreso.data} alCerrar={() => setParams({})} />;
  return (
    <>
      <ErrorCaja error={progreso.error} />
      <Tablero progreso={progreso.data} abrir={(id) => setParams({ e: id })} />
    </>
  );
}

