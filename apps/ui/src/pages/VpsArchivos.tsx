/** Explorador SFTP: navegar, descargar, subir (varios a la vez), crear carpetas, renombrar y borrar. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, Download, Eraser, File, FileEdit, Folder, FolderPlus, FolderTree, Link2, Pencil, Save, Search, Send, TerminalSquare, Trash2, Upload, Wand2, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useRef, useState, type FormEvent } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Selector, Vacio, avisar, avisarError } from "../components/ui";
import { api, descargar } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes, fmtFechaHora } from "../lib/formato";
import { SelectorServidor, useServidores } from "../lib/vps";

interface Entrada {
  nombre: string;
  tipo: "carpeta" | "archivo" | "enlace";
  tamano: number;
  modificado: string;
  permisos: string;
}

const unir = (base: string, nombre: string) => `${base.replace(/\/$/, "")}/${nombre}`;
const nombreValido = (n: string) => n.trim() !== "" && !n.includes("/") && n !== "." && n !== "..";

/** Ventana para escribir un nombre (carpeta nueva o renombrar). */
function PedirNombre({
  titulo,
  inicial,
  boton,
  alGuardar,
  alCerrar,
}: {
  titulo: string;
  inicial: string;
  boton: string;
  alGuardar: (n: string) => Promise<unknown>;
  alCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombreValido(nombre)) return avisar("Nombre inválido (sin /)", "error");
    setGuardando(true);
    try {
      await alGuardar(nombre.trim());
      alCerrar();
    } catch (err) {
      avisarError(err);
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal abierto titulo={titulo} alCerrar={alCerrar}>
      <form className="space-y-3" onSubmit={(e) => void enviar(e)}>
        <Campo etiqueta="Nombre">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus maxLength={255} />
        </Campo>
        <Boton type="submit" variante="primario" className="w-full" cargando={guardando}>
          {boton}
        </Boton>
      </form>
    </Modal>
  );
}

/** Copia un archivo directo de este servidor a otro (p. ej. del home lab al VPS). */
function EnviarAServidor({ origenId, ruta, alCerrar }: { origenId: string; ruta: string; alCerrar: () => void }) {
  const otros = (useServidores().data ?? []).filter((s) => s.id !== origenId);
  const [destino, setDestino] = useState(otros[0]?.id ?? "");
  const [carpeta, setCarpeta] = useState("/root");
  const enviar = useMutation({
    mutationFn: () => api<{ destino: string; bytes: number }>(`/api/vps/servidores/${origenId}/archivos/enviar`, { cuerpo: { ruta, destinoId: destino || otros[0]?.id, carpetaDestino: carpeta } }),
    onSuccess: (r) => {
      avisar(`Copiado a ${r.destino} (${fmtBytes(r.bytes)})`);
      alCerrar();
    },
    onError: avisarError,
  });
  return (
    <Modal abierto titulo="Enviar a otro servidor" alCerrar={alCerrar}>
      {!otros.length ? (
        <Vacio texto="Agrega otro servidor (tu home lab o tu VPS) en Servidores para poder enviar archivos entre ellos." />
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enviar.mutate();
          }}
        >
          <p className="break-all text-sm text-tenue">{ruta}</p>
          <Campo etiqueta="Servidor destino">
            <Selector value={destino || otros[0]?.id} onChange={(e) => setDestino(e.target.value)}>
              {otros.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} ({s.usuario}@{s.host})
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Carpeta destino">
            <Entrada value={carpeta} onChange={(e) => setCarpeta(e.target.value)} />
          </Campo>
          <Boton type="submit" variante="primario" icono={Send} className="w-full" cargando={enviar.isPending}>
            {enviar.isPending ? "Copiando… (los archivos grandes tardan)" : "Enviar"}
          </Boton>
        </form>
      )}
    </Modal>
  );
}

