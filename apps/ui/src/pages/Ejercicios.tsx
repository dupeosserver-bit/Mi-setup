/** Ejercicios de código: 30 retos en 3 niveles, calificados solos, con pistas y ayuda de la IA. */
import "../lib/monaco";
import Editor from "@monaco-editor/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, GraduationCap, Lightbulb, Play, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boton, Cargando, Encabezado, ErrorCaja, Insignia, Pestanas, Selector, Tarjeta, cx } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { documentoEjercicio, type Corrida } from "../lib/corredor";
import { EJERCICIOS, LENGUAJES, NIVELES, type Ejercicio, type Lenguaje, type Nivel } from "../lib/ejercicios";

interface Progreso {
  resueltos: Record<string, string>;
  codigos: Record<string, string>;
}

/** `código` y **negritas** del enunciado. */
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

/** Marco aislado (/vista-previa) donde corre y se califica tu código. */
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
        // Un ciclo infinito congela el marco: se reinicia.
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

  const elemento = (visible: boolean) => (
    <iframe
      key={clave}
      ref={marco}
      title="Resultado"
      sandbox="allow-scripts allow-modals"
      src={`${API_BASE}/vista-previa`}
      className={cx("w-full rounded-xl border border-borde bg-white", visible ? "h-56" : "pointer-events-none absolute h-0 w-0 opacity-0")}
    />
  );
  return { correr, elemento };
}

