import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Copy,
  History,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Server,
  SquareTerminal,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePaginado } from "../components/Paginas";
import { normalizarNombre } from "../components/terminal/Hosts";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { EditorCodigo, PantallaCompleta } from "../components/vps/EditorCodigo";
import { PildorasServidor, SUAVE } from "../components/vps/piezas";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtHora } from "../lib/formato";
import { useForma } from "../lib/marco";
import { useServidores } from "../lib/vps";

interface Comando {
  id: string;
  nombre: string;
  comando: string;
  descripcion: string;
  servidorId: string | null;
  peligroso: boolean;
  motivos: string[];
}

interface Resultado {
  codigo: number | null;
  salida: string;
  error: string;
  truncado: boolean;
  duracionMs: number;
}

interface Vez {
  hora: number;
  servidor: string;
  r: Resultado;
}

function copiar(texto: string) {
  void navigator.clipboard?.writeText(texto).then(
    () => avisar("Copiado"),
    () => avisar("No se pudo copiar", "error"),
  );
}

function Editor({ inicial, alTerminar }: { inicial: Comando | null; alTerminar: (guardado?: Comando) => void }) {
  const servidores = useServidores();
  const navegar = useNavigate();
  const [d, setD] = useState({ nombre: inicial?.nombre ?? "", comando: inicial?.comando ?? "", descripcion: inicial?.descripcion ?? "", servidorId: inicial?.servidorId ?? "" });
  const cambiado = !inicial || d.nombre !== inicial.nombre || d.comando !== inicial.comando || d.descripcion !== inicial.descripcion || d.servidorId !== (inicial.servidorId ?? "");
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { ...d, servidorId: d.servidorId || null };
      return inicial ? api<Comando>(`/api/vps/comandos/${inicial.id}`, { metodo: "PATCH", cuerpo }) : api<Comando>("/api/vps/comandos", { cuerpo });
    },
    onSuccess: (c) => {
      void queryClient.invalidateQueries({ queryKey: ["vps", "comandos"] });
      avisar("Comando guardado");
      alTerminar(c && typeof c === "object" && "id" in c ? c : undefined);
    },
  });
  const cerrar = async () => {
    if (cambiado && (d.nombre || d.comando) && !(await confirmar({ titulo: "Salir sin guardar", mensaje: "Los cambios que no guardaste se pierden." }))) return;
    alTerminar();
  };
  const ponerEnTerminal = () => {
    copiar(d.comando);
    navegar(d.servidorId ? `/vps/terminal?servidor=${encodeURIComponent(d.servidorId)}` : "/vps/terminal");
  };
  const atajo = normalizarNombre(d.nombre);
  return (
    <PantallaCompleta
      titulo={inicial ? `Editar ${inicial.nombre}` : "Nuevo comando"}
      subtitulo={<span className={cambiado ? "text-ok" : undefined}>{cambiado ? "Sin guardar" : "Guardado"}</span>}
      alCerrar={() => void cerrar()}
      pie={
        <>
          <Boton tamano="sm" icono={TerminalSquare} disabled={!d.comando} onClick={ponerEnTerminal}>
            Poner en la terminal
          </Boton>
          <span className="flex-1" />
          <Boton tamano="sm" variante="fantasma" onClick={() => void cerrar()}>
            Cancelar
          </Boton>
          <Boton tamano="sm" variante="primario" icono={Save} cargando={guardar.isPending} disabled={!d.nombre.trim() || !d.comando.trim()} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre del botón">
            <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required placeholder="respaldo" />
          </Campo>
          <Campo etiqueta="Atajo en la terminal">
            <div className="flex h-10 items-center rounded-xl border border-borde bg-superficie px-3 font-mono text-sm text-acento">/{atajo || "nombre"}</div>
          </Campo>
        </div>
        <Campo etiqueta="Descripción (opcional)">
          <Entrada value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} placeholder="Respaldo diario de la base" />
        </Campo>
        <div className="flex min-h-[18rem] flex-1 flex-col">
          <span className="mb-1 text-xs font-medium text-tenue">Comando o script</span>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-borde">
            <EditorCodigo valor={d.comando} alCambiar={(v) => setD((x) => ({ ...x, comando: v }))} lenguaje="shell" ruta={`comando-${inicial?.id ?? "nuevo"}.sh`} />
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-tenue">¿Dónde se ejecuta?</span>
          <div className="flex flex-wrap gap-2">
            {servidores.data?.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setD({ ...d, servidorId: s.id })}
                className={cx("inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm", d.servidorId === s.id ? "border-acento text-acento " + SUAVE.acento : "border-borde text-tenue hover:text-texto")}
              >
                <Server className="h-4 w-4" />
                {s.nombre}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setD({ ...d, servidorId: "" })}
              className={cx("inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm", !d.servidorId ? "border-acento text-acento " + SUAVE.acento : "border-borde text-tenue hover:text-texto")}
            >
              <CircleHelp className="h-4 w-4" />
              Elegir al ejecutar
            </button>
          </div>
        </div>
        {inicial?.peligroso ? (
          <div className="flex gap-3 rounded-xl border border-[color-mix(in_srgb,var(--error)_45%,transparent)] bg-[color-mix(in_srgb,var(--error)_9%,var(--superficie))] p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-peligro" />
            <div>
              <p className="font-semibold">Este comando es peligroso</p>
              <p className="text-tenue">{`${inicial.motivos.join(", ")}. Al ejecutarlo pedirá escribir «${inicial.nombre}» y tu huella o contraseña.`}</p>
            </div>
          </div>
        ) : null}
        <ErrorCaja error={guardar.error} />
      </div>
    </PantallaCompleta>
  );
}