/** Editor de texto (configs, .yml, .properties, scripts…): guarda dejando una copia .bak. */
function EditorTexto({ base, ruta, alCerrar }: { base: string; ruta: string; alCerrar: () => void }) {
  const q = useQuery({
    queryKey: ["vps", "texto", base, ruta],
    queryFn: () => api<{ contenido: string }>(`${base}/texto?ruta=${encodeURIComponent(ruta)}`),
    gcTime: 0,
  });
  const [texto, setTexto] = useState<string | null>(null);
  const actual = texto ?? q.data?.contenido ?? "";
  const cambiado = texto !== null && texto !== q.data?.contenido;
  const guardar = useMutation({
    mutationFn: () => api<{ respaldo: string | null }>(`${base}/texto`, { metodo: "PUT", cuerpo: { ruta, contenido: actual } }),
    onSuccess: (r) => {
      avisar(r.respaldo ? `Guardado (copia anterior en ${r.respaldo.split("/").pop()})` : "Guardado");
      void queryClient.invalidateQueries({ queryKey: ["vps"] });
      alCerrar();
    },
    onError: avisarError,
  });
  const cerrar = async () => {
    if (cambiado && !(await confirmar({ titulo: "Salir sin guardar", mensaje: "Tienes cambios sin guardar.", boton: "Salir" }))) return;
    alCerrar();
  };
  return (
    <Modal abierto titulo={`Editar ${ruta.split("/").pop() ?? ""}`} alCerrar={() => void cerrar()} ancho="max-w-4xl">
      <p className="mb-2 truncate font-mono text-xs text-tenue">{ruta}</p>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data ? (
        <textarea
          value={actual}
          onChange={(e) => setTexto(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="h-[60vh] w-full min-w-0 resize-none rounded-xl border border-borde bg-fondo p-3 font-mono text-xs leading-relaxed text-texto focus:border-acento focus:outline-none"
        />
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Boton variante="primario" icono={Save} cargando={guardar.isPending} disabled={!cambiado} onClick={() => guardar.mutate()}>
          Guardar
        </Boton>
        <Boton variante="fantasma" onClick={() => void cerrar()}>
          Cerrar
        </Boton>
        <span className="text-xs text-tenue">Al guardar se deja una copia del archivo anterior con terminación .bak</span>
      </div>
    </Modal>
  );
}

/** Archivos que se abren en el editor (por extensión o sin extensión, como Dockerfile). */
const EDITABLE = /(\.(txt|md|ya?ml|json|properties|conf|cfg|ini|env|sh|bash|py|js|ts|mjs|cjs|php|html|css|xml|toml|log|sql|service|rules|list|csv)|^[^.]+)$/i;

// ---------------------------------------------------------------- lupa, organizar y limpiar

interface Encontrado {
  ruta: string;
  nombre: string;
  tipo: "carpeta" | "archivo" | "enlace";
  tamano: number;
  modificado: string;
}

/** La lupa: busca por nombre debajo de la carpeta actual. */
function Busqueda({ base, ruta, alAbrir, alCerrar }: { base: string; ruta: string; alAbrir: (carpeta: string) => void; alCerrar: () => void }) {
  const [texto, setTexto] = useState("");
  const buscar = useMutation({
    mutationFn: () => api<{ resultados: Encontrado[]; limite: boolean }>(`${base}/buscar?ruta=${encodeURIComponent(ruta)}&q=${encodeURIComponent(texto.trim())}`),
    onError: avisarError,
  });
  return (
    <div className="mb-3 rounded-tarjeta border border-borde bg-superficie p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim().length >= 2) buscar.mutate();
        }}
      >
        <Entrada autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Buscar en ${ruta} por nombre…`} maxLength={100} />
        <Boton type="submit" variante="primario" icono={Search} cargando={buscar.isPending}>
          Buscar
        </Boton>
        <Boton type="button" tamano="icono" variante="fantasma" icono={X} aria-label="Cerrar búsqueda" onClick={alCerrar} />
      </form>
      {buscar.data ? (
        <div className="mt-2 max-h-80 overflow-y-auto">
          {!buscar.data.resultados.length ? <p className="py-2 text-sm text-tenue">No hay nada con ese nombre.</p> : null}
          {buscar.data.resultados.map((r) => {
            const Icono = r.tipo === "carpeta" ? Folder : r.tipo === "enlace" ? Link2 : File;
            const carpeta = r.tipo === "carpeta" ? r.ruta : r.ruta.slice(0, r.ruta.lastIndexOf("/")) || "/";
            return (
              <div key={r.ruta} className="flex items-center gap-2 border-b border-borde py-1.5 text-sm last:border-0">
                <Icono className="h-4 w-4 shrink-0 text-tenue" />
                <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" title={r.ruta} onClick={() => alAbrir(carpeta)}>
                  {r.ruta}
                </button>
                <span className="hidden text-xs text-tenue sm:block">{r.tipo === "archivo" ? fmtBytes(r.tamano) : ""}</span>
                {r.tipo === "archivo" ? (
                  <Boton tamano="icono" variante="fantasma" icono={Download} aria-label={`Descargar ${r.nombre}`} onClick={() => void descargar(`${base}/descargar?ruta=${encodeURIComponent(r.ruta)}`, r.nombre).catch(avisarError)} />
                ) : null}
              </div>
            );
          })}
          {buscar.data.limite ? <p className="pt-2 text-xs text-tenue">Hay más de 300: escribe algo más exacto.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Propone mover cada archivo suelto a una carpeta según su tipo; tú eliges cuáles. */
function Organizar({ base, ruta, alCerrar, alTerminar }: { base: string; ruta: string; alCerrar: () => void; alTerminar: () => void }) {
  const plan = useQuery({
    queryKey: ["vps", "organizar", base, ruta],
    queryFn: () => api<{ protegida: boolean; movimientos: { archivo: string; carpeta: string; existe: boolean }[] }>(`${base}/organizar/plan`, { cuerpo: { ruta } }),
  });
  const [quitados, setQuitados] = useState<Set<string>>(new Set());
  const elegidos = (plan.data?.movimientos ?? []).filter((m) => !quitados.has(m.archivo));
  const aplicar = useMutation({
    mutationFn: () =>
      api<{ movidos: number; omitidos: string[]; renombrados?: { archivo: string; nuevo: string; carpeta: string }[] }>(`${base}/organizar`, {
        cuerpo: { ruta, movimientos: elegidos.map(({ archivo, carpeta }) => ({ archivo, carpeta })) },
      }),
    onSuccess: (r) => {
      const ren = r.renombrados ?? [];
      avisar(
        `Movidos ${r.movidos}${ren.length ? `; ${ren.length} con número al final porque ya había uno igual (ej. ${ren[0]!.nuevo})` : ""}${r.omitidos.length ? `; ${r.omitidos.length} no se pudieron mover` : ""}`,
      );
      alTerminar();
      alCerrar();
    },
    onError: avisarError,
  });
  const grupos = new Map<string, typeof elegidos>();
  for (const m of plan.data?.movimientos ?? []) grupos.set(m.carpeta, [...(grupos.get(m.carpeta) ?? []), m]);
  return (
    <Modal abierto titulo={`Organizar ${ruta}`} alCerrar={alCerrar}>
      <ErrorCaja error={plan.error} />
      {plan.isLoading ? <Cargando /> : null}
      {plan.data?.protegida ? <p className="text-sm text-aviso">Esta carpeta es del sistema: no se reorganiza.</p> : null}
      {plan.data && !plan.data.protegida ? (
        <div className="space-y-3">
          {!plan.data.movimientos.length ? <p className="text-sm text-tenue">Todo está en orden: no hay archivos sueltos que mover.</p> : null}
          {[...grupos.entries()].map(([carpeta, lista]) => (
            <div key={carpeta} className="rounded-xl border border-borde p-2">
              <p className="mb-1 flex items-center gap-2 text-sm font-medium">
                <Folder className="h-4 w-4" /> {carpeta} <span className="text-xs text-tenue">{lista[0]?.existe ? "(ya existe)" : "(se crea)"}</span>
              </p>
              {lista.map((m) => (
                <label key={m.archivo} className="flex items-center gap-2 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    checked={!quitados.has(m.archivo)}
                    onChange={(e) => {
                      const n = new Set(quitados);
                      if (e.target.checked) n.delete(m.archivo);
                      else n.add(m.archivo);
                      setQuitados(n);
                    }}
                  />
                  <span className="truncate font-mono text-xs">{m.archivo}</span>
                </label>
              ))}
            </div>
          ))}
          <p className="text-xs text-tenue">Nunca se mueven archivos de configuración (.env, .yml, .json, .conf…) ni ocultos, y nunca se pisa un archivo que ya esté en la carpeta.</p>
          <Boton variante="primario" icono={Wand2} cargando={aplicar.isPending} disabled={!elegidos.length} onClick={() => aplicar.mutate()}>
            Mover {elegidos.length}
          </Boton>
        </div>
      ) : null}
    </Modal>
  );
}

/** Busca basura (temporales, logs viejos, cachés) y borra solo lo que marques. */
function Limpiar({ base, ruta, alCerrar, alTerminar }: { base: string; ruta: string; alCerrar: () => void; alTerminar: () => void }) {
  const plan = useQuery({
    queryKey: ["vps", "limpiar", base, ruta],
    queryFn: () => api<{ basura: { ruta: string; tamano: number; razon: string; carpeta: boolean }[]; total: number }>(`${base}/limpiar/plan`, { cuerpo: { ruta } }),
    retry: false,
  });
  const [quitados, setQuitados] = useState<Set<string>>(new Set());
  const elegidos = (plan.data?.basura ?? []).filter((b) => !quitados.has(b.ruta));
  const borrar = useMutation({
    mutationFn: () => api<{ borrados: number; omitidos: string[] }>(`${base}/limpiar`, { cuerpo: { ruta, rutas: elegidos.map((b) => b.ruta) } }),
    onSuccess: (r) => {
      avisar(`Borrados ${r.borrados}${r.omitidos.length ? `; ${r.omitidos.length} no se tocaron` : ""}`);
      alTerminar();
      alCerrar();
    },
    onError: avisarError,
  });
  const liberado = elegidos.reduce((a, b) => a + b.tamano, 0);
  return (
    <Modal abierto titulo={`Limpiar basura en ${ruta}`} alCerrar={alCerrar}>
      <ErrorCaja error={plan.error} />
      {plan.isLoading ? <Cargando texto="Buscando basura…" /> : null}
      {plan.data ? (
        <div className="space-y-3">
          {!plan.data.basura.length ? <p className="text-sm text-tenue">No encontré basura aquí. ¡Limpio!</p> : null}
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {plan.data.basura.map((b) => (
              <label key={b.ruta} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!quitados.has(b.ruta)}
                  onChange={(e) => {
                    const n = new Set(quitados);
                    if (e.target.checked) n.delete(b.ruta);
                    else n.add(b.ruta);
                    setQuitados(n);
                  }}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={b.ruta}>
                  {b.ruta}
                </span>
                <span className="hidden shrink-0 text-xs text-tenue sm:block">{b.razon}</span>
                <span className="w-16 shrink-0 text-right text-xs text-tenue">{b.carpeta ? "carpeta" : fmtBytes(b.tamano)}</span>
              </label>
            ))}
          </div>
          {plan.data.basura.length ? (
            <Boton
              variante="peligro"
              icono={Eraser}
              cargando={borrar.isPending}
              disabled={!elegidos.length}
              onClick={async () => {
                if (await confirmar({ titulo: "Borrar basura", mensaje: `Se borran ${elegidos.length} elementos (${fmtBytes(liberado)}). No se puede deshacer.`, boton: "Borrar" })) borrar.mutate();
              }}
            >
              Borrar {elegidos.length} ({fmtBytes(liberado)})
            </Boton>
          ) : null}
          <p className="text-xs text-tenue">Solo salen temporales, respaldos de editores (~, .swp), logs de más de 14 días y cachés de Python. Antes de borrar se revisa otra vez en el servidor.</p>
        </div>
      ) : null}
    </Modal>
  );
}

export default function VpsArchivos() {
  const [params] = useSearchParams();
  const [servidor, setServidor] = useState<string | null>(() => params.get("servidor"));
  const [ruta, setRuta] = useState(() => params.get("ruta") || "/root");
  const navegar = useNavigate();
  const [nuevaCarpeta, setNuevaCarpeta] = useState(false);
  const [renombrar, setRenombrar] = useState<Entrada | null>(null);
  const [editar, setEditar] = useState<string | null>(null);
  const [enviarRuta, setEnviarRuta] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [lupa, setLupa] = useState(false);
  const [organizar, setOrganizar] = useState(false);
  const [limpiar, setLimpiar] = useState(false);
  const puedeEscribir = usePuede("vps_archivos", "escritura");
  const input = useRef<HTMLInputElement>(null);
  const clave = ["vps", "archivos", servidor, ruta];
  const base = `/api/vps/servidores/${servidor}/archivos`;
  const { data, isLoading, error } = useQuery({
    queryKey: clave,
    queryFn: () => api<{ ruta: string; entradas: Entrada[] }>(`${base}?ruta=${encodeURIComponent(ruta)}`),
    enabled: Boolean(servidor),
  });
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: clave });

  const subir = useMutation({
    mutationFn: async (archivos: File[]) => {
      for (const [i, archivo] of archivos.entries()) {
        setProgreso(`Subiendo ${i + 1} de ${archivos.length}: ${archivo.name}`);
        const datos = new FormData();
        datos.append("archivo", archivo);
        await api(`${base}/subir?ruta=${encodeURIComponent(ruta)}`, { formulario: datos });
      }
      return archivos.length;
    },
    onSuccess: (n) => avisar(n === 1 ? "Archivo subido" : `${n} archivos subidos`),
    onError: avisarError,
    onSettled: () => {
      setProgreso(null);
      refrescar();
    },
  });

  const borrar = async (e: Entrada) => {
    const destino = unir(ruta, e.nombre);
    const carpeta = e.tipo === "carpeta";
    const ok = await confirmar({
      titulo: carpeta ? "Borrar carpeta" : "Borrar archivo",
      mensaje: carpeta
        ? "Se borra la carpeta con TODO lo que tiene adentro. No se puede deshacer. Después se pedirá tu contraseña o huella."
        : "El archivo se borra del servidor. No se puede deshacer.",
      detalle: destino,
      peligroso: true,
      ...(carpeta ? { textoExacto: e.nombre } : {}),
      boton: "Borrar",
    });
    if (!ok) return;
    try {
      await api(`${base}?ruta=${encodeURIComponent(destino)}`, { metodo: "DELETE", cuerpo: carpeta ? { confirmacion: e.nombre } : {} });
      avisar(carpeta ? "Carpeta borrada" : "Archivo borrado");
      refrescar();
    } catch (err) {
      avisarError(err);
    }
  };

  const partes = ruta.split("/").filter(Boolean);

  return (
    <>
      <Encabezado
        titulo="Archivos"
        acciones={
          <>
            <SelectorServidor
              valor={servidor}
              alCambiar={(id) => {
                setServidor(id);
                setRuta("/root");
              }}
            />
            <Boton tamano="icono" icono={Search} aria-label="Buscar archivos" title="Buscar por nombre" onClick={() => setLupa((v) => !v)} disabled={!servidor} />
            <Boton tamano="icono" icono={TerminalSquare} aria-label="Abrir terminal aquí" title="Abrir terminal aquí" onClick={() => servidor && navegar(`/vps/terminal?servidor=${servidor}&cd=${encodeURIComponent(ruta)}`)} disabled={!servidor} />
            {puedeEscribir ? (
              <>
                <input
                  ref={input}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const archivos = Array.from(e.target.files ?? []);
                    if (archivos.length) subir.mutate(archivos);
                    e.target.value = "";
                  }}
                />
                <Boton icono={FolderPlus} onClick={() => setNuevaCarpeta(true)} disabled={!servidor}>
                  Carpeta
                </Boton>
                <Boton icono={Wand2} onClick={() => setOrganizar(true)} disabled={!servidor}>
                  Organizar
                </Boton>
                <Boton icono={Eraser} onClick={() => setLimpiar(true)} disabled={!servidor}>
                  Limpiar basura
                </Boton>
                <Boton variante="primario" icono={Upload} cargando={subir.isPending} onClick={() => input.current?.click()} disabled={!servidor}>
                  Subir aquí
                </Boton>
              </>
            ) : null}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <Boton tamano="icono" variante="fantasma" icono={ArrowUp} aria-label="Subir de nivel" onClick={() => setRuta(`/${partes.slice(0, -1).join("/")}`)} />
        <button type="button" className="rounded px-1 text-tenue hover:text-texto" onClick={() => setRuta("/")}>
          /
        </button>
        {partes.map((p, i) => (
          <button key={i} type="button" className="rounded px-1 hover:underline" onClick={() => setRuta(`/${partes.slice(0, i + 1).join("/")}`)}>
            {p} /
          </button>
        ))}
      </div>
      {lupa && servidor ? (
        <Busqueda
          base={base}
          ruta={ruta}
          alCerrar={() => setLupa(false)}
          alAbrir={(c) => {
            setRuta(c);
            setLupa(false);
          }}
        />
      ) : null}
      {organizar && servidor ? <Organizar base={base} ruta={ruta} alCerrar={() => setOrganizar(false)} alTerminar={refrescar} /> : null}
      {limpiar && servidor ? <Limpiar base={base} ruta={ruta} alCerrar={() => setLimpiar(false)} alTerminar={refrescar} /> : null}
      {progreso ? <p className="mb-2 text-xs text-tenue">{progreso}</p> : null}
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      {!servidor ? <Vacio icono={FolderTree} texto="Agrega un servidor en Terminal." /> : null}
      {data ? (
        <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
          {data.entradas.length === 0 ? <Vacio icono={Folder} texto="Carpeta vacía." /> : null}
          {data.entradas.map((e) => {
            const Icono = e.tipo === "carpeta" ? Folder : e.tipo === "enlace" ? Link2 : File;
            return (
              <div key={e.nombre} className="flex items-center gap-1 border-b border-borde px-3 py-2 text-sm last:border-0 hover:bg-tarjeta">
                <Icono className="mr-1 h-4 w-4 shrink-0 text-tenue" />
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => (e.tipo === "archivo" ? undefined : setRuta(unir(ruta, e.nombre)))}
                >
                  {e.nombre}
                </button>
                <span className="hidden w-20 text-right text-xs text-tenue sm:block">{e.tipo === "archivo" ? fmtBytes(e.tamano) : ""}</span>
                <span className="hidden w-36 text-xs text-tenue md:block">{fmtFechaHora(e.modificado)}</span>
                <span className="hidden w-10 font-mono text-xs text-tenue sm:block">{e.permisos}</span>
                {e.tipo === "archivo" ? (
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Download}
                    aria-label={`Descargar ${e.nombre}`}
                    onClick={() => void descargar(`${base}/descargar?ruta=${encodeURIComponent(unir(ruta, e.nombre))}`, e.nombre).catch(avisarError)}
                  />
                ) : (
                  <span className="w-9 shrink-0" />
                )}
                {e.tipo === "archivo" && EDITABLE.test(e.nombre) && e.tamano <= 1024 * 1024 ? (
                  <Boton tamano="icono" variante="fantasma" icono={FileEdit} aria-label={`Editar ${e.nombre}`} title="Editar texto" onClick={() => setEditar(unir(ruta, e.nombre))} />
                ) : null}
                {puedeEscribir ? (
                  <>
                    {e.tipo === "archivo" ? (
                      <Boton tamano="icono" variante="fantasma" icono={Send} aria-label={`Enviar ${e.nombre} a otro servidor`} title="Enviar a otro servidor" onClick={() => setEnviarRuta(unir(ruta, e.nombre))} />
                    ) : null}
                    <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label={`Renombrar ${e.nombre}`} onClick={() => setRenombrar(e)} />
                    <Boton
                      tamano="icono"
                      variante="fantasma"
                      icono={Trash2}
                      aria-label={`Borrar ${e.nombre}`}
                      className="hover:text-peligro"
                      onClick={() => void borrar(e)}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {nuevaCarpeta ? (
        <PedirNombre
          titulo="Nueva carpeta"
          inicial=""
          boton="Crear"
          alCerrar={() => setNuevaCarpeta(false)}
          alGuardar={async (n) => {
            await api(`${base}/carpeta`, { cuerpo: { ruta: unir(ruta, n) } });
            avisar("Carpeta creada");
            refrescar();
          }}
        />
      ) : null}
      {enviarRuta && servidor ? <EnviarAServidor origenId={servidor} ruta={enviarRuta} alCerrar={() => setEnviarRuta(null)} /> : null}
      {editar ? <EditorTexto base={base} ruta={editar} alCerrar={() => setEditar(null)} /> : null}
      {renombrar ? (
        <PedirNombre
          titulo={`Renombrar «${renombrar.nombre}»`}
          inicial={renombrar.nombre}
          boton="Renombrar"
          alCerrar={() => setRenombrar(null)}
          alGuardar={async (n) => {
            if (n === renombrar.nombre) return;
            await api(`${base}/renombrar`, { cuerpo: { de: unir(ruta, renombrar.nombre), a: unir(ruta, n) } });
            avisar("Renombrado");
            refrescar();
          }}
        />
      ) : null}
    </>
  );
}