function Detalle({ e, progreso }: { e: Ejercicio; progreso: Progreso | undefined }) {
  const navegar = useNavigate();
  const [codigo, setCodigo] = useState(progreso?.codigos[e.id] ?? e.plantilla);
  const [pistas, setPistas] = useState(0);
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const { correr, elemento } = useArena();
  const guardar = useMutation({
    mutationFn: (d: { codigo: string; resuelto: boolean }) => api(`/api/ejercicios/progreso/${e.id}`, { metodo: "PUT", cuerpo: d }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ejercicios"] }),
  });
  const resuelto = Boolean(progreso?.resueltos[e.id]);
  const todos = corrida && !corrida.error && corrida.resultados.length > 0 && corrida.resultados.every((r) => r.ok);

  const probar = async () => {
    setCorriendo(true);
    setCorrida(null);
    const id = crypto.randomUUID();
    const c = await correr(documentoEjercicio(e, codigo, id), id, e.lenguaje === "python" ? 90_000 : 10_000);
    setCorrida(c);
    setCorriendo(false);
    const ok = !c.error && c.resultados.length > 0 && c.resultados.every((r) => r.ok);
    guardar.mutate({ codigo, resuelto: ok });
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

  return (
    <div className="space-y-3">
      <Tarjeta
        titulo={e.titulo}
        icono={resuelto ? CheckCircle2 : GraduationCap}
        acciones={
          <div className="flex gap-1">
            <Insignia>{NIVELES[e.nivel]}</Insignia>
            <Insignia tono="aviso">{LENGUAJES[e.lenguaje]}</Insignia>
          </div>
        }
      >
        <p className="text-sm leading-relaxed">
          <Texto t={e.enunciado} />
        </p>
        {pistas > 0 ? (
          <ul className="mt-3 space-y-1">
            {e.pistas.slice(0, pistas).map((p, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-aviso/10 p-2 text-xs">
                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-aviso" />
                <span>
                  <Texto t={p} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Tarjeta>
      <div className="h-[42vh] min-h-64 overflow-hidden rounded-tarjeta border border-borde">
        <Editor
          theme="vs-dark"
          language={e.lenguaje}
          value={codigo}
          onChange={(v) => setCodigo(v ?? "")}
          options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true, tabSize: e.lenguaje === "python" ? 4 : 2, scrollBeyondLastLine: false }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" icono={Play} cargando={corriendo} onClick={() => void probar()}>
          {corriendo && e.lenguaje === "python" ? "Preparando Python…" : "Probar"}
        </Boton>
        <Boton icono={Lightbulb} disabled={pistas >= e.pistas.length} onClick={() => setPistas((n) => n + 1)}>
          Pista ({pistas}/{e.pistas.length})
        </Boton>
        <Boton icono={Sparkles} onClick={ayuda}>
          Pedir ayuda a la IA
        </Boton>
        <Boton
          variante="fantasma"
          icono={RotateCcw}
          onClick={() => {
            setCodigo(e.plantilla);
            setCorrida(null);
          }}
        >
          Empezar de nuevo
        </Boton>
      </div>
      {e.lenguaje === "html" ? <p className="text-xs text-tenue">Tu página:</p> : null}
      <div className="relative">{elemento(e.lenguaje === "html")}</div>
      {corriendo ? <Cargando texto={e.lenguaje === "python" ? "La primera vez baja Python (unos segundos)…" : "Probando…"} /> : null}
      {corrida ? (
        <Tarjeta titulo={todos ? "¡Todo bien! Ejercicio resuelto 🎉" : "Resultados"} icono={todos ? CheckCircle2 : XCircle}>
          {corrida.error ? <ErrorCaja error={new Error(corrida.error)} /> : null}
          <ul className="space-y-1">
            {corrida.resultados.map((r, i) => (
              <li key={i} className={cx("rounded-lg p-2 text-xs", r.ok ? "bg-ok/10" : "bg-peligro/10")}>
                <p className="flex items-center gap-2 font-mono">
                  {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> : <XCircle className="h-3.5 w-3.5 text-peligro" />}
                  {r.texto}
                </p>
                {!r.ok && e.lenguaje !== "html" ? (
                  <p className="mt-1 pl-5 text-tenue">
                    Esperaba <code>{mostrar(r.esperado)}</code> y {r.error ? <>dio error: {r.error}</> : <>salió <code>{mostrar(r.obtenido)}</code></>}
                  </p>
                ) : null}
                {!r.ok && e.lenguaje === "html" && r.error ? <p className="mt-1 pl-5 text-tenue">{r.error}</p> : null}
              </li>
            ))}
          </ul>
          {corrida.salida.length ? (
            <>
              <p className="mt-3 text-xs text-tenue">Lo que imprimiste:</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-fondo p-2 text-xs">{corrida.salida.join("\n")}</pre>
            </>
          ) : null}
        </Tarjeta>
      ) : null}
    </div>
  );
}

export default function Ejercicios() {
  const [nivel, setNivel] = useState<Nivel>("facil");
  const [lenguaje, setLenguaje] = useState<Lenguaje | "todos">("todos");
  const [elegido, setElegido] = useState<string | null>(null);
  const progreso = useQuery({ queryKey: ["ejercicios"], queryFn: () => api<Progreso>("/api/ejercicios/progreso") });
  const resueltos = Object.keys(progreso.data?.resueltos ?? {}).length;
  const lista = EJERCICIOS.filter((x) => x.nivel === nivel && (lenguaje === "todos" || x.lenguaje === lenguaje));
  const actual = EJERCICIOS.find((x) => x.id === elegido) ?? null;

  return (
    <div className="space-y-4">
      <Encabezado titulo="Ejercicios de código" descripcion="Aprende JavaScript, Python y HTML/CSS con retos que se califican solos." />
      <Tarjeta>
        <div className="flex items-center gap-3">
          <GraduationCap className="h-5 w-5 shrink-0 text-acento" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              Llevas <strong>{resueltos}</strong> de {EJERCICIOS.length} resueltos
            </p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-fondo">
              <div className="h-full bg-acento transition-all" style={{ width: `${(resueltos / EJERCICIOS.length) * 100}%` }} />
            </div>
          </div>
        </div>
      </Tarjeta>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <Pestanas
            valor={nivel}
            alCambiar={(n) => {
              setNivel(n);
              setElegido(null);
            }}
            opciones={(Object.keys(NIVELES) as Nivel[]).map((n) => ({
              id: n,
              texto: `${NIVELES[n]} (${EJERCICIOS.filter((x) => x.nivel === n && progreso.data?.resueltos[x.id]).length}/${EJERCICIOS.filter((x) => x.nivel === n).length})`,
            }))}
          />
        </div>
        <Selector className="mb-4 w-auto" value={lenguaje} onChange={(ev) => setLenguaje(ev.target.value as Lenguaje | "todos")}>
          <option value="todos">Todos los lenguajes</option>
          {(Object.keys(LENGUAJES) as Lenguaje[]).map((l) => (
            <option key={l} value={l}>
              {LENGUAJES[l]}
            </option>
          ))}
        </Selector>
      </div>
      <ErrorCaja error={progreso.error} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-1">
          {lista.map((x) => {
            const hecho = Boolean(progreso.data?.resueltos[x.id]);
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setElegido(x.id)}
                className={cx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm", elegido === x.id ? "bg-tarjeta" : "hover:bg-tarjeta")}
              >
                {hecho ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" /> : <CircleDashed className="h-4 w-4 shrink-0 text-tenue" />}
                <span className="min-w-0 flex-1 truncate">{x.titulo}</span>
                <span className="shrink-0 text-[11px] text-tenue">{LENGUAJES[x.lenguaje]}</span>
              </button>
            );
          })}
        </div>
        <div className="min-w-0">
          {actual ? (
            <Detalle key={actual.id} e={actual} progreso={progreso.data} />
          ) : (
            <Tarjeta>
              <p className="text-sm text-tenue">Elige un ejercicio de la lista. Empieza por los fáciles: cada uno te enseña algo que usarás en el siguiente.</p>
            </Tarjeta>
          )}
        </div>
      </div>
    </div>
  );
}
