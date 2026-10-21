/** Compartir archivos por enlace, tipo Mega o MediaFire: subes, copias el enlace y tu amigo descarga. */
import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, HardDrive, Lock, Share2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
import { API_BASE, api, refrescar } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes, fmtFecha } from "../lib/formato";
import { useSesion } from "../lib/sesion";

interface Compartido {
  id: string;
  codigo: string;
  nombre: string;
  tamano: number;
  conClave: boolean;
  caduca: string | null;
  caducado: boolean;
  limite: number | null;
  descargas: number;
  creado: string;
}

const enlace = (codigo: string) => `${API_BASE || window.location.origin}/s/${codigo}`;

/** Subida con barra de progreso (fetch no informa el avance). */
function subir(archivo: File, query: string, alAvance: (pct: number) => void): Promise<{ codigo: string }> {
  const intentar = (reintento: boolean) =>
    new Promise<{ codigo: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/compartir?${query}`);
      const token = useSesion.getState().accessToken;
      if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && alAvance(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        if (xhr.status === 401 && !reintento) {
          void refrescar().then((ok) => (ok ? intentar(true).then(resolve, reject) : reject(new Error("Tu sesión venció"))));
          return;
        }
        let datos: { codigo?: string; error?: string } = {};
        try {
          datos = JSON.parse(xhr.responseText) as typeof datos;
        } catch {
          /* respuesta vacía */
        }
        if (xhr.status >= 200 && xhr.status < 300 && datos.codigo) resolve({ codigo: datos.codigo });
        else reject(new Error(datos.error ?? `No se pudo subir (error ${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Se cortó la conexión al subir"));
      const fd = new FormData();
      fd.append("archivo", archivo);
      xhr.send(fd);
    });
  return intentar(false);
}

export default function Compartir() {
  const puede = usePuede("compartir", "escritura");
  const lista = useQuery({ queryKey: ["compartir"], queryFn: () => api<{ usoTotal: number; archivos: Compartido[] }>("/api/compartir") });
  const input = useRef<HTMLInputElement>(null);
  const [clave, setClave] = useState("");
  const [dias, setDias] = useState("7");
  const [limite, setLimite] = useState("");
  const [avance, setAvance] = useState<number | null>(null);
  const refrescarLista = () => void queryClient.invalidateQueries({ queryKey: ["compartir"] });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/compartir/${id}`, { metodo: "DELETE" }), onSuccess: refrescarLista, onError: avisarError });

  const alElegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    if (archivo.size > 2 * 1024 ** 3) return avisar("El archivo pesa más de 2 GB", "error");
    const q = new URLSearchParams();
    if (clave) q.set("clave", clave);
    if (Number(dias) > 0) q.set("dias", dias);
    if (Number(limite) > 0) q.set("limite", limite);
    setAvance(0);
    try {
      const r = await subir(archivo, q.toString(), setAvance);
      refrescarLista();
      setClave("");
      await navigator.clipboard.writeText(enlace(r.codigo)).then(
        () => avisar("Listo: el enlace ya está copiado, pégalo en WhatsApp"),
        () => avisar("Listo: copia el enlace de la lista"),
      );
    } catch (err) {
      avisarError(err);
    } finally {
      setAvance(null);
    }
  };

  const pag248 = usePaginado(lista.data?.archivos, 20);
  return (
    <>
    <div className="space-y-4">
      <Encabezado titulo="Compartir archivos" descripcion="Sube un archivo y manda el enlace: quien lo abra lo descarga, sin cuenta." />
      {lista.data ? (
        <p className="flex items-center gap-2 text-sm text-tenue">
          <HardDrive className="h-4 w-4" /> Espacio usado por archivos compartidos: <b className="text-texto">{fmtBytes(lista.data.usoTotal)}</b>
        </p>
      ) : null}
      {puede ? (
        <Tarjeta titulo="Subir archivo" icono={Upload}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Campo etiqueta="Contraseña (opcional)">
                <Entrada type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Sin contraseña" autoComplete="new-password" />
              </Campo>
              <Campo etiqueta="Caduca en (días)">
                <Entrada type="number" min={0} max={365} value={dias} onChange={(e) => setDias(e.target.value)} placeholder="0 = nunca" />
              </Campo>
              <Campo etiqueta="Máximo de descargas">
                <Entrada type="number" min={0} value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="Sin límite" />
              </Campo>
            </div>
            <input ref={input} type="file" className="hidden" onChange={(e) => void alElegir(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
            <Boton variante="primario" icono={Upload} disabled={avance !== null} onClick={() => input.current?.click()}>
              {avance === null ? "Elegir archivo (hasta 2 GB)" : `Subiendo… ${avance}%`}
            </Boton>
            {avance !== null ? (
              <div className="h-2 overflow-hidden rounded-full bg-tarjeta">
                <div className="h-full bg-acento transition-all" style={{ width: `${avance}%` }} />
              </div>
            ) : null}
          </div>
        </Tarjeta>
      ) : null}
      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      {lista.data?.archivos.length === 0 ? <Vacio icono={Share2} texto="Todavía no compartes archivos." /> : null}
      <div className="space-y-2">
        {pag248.visibles.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.nombre}</p>
              <p className="text-xs text-tenue">
                {fmtBytes(f.tamano)} · {f.descargas} descarga{f.descargas === 1 ? "" : "s"}
                {f.limite ? ` de ${f.limite}` : ""} · {f.caduca ? `caduca ${fmtFecha(f.caduca)}` : "no caduca"}
              </p>
              <div className="mt-1 flex gap-1">
                {f.conClave ? (
                  <Insignia>
                    <Lock className="mr-1 h-3 w-3" /> Con contraseña
                  </Insignia>
                ) : null}
                {f.caducado ? <Insignia tono="aviso">Ya no disponible</Insignia> : null}
              </div>
            </div>
            <Boton tamano="sm" icono={Copy} onClick={() => void navigator.clipboard.writeText(enlace(f.codigo)).then(() => avisar("Enlace copiado"))}>
              Copiar enlace
            </Boton>
            {puede ? (
              <Boton
                tamano="icono"
                variante="fantasma"
                icono={Trash2}
                aria-label="Borrar"
                onClick={async () => {
                  if (await confirmar({ titulo: "Borrar archivo", mensaje: `${f.nombre} se borra del servidor y el enlace deja de funcionar.`, boton: "Borrar" })) borrar.mutate(f.id);
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
    {pag248.paginas}
    </>
  );
}
