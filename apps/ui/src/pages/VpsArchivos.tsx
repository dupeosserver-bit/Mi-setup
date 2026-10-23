import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowUp,
  ChevronRight,
  Download,
  Eraser,
  File,
  FileCode2,
  FileEdit,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  HardDrive,
  Image as IconoImagen,
  Link2,
  Lock,
  Package,
  Pencil,
  Save,
  Search,
  Send,
  Star,
  TerminalSquare,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePaginado } from "../components/Paginas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Selector, Vacio, avisar, avisarError, cx } from "../components/ui";
import { EditorCodigo, PantallaCompleta } from "../components/vps/EditorCodigo";
import { PildorasServidor, SUAVE } from "../components/vps/piezas";
import { api, descargar } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes, fmtFechaHora } from "../lib/formato";
import { useForma } from "../lib/marco";
import { lenguajeDe } from "../lib/monaco";
import { useServidores } from "../lib/vps";

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

function nombreDe(ruta: string) {
  return ruta.split("/").pop() ?? ruta;
}

function carpetaDe(ruta: string) {
  return ruta.slice(0, ruta.lastIndexOf("/")) || "/";
}

function PestanaArchivo({ ruta, activa, cambiado, alElegir, alCerrar }: { ruta: string; activa: boolean; cambiado: boolean; alElegir: () => void; alCerrar: () => void }) {
  return (
    <div
      className={cx(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 pl-3 pr-1 text-xs",
        activa ? "border-acento bg-fondo text-texto" : "border-transparent text-tenue hover:text-texto",
      )}
    >
      <button type="button" onClick={alElegir} className="flex max-w-[12rem] items-center gap-1.5 truncate font-mono">
        <FileCode2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{nombreDe(ruta)}</span>
        {cambiado ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-aviso" aria-label="Sin guardar" /> : null}
      </button>
      <button type="button" onClick={alCerrar} className="grid h-6 w-6 place-items-center rounded-md hover:bg-tarjeta" aria-label={`Cerrar ${nombreDe(ruta)}`}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EditorCompleto({
  base,
  servidor,
  abiertos,
  activo,
  alElegir,
  alCerrarArchivo,
  alSalir,
}: {
  base: string;
  servidor: string;
  abiertos: string[];
  activo: string;
  alElegir: (ruta: string) => void;
  alCerrarArchivo: (ruta: string) => void;
  alSalir: () => void;
}) {
  const [textos, setTextos] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["vps", "texto", base, activo],
    queryFn: () => api<{ contenido: string }>(`${base}/texto?ruta=${encodeURIComponent(activo)}`),
    gcTime: 0,
  });
  const originales = useRef<Record<string, string>>({});
  if (q.data && originales.current[activo] === undefined) originales.current[activo] = q.data.contenido;
  const actual = textos[activo] ?? q.data?.contenido ?? "";
  const cambiadoEn = (r: string) => textos[r] !== undefined && textos[r] !== originales.current[r];
  const sinGuardar = abiertos.filter(cambiadoEn);
  const navegar = useNavigate();

  const guardar = useMutation({
    mutationFn: () => api<{ respaldo: string | null }>(`${base}/texto`, { metodo: "PUT", cuerpo: { ruta: activo, contenido: actual } }),
    onSuccess: (r) => {
      originales.current[activo] = actual;
      setTextos((t) => ({ ...t }));
      avisar(r.respaldo ? `Guardado (copia anterior en ${nombreDe(r.respaldo)})` : "Guardado");
      void queryClient.invalidateQueries({ queryKey: ["vps", "archivos"] });
    },
    onError: avisarError,
  });

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (cambiadoEn(activo)) guardar.mutate();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  });

  const cerrarArchivo = async (r: string) => {
    if (cambiadoEn(r) && !(await confirmar({ titulo: "Cerrar sin guardar", mensaje: `${nombreDe(r)} tiene cambios sin guardar.`, boton: "Cerrar" }))) return;
    setTextos(({ [r]: _, ...resto }) => resto);
    delete originales.current[r];
    alCerrarArchivo(r);
  };

  const salir = async () => {
    if (sinGuardar.length && !(await confirmar({ titulo: "Salir sin guardar", mensaje: `Hay ${sinGuardar.length} archivo(s) con cambios sin guardar.`, boton: "Salir" }))) return;
    alSalir();
  };

  const lineas = actual.split("\n").length;
  return (
    <PantallaCompleta
      titulo={
        <span className="flex items-baseline gap-2">
          {nombreDe(activo)}
          <span className="truncate font-mono text-xs font-normal text-tenue">{carpetaDe(activo)}</span>
        </span>
      }
      subtitulo={sinGuardar.length ? <span className="text-aviso">{sinGuardar.length === 1 ? "1 cambio sin guardar" : `${sinGuardar.length} archivos sin guardar`}</span> : "Todo guardado"}
      alCerrar={() => void salir()}
      acciones={
        <>
          <Boton tamano="sm" variante="fantasma" icono={TerminalSquare} className="hidden sm:inline-flex" onClick={() => navegar(`/vps/terminal?servidor=${servidor}&cd=${encodeURIComponent(carpetaDe(activo))}`)}>
            Terminal aquí
          </Boton>
          <Boton tamano="sm" variante="primario" icono={Save} cargando={guardar.isPending} disabled={!cambiadoEn(activo)} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-borde bg-superficie px-2 pt-1 [scrollbar-width:none]">
        {abiertos.map((r) => (
          <PestanaArchivo key={r} ruta={r} activa={r === activo} cambiado={cambiadoEn(r)} alElegir={() => alElegir(r)} alCerrar={() => void cerrarArchivo(r)} />
        ))}
      </div>
      <ErrorCaja error={q.error} />
      <div className="min-h-0 flex-1">
        {q.isLoading ? (
          <Cargando />
        ) : (
          <EditorCodigo key={activo} ruta={`${servidor}:${activo}`} lenguaje={lenguajeDe(nombreDe(activo))} valor={actual} alCambiar={(v) => setTextos((t) => ({ ...t, [activo]: v }))} />
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-borde bg-superficie px-3 py-1.5 text-[11px] text-tenue">
        <span className="uppercase">{lenguajeDe(nombreDe(activo))}</span>
        <span>UTF-8</span>
        <span>{`${lineas} líneas`}</span>
        <span className="flex-1 truncate">Al guardar se deja una copia .bak del anterior</span>
      </div>
    </PantallaCompleta>
  );
}

function iconoDe(e: Entrada) {
  if (e.tipo === "carpeta") return { Icono: Folder, tono: SUAVE.acento };
  if (e.tipo === "enlace") return { Icono: Link2, tono: SUAVE.neutro };
  const n = e.nombre.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/.test(n)) return { Icono: IconoImagen, tono: "bg-[color-mix(in_srgb,#ec4899_14%,transparent)] text-pink-300" };
  if (/\.(zip|tar|gz|tgz|7z|rar|xz|apk|exe|jar)$/.test(n)) return { Icono: Package, tono: SUAVE.aviso };
  if (/\.(sh|bash|py|js|ts|mjs|cjs|php)$/.test(n)) return { Icono: TerminalSquare, tono: SUAVE.ok };
  if (/^\.env|\.(key|pem)$/.test(n)) return { Icono: Lock, tono: SUAVE.peligro };
  if (/\.(ya?ml|json|toml|conf|cfg|ini|properties|xml)$/.test(n)) return { Icono: FileCode2, tono: "bg-[color-mix(in_srgb,#4c8dff_14%,transparent)] text-sky-300" };
  return { Icono: FileText, tono: SUAVE.neutro };
}

function Permisos({ valor }: { valor: string }) {
  const digitos = /^[0-7]{3,4}$/.test(valor) ? valor.slice(-3).split("").map(Number) : null;
  if (!digitos) return <p className="font-mono text-xs text-tenue">{valor}</p>;
  const filas = ["Dueño", "Grupo", "Otros"];
  const cols = [
    ["Leer", 4],
    ["Escribir", 2],
    ["Ejecutar", 1],
  ] as const;
  return (
    <div className="rounded-xl border border-borde bg-fondo p-3 text-xs">
      <div className="grid grid-cols-[1fr_repeat(3,3.5rem)] items-center gap-y-2 text-center">
        <span />
        {cols.map(([n]) => (
          <span key={n} className="text-tenue">{n}</span>
        ))}
        {filas.map((f, i) => (
          <div key={f} className="contents">
            <span className="text-left">{f}</span>
            {cols.map(([n, bit]) => {
              const si = ((digitos[i] ?? 0) & bit) !== 0;
              return (
                <span key={n} className="grid place-items-center">
                  <span className={cx("grid h-5 w-5 place-items-center rounded-md border", si ? "border-acento bg-acento text-fondo" : "border-borde")}>{si ? "✓" : ""}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function VistaPrevia({ base, ruta }: { base: string; ruta: string }) {
  const q = useQuery({ queryKey: ["vps", "texto", base, ruta], queryFn: () => api<{ contenido: string }>(`${base}/texto?ruta=${encodeURIComponent(ruta)}`), staleTime: 30_000 });
  if (q.isLoading) return <div className="h-32 animate-pulse rounded-xl bg-fondo" />;
  if (!q.data) return null;
  const lineas = q.data.contenido.split("\n").slice(0, 12);
  return (
    <pre className="max-h-48 overflow-hidden rounded-xl border border-borde bg-fondo py-2 font-mono text-[11px] leading-5">
      {lineas.map((l, i) => (
        <div key={i} className="flex">
          <span className="w-7 shrink-0 select-none pr-2 text-right text-tenue">{i + 1}</span>
          <span className="overflow-hidden text-ellipsis whitespace-pre pr-2">{l || " "}</span>
        </div>
      ))}
    </pre>
  );
}

function DetalleArchivo({
  base,
  ruta,
  e,
  puedeEscribir,
  alEditar,
  alEnviar,
  alRenombrar,
  alBorrar,
}: {
  base: string;
  ruta: string;
  e: Entrada;
  puedeEscribir: boolean;
  alEditar: () => void;
  alEnviar: () => void;
  alRenombrar: () => void;
  alBorrar: () => void;
}) {
  const destino = unir(ruta, e.nombre);
  const { Icono, tono } = iconoDe(e);
  const editable = e.tipo === "archivo" && EDITABLE.test(e.nombre) && e.tamano <= 1024 * 1024;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-xl", tono)}>
          <Icono className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{e.nombre}</p>
          <p className="text-xs text-tenue">
            {`${e.tipo === "carpeta" ? "Carpeta" : fmtBytes(e.tamano)} · cambiado ${fmtFechaHora(e.modificado)}`}
          </p>
        </div>
      </div>
      {editable && e.tamano <= 256 * 1024 ? <VistaPrevia base={base} ruta={destino} /> : null}
      {editable ? (
        <Boton variante="primario" icono={FileEdit} onClick={alEditar}>
          Editar texto
        </Boton>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {e.tipo === "archivo" ? (
          <Boton tamano="sm" icono={Download} onClick={() => void descargar(`${base}/descargar?ruta=${encodeURIComponent(destino)}`, e.nombre).catch(avisarError)}>
            Descargar
          </Boton>
        ) : null}
        {puedeEscribir && e.tipo === "archivo" ? (
          <Boton tamano="sm" icono={Send} onClick={alEnviar}>
            Enviar a otro
          </Boton>
        ) : null}
        {puedeEscribir ? (
          <Boton tamano="sm" icono={Pencil} onClick={alRenombrar}>
            Renombrar
          </Boton>
        ) : null}
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
          Permisos <span className="rounded-md bg-tarjeta px-1.5 py-0.5 font-mono text-xs text-tenue">{e.permisos}</span>
        </p>
        <Permisos valor={e.permisos} />
      </div>
      <div>
        <p className="text-xs text-tenue">Ruta</p>
        <p className="break-all font-mono text-xs">{destino}</p>
      </div>
      {puedeEscribir ? (
        <Boton variante="fantasma" icono={Trash2} className="mt-1 border border-borde text-peligro" onClick={alBorrar}>
          Borrar {e.tipo === "carpeta" ? "carpeta" : "archivo"}
        </Boton>
      ) : null}
    </div>
  );
}

const ACCESOS = [
  { ruta: "/root", nombre: "Inicio (root)" },
  { ruta: "/root/mi-setup", nombre: "Mi Setup" },
  { ruta: "/root/mi-setup/descargas", nombre: "Descargas de la app" },
  { ruta: "/root/mi-setup/backups", nombre: "Respaldos" },
  { ruta: "/var/www", nombre: "Páginas web" },
];

function Carpetas({ ruta, subcarpetas, alIr }: { ruta: string; subcarpetas: string[]; alIr: (r: string) => void }) {
  const partes = ruta.split("/").filter(Boolean);
  const cadena = partes.map((p, i) => ({ nombre: p, ruta: `/${partes.slice(0, i + 1).join("/")}` }));
  return (
    <nav className="flex min-w-0 flex-col gap-0.5 text-sm" aria-label="Carpetas">
      <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-tenue">Carpetas</p>
      <button type="button" onClick={() => alIr("/")} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-tenue hover:bg-tarjeta hover:text-texto">
        <HardDrive className="h-4 w-4" />/
      </button>
      {cadena.map((c, i) => (
        <button
          key={c.ruta}
          type="button"
          onClick={() => alIr(c.ruta)}
          style={{ paddingLeft: `${0.5 + (i + 1) * 0.75}rem` }}
          className={cx("flex items-center gap-2 truncate rounded-lg py-1.5 pr-2", c.ruta === ruta ? "bg-tarjeta font-semibold text-texto" : "text-tenue hover:bg-tarjeta hover:text-texto")}
        >
          {c.ruta === ruta ? <FolderOpen className="h-4 w-4 shrink-0 text-acento" /> : <Folder className="h-4 w-4 shrink-0" />}
          <span className="truncate">{c.nombre}</span>
        </button>
      ))}
      {subcarpetas.slice(0, 30).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => alIr(unir(ruta, s))}
          style={{ paddingLeft: `${0.5 + (cadena.length + 1) * 0.75}rem` }}
          className="flex items-center gap-2 truncate rounded-lg py-1.5 pr-2 text-tenue hover:bg-tarjeta hover:text-texto"
        >
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <Folder className="h-4 w-4 shrink-0" />
          <span className="truncate">{s}</span>
        </button>
      ))}
      <p className="mt-3 px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-tenue">Accesos</p>
      {ACCESOS.map((a) => (
        <button key={a.ruta} type="button" onClick={() => alIr(a.ruta)} className="flex items-center gap-2 truncate rounded-lg px-2 py-1.5 text-tenue hover:bg-tarjeta hover:text-texto">
          <Star className="h-4 w-4 shrink-0" />
          <span className="truncate">{a.nombre}</span>
        </button>
      ))}
    </nav>
  );
}

export default function VpsArchivos() {
  const [params] = useSearchParams();
  const [servidor, setServidor] = useState<string | null>(() => params.get("servidor"));
  const [ruta, setRuta] = useState(() => params.get("ruta") || "/root");
  const navegar = useNavigate();
  const forma = useForma();
  const [nuevaCarpeta, setNuevaCarpeta] = useState(false);
  const [renombrar, setRenombrar] = useState<Entrada | null>(null);
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const [activo, setActivo] = useState<string | null>(null);
  const [enviarRuta, setEnviarRuta] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [lupa, setLupa] = useState(false);
  const [organizar, setOrganizar] = useState(false);
  const [limpiar, setLimpiar] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
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
  const pg = usePaginado(data?.entradas, 25);
  const seleccion = data?.entradas.find((e) => e.nombre === elegido) ?? null;
  const subcarpetas = (data?.entradas ?? []).filter((e) => e.tipo === "carpeta").map((e) => e.nombre);
  const nombreServidor = useServidores().data?.find((s) => s.id === servidor)?.nombre ?? "";

  const ir = (r: string) => {
    setRuta(r || "/");
    setElegido(null);
  };

  const abrirEditor = (r: string) => {
    setAbiertos((l) => (l.includes(r) ? l : [...l, r]));
    setActivo(r);
  };

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
      if (elegido === e.nombre) setElegido(null);
      refrescar();
    } catch (err) {
      avisarError(err);
    }
  };

  if (activo && servidor) {
    return (
      <EditorCompleto
        base={base}
        servidor={servidor}
        abiertos={abiertos}
        activo={activo}
        alElegir={setActivo}
        alCerrarArchivo={(r) => {
          const resto = abiertos.filter((x) => x !== r);
          setAbiertos(resto);
          setActivo(resto.at(-1) ?? null);
        }}
        alSalir={() => {
          setAbiertos([]);
          setActivo(null);
          refrescar();
        }}
      />
    );
  }

  const partes = ruta.split("/").filter(Boolean);
  const detalle = seleccion ? (
    <DetalleArchivo
      base={base}
      ruta={ruta}
      e={seleccion}
      puedeEscribir={puedeEscribir}
      alEditar={() => abrirEditor(unir(ruta, seleccion.nombre))}
      alEnviar={() => setEnviarRuta(unir(ruta, seleccion.nombre))}
      alRenombrar={() => setRenombrar(seleccion)}
      alBorrar={() => void borrar(seleccion)}
    />
  ) : null;
  const pc = forma === "pc";

  const tabla = (
    <section className="min-w-0 overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_4rem_8.5rem] gap-3 border-b border-borde px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-tenue md:grid">
        <span className="pl-11">Nombre</span>
        <span>Tamaño</span>
        <span>Permisos</span>
        <span />
      </div>
      {data?.entradas.length === 0 ? <Vacio icono={Folder} texto="Carpeta vacía." /> : null}
      <ul className="p-1.5">
        {pg.visibles.map((e) => {
          const { Icono, tono } = iconoDe(e);
          const destino = unir(ruta, e.nombre);
          const editable = e.tipo === "archivo" && EDITABLE.test(e.nombre) && e.tamano <= 1024 * 1024;
          return (
            <li
              key={e.nombre}
              className={cx(
                "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-2.5 py-1.5 text-sm md:grid-cols-[minmax(0,1fr)_5.5rem_4rem_8.5rem]",
                elegido === e.nombre ? "border-[color-mix(in_srgb,var(--acento)_45%,transparent)] bg-tarjeta" : "border-transparent hover:bg-tarjeta",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 items-center gap-3 text-left"
                onClick={() => (e.tipo === "archivo" ? setElegido(e.nombre) : ir(destino))}
                onDoubleClick={() => (editable ? abrirEditor(destino) : undefined)}
              >
                <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tono)}>
                  <Icono className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{e.nombre}</span>
                  <span className="block truncate text-xs text-tenue">
                    <span className="md:hidden">{e.tipo === "archivo" ? `${fmtBytes(e.tamano)} · ` : ""}</span>
                    {fmtFechaHora(e.modificado)}
                  </span>
                </span>
              </button>
              <span className="hidden text-xs text-tenue md:block">{e.tipo === "archivo" ? fmtBytes(e.tamano) : "—"}</span>
              <span className="hidden font-mono text-xs text-tenue md:block">{e.permisos}</span>
              <span className="flex items-center justify-end gap-0.5">
                {e.tipo === "archivo" ? (
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Download}
                    className="hidden sm:inline-flex"
                    aria-label={`Descargar ${e.nombre}`}
                    onClick={() => void descargar(`${base}/descargar?ruta=${encodeURIComponent(destino)}`, e.nombre).catch(avisarError)}
                  />
                ) : null}
                {editable ? <Boton tamano="icono" variante="fantasma" icono={FileEdit} aria-label={`Editar ${e.nombre}`} title="Editar texto" onClick={() => abrirEditor(destino)} /> : null}
                {puedeEscribir ? (
                  <>
                    <Boton tamano="icono" variante="fantasma" icono={Pencil} className="hidden lg:inline-flex" aria-label={`Renombrar ${e.nombre}`} onClick={() => setRenombrar(e)} />
                    <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label={`Borrar ${e.nombre}`} className="hover:text-peligro" onClick={() => void borrar(e)} />
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="px-2 pb-2">{pg.paginas}</div>
    </section>
  );

  return (
    <>
      <Encabezado
        titulo="Archivos"
        descripcion="Los archivos de tu servidor. Al guardar un archivo se deja una copia .bak del anterior."
        acciones={
          <>
            <PildorasServidor
              valor={servidor}
              alCambiar={(id) => {
                setServidor(id);
                ir("/root");
              }}
            />
            <Boton tamano="icono" icono={Search} aria-label="Buscar archivos" title="Buscar por nombre" onClick={() => setLupa((v) => !v)} disabled={!servidor} />
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-borde bg-superficie p-1 text-sm [scrollbar-width:none]">
          <Boton tamano="icono" variante="fantasma" icono={ArrowUp} aria-label="Subir de nivel" onClick={() => ir(`/${partes.slice(0, -1).join("/")}`)} />
          <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tenue hover:text-texto" onClick={() => ir("/")} aria-label="Raíz">
            <HardDrive className="h-4 w-4" />
          </button>
          {partes.map((p, i) => (
            <span key={i} className="flex shrink-0 items-center">
              <ChevronRight className="h-3.5 w-3.5 text-tenue" />
              <button
                type="button"
                className={cx("rounded-lg px-2 py-1 font-mono text-xs", i === partes.length - 1 ? "bg-tarjeta text-texto" : "text-tenue hover:text-texto")}
                onClick={() => ir(`/${partes.slice(0, i + 1).join("/")}`)}
              >
                {p}
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              <Boton tamano="sm" icono={FolderPlus} onClick={() => setNuevaCarpeta(true)} disabled={!servidor}>
                Carpeta
              </Boton>
              <Boton tamano="sm" icono={Wand2} onClick={() => setOrganizar(true)} disabled={!servidor}>
                Organizar
              </Boton>
              <Boton tamano="sm" icono={Eraser} onClick={() => setLimpiar(true)} disabled={!servidor}>
                Limpiar basura
              </Boton>
            </>
          ) : null}
          <Boton tamano="sm" icono={TerminalSquare} onClick={() => servidor && navegar(`/vps/terminal?servidor=${servidor}&cd=${encodeURIComponent(ruta)}`)} disabled={!servidor}>
            Abrir terminal aquí
          </Boton>
          {puedeEscribir ? (
            <Boton tamano="sm" variante="primario" icono={Upload} cargando={subir.isPending} onClick={() => input.current?.click()} disabled={!servidor}>
              Subir aquí
            </Boton>
          ) : null}
        </div>
      </div>
      {lupa && servidor ? (
        <Busqueda
          base={base}
          ruta={ruta}
          alCerrar={() => setLupa(false)}
          alAbrir={(c) => {
            ir(c);
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
        pc ? (
          <div className="grid items-start gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_20rem] lg:grid-cols-[minmax(0,1fr)_19rem]">
            <aside className="hidden rounded-tarjeta border border-borde bg-superficie p-2 xl:block">
              <Carpetas ruta={ruta} subcarpetas={subcarpetas} alIr={ir} />
            </aside>
            {tabla}
            <aside className="rounded-tarjeta border border-borde bg-superficie p-4">
              {detalle ?? (
                <div className="py-8 text-center text-sm text-tenue">
                  <File className="mx-auto mb-2 h-8 w-8" />
                  Toca un archivo para ver sus datos.
                  {nombreServidor ? <p className="mt-1 text-xs">{`Servidor: ${nombreServidor}`}</p> : null}
                </div>
              )}
            </aside>
          </div>
        ) : (
          tabla
        )
      ) : null}
      {!pc && seleccion ? (
        <Modal abierto titulo={seleccion.nombre} alCerrar={() => setElegido(null)}>
          {detalle}
        </Modal>
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
            if (elegido === renombrar.nombre) setElegido(n);
            refrescar();
          }}
        />
      ) : null}
    </>
  );
}
