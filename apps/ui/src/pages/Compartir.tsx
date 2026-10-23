import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Download, File as IconoArchivo, HardDrive, Lock, Share2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
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
          void 0;
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

const DIAS = [
  { v: "1", t: "1 día" },
  { v: "3", t: "3 días" },
  { v: "7", t: "7 días" },
  { v: "30", t: "30 días" },
  { v: "0", t: "Nunca" },
];

function VistaReceptor({ nombre, conClave, dias, limite }: { nombre: string | null; conClave: boolean; dias: string; limite: string }) {
  return (
    <div className="mx-auto w-full max-w-[17rem] rounded-[2.2rem] border-[6px] border-[#2a2735] bg-[#0f0d16] p-3 shadow-xl">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-[#2a2735]" />
      <div className="space-y-3 rounded-2xl bg-[#17151f] p-4 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--acento)_18%,transparent)] text-acento">
          <IconoArchivo className="h-7 w-7" />
        </span>
        <div>
          <p className="truncate text-sm font-semibold text-white">{nombre ?? "tu-archivo.zip"}</p>
          <p className="text-[11px] text-[#9a96b0]">
            Te compartieron un archivo
            {Number(dias) > 0 ? (dias === "1" ? " · disponible 1 día" : ` · disponible ${dias} días`) : ""}
            {Number(limite) > 0 ? (limite === "1" ? " · 1 descarga" : ` · ${limite} descargas`) : ""}
          </p>
        </div>
        {conClave ? (
          <div className="flex h-9 items-center gap-2 rounded-xl border border-[#2a2735] px-3 text-left text-xs text-[#625e77]">
            <Lock className="h-3.5 w-3.5" /> Contraseña
          </div>
        ) : null}
        <div className="flex h-10 items-center justify-center gap-2 rounded-xl bg-acento text-sm font-semibold text-fondo">
          <Download className="h-4 w-4" /> Descargar
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-[#625e77]">Así lo ve quien abre tu enlace</p>
    </div>
  );
}

export default function Compartir() {
  const puede = usePuede("compartir", "escritura");
  const lista = useQuery({ queryKey: ["compartir"], queryFn: () => api<{ usoTotal: number; archivos: Compartido[] }>("/api/compartir") });
  const input = useRef<HTMLInputElement>(null);
  const [conClave, setConClave] = useState(false);
  const [clave, setClave] = useState("");
  const [dias, setDias] = useState("7");
  const [conLimite, setConLimite] = useState(false);
  const [limite, setLimite] = useState("10");
  const [elegido, setElegido] = useState<File | null>(null);
  const [encima, setEncima] = useState(false);
  const [avance, setAvance] = useState<number | null>(null);
  const refrescarLista = () => void queryClient.invalidateQueries({ queryKey: ["compartir"] });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/compartir/${id}`, { metodo: "DELETE" }), onSuccess: refrescarLista, onError: avisarError });

  const enviar = async () => {
    const archivo = elegido;
    if (!archivo) return;
    if (archivo.size > 2 * 1024 ** 3) return avisar("El archivo pesa más de 2 GB", "error");
    const q = new URLSearchParams();
    if (conClave && clave) q.set("clave", clave);
    if (Number(dias) > 0) q.set("dias", dias);
    if (conLimite && Number(limite) > 0) q.set("limite", limite);
    setAvance(0);
    try {
      const r = await subir(archivo, q.toString(), setAvance);
      refrescarLista();
      setClave("");
      setElegido(null);
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

  const pg = usePaginado(lista.data?.archivos, 12);
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Compartir archivos"
        descripcion="Sube un archivo y manda el enlace: quien lo abra lo descarga, sin cuenta."
        acciones={
          lista.data ? (
            <span className="flex items-center gap-2 text-sm text-tenue">
              <HardDrive className="h-4 w-4" /> Usado: <b className="text-texto">{fmtBytes(lista.data.usoTotal)}</b>
            </span>
          ) : null
        }
      />
      {puede ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Tarjeta titulo="Preparar" icono={Upload}>
            <div className="space-y-4">
              <input
                ref={input}
                type="file"
                className="hidden"
                onChange={(e) => {
                  setElegido(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setEncima(true);
                }}
                onDragLeave={() => setEncima(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setEncima(false);
                  setElegido(e.dataTransfer.files[0] ?? null);
                }}
                className={cx(
                  "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
                  encima ? "border-acento bg-[color-mix(in_srgb,var(--acento)_10%,transparent)]" : "border-borde bg-fondo hover:border-tenue",
                )}
              >
                <Upload className="h-7 w-7 text-acento" />
                <span className="max-w-full truncate font-semibold">{elegido ? elegido.name : "Suelta un archivo aquí"}</span>
                <span className="text-xs text-tenue">{elegido ? fmtBytes(elegido.size) : "o toca para elegirlo · hasta 2 GB"}</span>
              </button>

              <div className="space-y-2 rounded-2xl bg-fondo p-3">
                <Interruptor activo={conClave} alCambiar={setConClave} etiqueta="Pedir contraseña" />
                {conClave ? <Entrada type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Contraseña para descargar" autoComplete="new-password" /> : null}
              </div>
              <div className="space-y-2 rounded-2xl bg-fondo p-3">
                <p className="text-sm">Caduca en</p>
                <div className="flex flex-wrap gap-2">
                  {DIAS.map((d) => (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() => setDias(d.v)}
                      className={cx(
                        "rounded-full border px-3 py-1 text-xs",
                        dias === d.v ? "border-acento bg-[color-mix(in_srgb,var(--acento)_14%,transparent)] text-acento" : "border-borde text-tenue",
                      )}
                    >
                      {d.t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 rounded-2xl bg-fondo p-3">
                <Interruptor activo={conLimite} alCambiar={setConLimite} etiqueta="Límite de descargas" />
                {conLimite ? <Entrada type="number" min={1} value={limite} onChange={(e) => setLimite(e.target.value)} /> : null}
              </div>

              <Boton variante="primario" className="w-full" icono={Share2} disabled={!elegido || avance !== null || (conClave && !clave)} onClick={() => void enviar()}>
                {avance === null ? "Subir y copiar enlace" : `Subiendo… ${avance}%`}
              </Boton>
              {avance !== null ? (
                <div className="h-2 overflow-hidden rounded-full bg-tarjeta">
                  <div className="h-full bg-acento transition-all" style={{ width: `${avance}%` }} />
                </div>
              ) : null}
            </div>
          </Tarjeta>
          <div className="flex items-center justify-center rounded-tarjeta border border-borde bg-superficie p-4">
            <VistaReceptor nombre={elegido?.name ?? null} conClave={conClave} dias={dias} limite={conLimite ? limite : ""} />
          </div>
        </div>
      ) : null}

      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      {lista.data?.archivos.length === 0 ? <Vacio icono={Share2} texto="Todavía no compartes archivos." /> : null}
      {lista.data?.archivos.length ? (
        <Tarjeta titulo="Lo que compartiste">
          <div className="space-y-2">
            {pg.visibles.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-fondo p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tarjeta text-[10px] font-bold uppercase text-tenue">
                  {(f.nombre.split(".").pop() ?? "").slice(0, 4) || "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.nombre}</p>
                  <p className="text-xs text-tenue">
                    {fmtBytes(f.tamano)} · {f.descargas} descarga{f.descargas === 1 ? "" : "s"}
                    {f.limite ? ` de ${f.limite}` : ""} · {f.caduca ? `caduca ${fmtFecha(f.caduca)}` : "no caduca"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
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
          {pg.paginas}
        </Tarjeta>
      ) : null}
    </div>
  );
}