function Detalle({
  c,
  servidor,
  veces,
  corriendo,
  esAdmin,
  puedeEjecutar,
  alEjecutar,
  alEditar,
  alBorrar,
  alVolver,
}: {
  c: Comando;
  servidor: string | null;
  veces: Vez[];
  corriendo: boolean;
  esAdmin: boolean;
  puedeEjecutar: boolean;
  alEjecutar: () => void;
  alEditar: () => void;
  alBorrar: () => void;
  alVolver?: () => void;
}) {
  const servidores = useServidores();
  const navegar = useNavigate();
  const destino = c.servidorId ?? servidor;
  const nombreDestino = servidores.data?.find((s) => s.id === destino)?.nombre;
  const nombrePropio = c.servidorId ? servidores.data?.find((s) => s.id === c.servidorId)?.nombre : null;
  const ultima = veces[0];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-start gap-3">
        {alVolver ? <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} aria-label="Volver" /> : null}
        <span className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-xl", c.peligroso ? SUAVE.peligro : SUAVE.acento)}>
          {c.peligroso ? <AlertTriangle className="h-5 w-5" /> : <SquareTerminal className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold">{c.nombre}</h2>
          {c.descripcion ? <p className="text-sm text-tenue">{c.descripcion}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-tenue">
            <span className="inline-flex items-center gap-1 rounded-lg bg-tarjeta px-2 py-1">
              <Server className="h-3 w-3" />
              {nombrePropio ?? "cualquier servidor"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-tarjeta px-2 py-1 font-mono">/{normalizarNombre(c.nombre)}</span>
            {c.peligroso ? <span className={cx("inline-flex items-center gap-1 rounded-lg px-2 py-1", SUAVE.peligro)}>Peligroso</span> : null}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-borde bg-fondo">
        <div className="flex items-center justify-between border-b border-borde px-3 py-2 text-xs text-tenue">
          Comando
          <button type="button" onClick={() => copiar(c.comando)} className="inline-flex items-center gap-1 hover:text-texto">
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </button>
        </div>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-xs leading-relaxed sm:text-sm">{c.comando}</pre>
      </div>
      <div className="flex flex-wrap gap-2">
        {puedeEjecutar ? (
          <Boton tamano="sm" variante={c.peligroso ? "peligro" : "primario"} icono={Play} cargando={corriendo} disabled={!destino} onClick={alEjecutar}>
            Ejecutar{nombreDestino ? ` en ${nombreDestino}` : ""}
          </Boton>
        ) : null}
        <Boton
          tamano="sm"
          icono={TerminalSquare}
          onClick={() => {
            copiar(c.comando);
            navegar(destino ? `/vps/terminal?servidor=${encodeURIComponent(destino)}` : "/vps/terminal");
          }}
        >
          Poner en la terminal
        </Boton>
        {esAdmin ? (
          <>
            <Boton tamano="sm" icono={Pencil} onClick={alEditar}>
              Editar
            </Boton>
            <Boton tamano="sm" variante="fantasma" icono={Trash2} className="text-peligro" onClick={alBorrar}>
              Borrar
            </Boton>
          </>
        ) : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Tarjeta titulo="Últimas veces" icono={History} className="bg-fondo">
          {veces.length ? (
            <ul className="divide-y divide-borde text-sm">
              {veces.map((v) => (
                <li key={v.hora} className="flex items-center gap-2 py-2">
                  {v.r.codigo === 0 ? <CircleCheck className="h-4 w-4 shrink-0 text-ok" /> : <CircleX className="h-4 w-4 shrink-0 text-peligro" />}
                  <span className="flex-1">{fmtHora(v.hora)}</span>
                  <span className="text-xs text-tenue">
                    {v.servidor} · {(v.r.duracionMs / 1000).toFixed(1)} s
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-tenue">Aquí salen las veces que lo ejecutes en esta sesión.</p>
          )}
        </Tarjeta>
        <Tarjeta
          titulo="Salida de la última vez"
          icono={SquareTerminal}
          className="bg-fondo"
          acciones={ultima ? <span className="text-xs text-tenue">{`código ${String(ultima.r.codigo)} · ${(ultima.r.duracionMs / 1000).toFixed(1)} s${ultima.r.truncado ? " · recortada" : ""}`}</span> : null}
        >
          {ultima ? (
            <>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-superficie p-3 font-mono text-xs">{ultima.r.salida || "(sin salida)"}</pre>
              {ultima.r.error ? <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-[color-mix(in_srgb,var(--error)_10%,transparent)] p-3 font-mono text-xs text-peligro">{ultima.r.error}</pre> : null}
            </>
          ) : (
            <p className="text-sm text-tenue">Ejecútalo para ver aquí lo que respondió el servidor.</p>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}

export default function VpsComandos() {
  const esAdmin = usePuede("vps_comandos", "administrar");
  const puedeEjecutar = usePuede("vps_comandos", "escritura");
  const servidores = useServidores();
  const forma = useForma();
  const [servidor, setServidor] = useState<string | null>(null);
  const [editando, setEditando] = useState<Comando | null | "nuevo">(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [verDetalle, setVerDetalle] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [veces, setVeces] = useState<Record<string, Vez[]>>({});
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["vps", "comandos"], queryFn: () => api<Comando[]>("/api/vps/comandos") });

  const nombreDe = (id: string | null) => (id ? servidores.data?.find((s) => s.id === id)?.nombre ?? "otro servidor" : "Cualquier servidor");
  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const lista = (data ?? []).filter((c) => !q || `${c.nombre} ${c.descripcion} ${c.comando}`.toLowerCase().includes(q));
    return [...lista].sort((a, b) => nombreDe(a.servidorId).localeCompare(nombreDe(b.servidorId)) || a.nombre.localeCompare(b.nombre));
  }, [data, buscar, servidores.data]);
  const pg = usePaginado(filtrados, 10);
  const actual = data?.find((c) => c.id === elegido) ?? null;
  const dividido = forma === "pc";

  useEffect(() => {
    if (dividido && !elegido && data?.[0]) setElegido(data[0].id);
  }, [dividido, elegido, data]);

  const ejecutar = async (c: Comando) => {
    const destino = c.servidorId ?? servidor;
    if (!destino) return;
    const nombreServidor = servidores.data?.find((s) => s.id === destino)?.nombre ?? "el servidor";
    const ok = await confirmar({
      titulo: `Ejecutar "${c.nombre}"`,
      mensaje: `Se ejecutará en ${nombreServidor}:`,
      detalle: c.peligroso ? `${c.comando}\n\nRiesgo: ${c.motivos.join(", ")}` : c.comando,
      peligroso: c.peligroso,
      textoExacto: c.nombre,
      boton: "Ejecutar",
    });
    if (!ok) return;
    setCorriendo(c.id);
    try {
      const r = await api<Resultado>(`/api/vps/comandos/${c.id}/ejecutar`, { cuerpo: { servidorId: destino, ...(c.peligroso ? { confirmacion: c.nombre } : {}) } });
      setVeces((v) => ({ ...v, [c.id]: [{ hora: Date.now(), servidor: nombreServidor, r }, ...(v[c.id] ?? [])].slice(0, 6) }));
    } catch (err) {
      avisarError(err);
    } finally {
      setCorriendo(null);
    }
  };

  const borrar = async (c: Comando) => {
    if (!(await confirmar({ titulo: "Borrar comando", mensaje: `¿Borrar "${c.nombre}"?` }))) return;
    await api(`/api/vps/comandos/${c.id}`, { metodo: "DELETE" }).catch(avisarError);
    if (elegido === c.id) setElegido(null);
    setVerDetalle(false);
    await queryClient.invalidateQueries({ queryKey: ["vps", "comandos"] });
  };

  if (editando !== null) {
    return (
      <Editor
        inicial={editando === "nuevo" ? null : editando}
        alTerminar={(c) => {
          setEditando(null);
          if (c) setElegido(c.id);
        }}
      />
    );
  }

  const lista = (
    <section className="flex min-w-0 flex-col rounded-tarjeta border border-borde bg-superficie p-3">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-borde bg-fondo px-3 text-sm">
        <Search className="h-4 w-4 text-tenue" />
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tenue" />
      </label>
      <ul className="mt-2 space-y-1">
        {pg.visibles.map((c, i) => {
          const grupo = nombreDe(c.servidorId);
          const nuevoGrupo = i === 0 || nombreDe(pg.visibles[i - 1]!.servidorId) !== grupo;
          const ultima = veces[c.id]?.[0];
          return (
            <li key={c.id}>
              {nuevoGrupo ? <p className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-tenue">{grupo}</p> : null}
              <button
                type="button"
                onClick={() => {
                  setElegido(c.id);
                  setVerDetalle(true);
                }}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors",
                  dividido && elegido === c.id ? "border-[color-mix(in_srgb,var(--acento)_45%,transparent)] bg-tarjeta" : "border-transparent hover:bg-tarjeta",
                )}
              >
                <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", c.peligroso ? SUAVE.peligro : SUAVE.acento)}>
                  <SquareTerminal className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.nombre}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-tenue">
                    <span className="font-mono">/{normalizarNombre(c.nombre)}</span>
                    {ultima ? (
                      <>
                        <Clock className="ml-1 h-3 w-3" />
                        {fmtHora(ultima.hora)}
                      </>
                    ) : null}
                  </span>
                </span>
                {c.peligroso ? <AlertTriangle className="h-4 w-4 shrink-0 text-peligro" aria-label="Peligroso" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {filtrados.length === 0 && data?.length ? <p className="p-3 text-sm text-tenue">{`Nada coincide con «${buscar}».`}</p> : null}
      <div className="mt-auto">{pg.paginas}</div>
    </section>
  );

  const detalle = actual ? (
    <Detalle
      c={actual}
      servidor={servidor}
      veces={veces[actual.id] ?? []}
      corriendo={corriendo === actual.id}
      esAdmin={esAdmin}
      puedeEjecutar={puedeEjecutar}
      alEjecutar={() => void ejecutar(actual)}
      alEditar={() => setEditando(actual)}
      alBorrar={() => void borrar(actual)}
      alVolver={dividido ? undefined : () => setVerDetalle(false)}
    />
  ) : null;

  return (
    <>
      <Encabezado
        titulo="Comandos guardados"
        descripcion="Escribe /nombre en la terminal para usarlos. Los peligrosos piden escribir el nombre y tu huella."
        acciones={
          <>
            <PildorasServidor valor={servidor} alCambiar={setServidor} />
            {esAdmin ? (
              <Boton variante="primario" icono={Plus} onClick={() => setEditando("nuevo")}>
                Comando
              </Boton>
            ) : null}
          </>
        }
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      {data?.length === 0 ? <Vacio icono={ListChecks} texto="Crea botones para tus scripts, por ejemplo vps-manager.sh." /> : null}
      {data?.length ? (
        dividido ? (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
            {lista}
            <section className="min-w-0 rounded-tarjeta border border-borde bg-superficie p-4">{detalle ?? <p className="text-sm text-tenue">Elige un comando de la lista.</p>}</section>
          </div>
        ) : verDetalle && detalle ? (
          <section className="min-w-0 rounded-tarjeta border border-borde bg-superficie p-3">{detalle}</section>
        ) : (
          lista
        )
      ) : null}
    </>
  );
}
