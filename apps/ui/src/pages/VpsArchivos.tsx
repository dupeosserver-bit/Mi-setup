/** Explorador SFTP: navegar, descargar y subir archivos. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, Download, File, Folder, FolderTree, Link2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Boton, Cargando, Encabezado, ErrorCaja, Vacio, avisar, avisarError } from "../components/ui";
import { api, descargar } from "../lib/api";
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

export default function VpsArchivos() {
  const [servidor, setServidor] = useState<string | null>(null);
  const [ruta, setRuta] = useState("/root");
  const puedeSubir = usePuede("vps_archivos", "escritura");
  const input = useRef<HTMLInputElement>(null);
  const clave = ["vps", "archivos", servidor, ruta];
  const { data, isLoading, error } = useQuery({
    queryKey: clave,
    queryFn: () => api<{ ruta: string; entradas: Entrada[] }>(`/api/vps/servidores/${servidor}/archivos?ruta=${encodeURIComponent(ruta)}`),
    enabled: Boolean(servidor),
  });

  const subir = useMutation({
    mutationFn: (archivo: File) => {
      const datos = new FormData();
      datos.append("archivo", archivo);
      return api(`/api/vps/servidores/${servidor}/archivos/subir?ruta=${encodeURIComponent(ruta)}`, { formulario: datos });
    },
    onSuccess: () => {
      avisar("Archivo subido");
      void queryClient.invalidateQueries({ queryKey: clave });
    },
    onError: avisarError,
  });

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
            {puedeSubir ? (
              <>
                <input
                  ref={input}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) subir.mutate(f);
                    e.target.value = "";
                  }}
                />
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
        <button type="button" className="rounded px-1 text-tenue hover:text-texto" onClick={() => setRuta("/")}>/</button>
        {partes.map((p, i) => (
          <button key={i} type="button" className="rounded px-1 hover:underline" onClick={() => setRuta(`/${partes.slice(0, i + 1).join("/")}`)}>
            {p} /
          </button>
        ))}
      </div>
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      {!servidor ? <Vacio icono={FolderTree} texto="Agrega un servidor en Terminal." /> : null}
      {data ? (
        <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
          {data.entradas.length === 0 ? <Vacio icono={Folder} texto="Carpeta vacía." /> : null}
          {data.entradas.map((e) => {
            const Icono = e.tipo === "carpeta" ? Folder : e.tipo === "enlace" ? Link2 : File;
            return (
              <div key={e.nombre} className="flex items-center gap-3 border-b border-borde px-3 py-2 text-sm last:border-0 hover:bg-tarjeta">
                <Icono className="h-4 w-4 shrink-0 text-tenue" />
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
                    onClick={() =>
                      void descargar(`/api/vps/servidores/${servidor}/archivos/descargar?ruta=${encodeURIComponent(unir(ruta, e.nombre))}`, e.nombre).catch(avisarError)
                    }
                  />
                ) : (
                  <span className="w-9" />
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
