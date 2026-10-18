/** Explorador SFTP: navegar, descargar, subir (varios a la vez), crear carpetas, renombrar y borrar. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, Download, File, Folder, FolderPlus, FolderTree, Link2, Pencil, Trash2, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Vacio, avisar, avisarError } from "../components/ui";
import { api, descargar } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes, fmtFechaHora } from "../lib/formato";
import { SelectorServidor } from "../lib/vps";

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

export default function VpsArchivos() {
  const [servidor, setServidor] = useState<string | null>(null);
  const [ruta, setRuta] = useState("/root");
  const [nuevaCarpeta, setNuevaCarpeta] = useState(false);
  const [renombrar, setRenombrar] = useState<Entrada | null>(null);
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
                {puedeEscribir ? (
                  <>
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
