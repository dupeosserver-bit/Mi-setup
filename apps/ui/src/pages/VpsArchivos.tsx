/** Explorador SFTP: navegar, descargar, subir (varios a la vez), crear carpetas, renombrar y borrar. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, Download, File, FileEdit, Folder, FolderPlus, FolderTree, Link2, Pencil, Save, Send, Trash2, Upload } from "lucide-react";
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

export default function VpsArchivos() {
  const [servidor, setServidor] = useState<string | null>(null);
  const [ruta, setRuta] = useState("/root");
  const [nuevaCarpeta, setNuevaCarpeta] = useState(false);
  const [renombrar, setRenombrar] = useState<Entrada | null>(null);
  const [editar, setEditar] = useState<string | null>(null);
  const [enviarRuta, setEnviarRuta] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
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
