/** Respaldos: crear copias (carpetas, Pterodactyl, VPS completo), base de datos de Mi Setup y servidores de juego. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, Boxes, Database, Download, FileJson, FolderArchive, Gamepad2, HardDrive, Loader2, Server, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api, descargar } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { copiarSeguro } from "../lib/boveda/utilidades";
import { queryClient, useMe, usePuede } from "../lib/consultas";
import { fmtBytes, fmtFechaHora, haceCuanto } from "../lib/formato";
import { RespaldosServidor } from "./Pterodactyl";

interface EstadoBase {
  archivos: { nombre: string; bytes: number; fecha: string }[];
  ultimo: { nombre: string; bytes: number; fecha: string } | null;
  alDia: boolean;
}
interface ServidorVps {
  id: string;
  nombre: string;
  host: string;
}
interface EstadoVps {
  carpeta: string;
  disco: { total: number; usado: number; libre: number };
  archivos: { nombre: string; bytes: number; fecha: string; estado: "listo" | "en_curso" | "error" }[];
  errores: Record<string, string>;
}
type TipoRespaldo = "carpeta" | "vps" | "base" | "pterodactyl";

const LIMITE_DESCARGA = 300 * 1024 * 1024;

/** Elegir el servidor de juego y crear su respaldo con el panel (Wings). */
function RespaldoJuego() {
  const puede = usePuede("pterodactyl", "escritura");
  const servidores = useQuery({ queryKey: ["ptero", "servidores"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/ptero/servidores"), retry: false, enabled: puede });
  const [id, setId] = useState("");
  const actual = id || servidores.data?.[0]?.id || "";
  const crear = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((x) => api(`/api/ptero/servidores/${x}/respaldos`, { metodo: "POST" }))),
    onSuccess: () => {
      avisar("Respaldo pedido al panel. Aparece en «Servidores de juego» cuando termine.");
      void queryClient.invalidateQueries({ queryKey: ["ptero"] });
    },
    onError: avisarError,
  });
  if (!puede || !servidores.data?.length) return null;
  return (
    <div className="rounded-xl border border-borde bg-fondo p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Gamepad2 className="h-4 w-4" /> Servidor de juego (Pterodactyl)
      </p>
      <p className="mt-1 text-xs text-tenue">Usa el respaldo del panel: guarda el mundo y los archivos del servidor sin apagarlo.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Selector value={actual} onChange={(e) => setId(e.target.value)} className="h-9 w-56 text-sm">
          {servidores.data.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </Selector>
        <Boton variante="primario" icono={Gamepad2} cargando={crear.isPending} onClick={() => crear.mutate([actual])}>
          Respaldar este servidor
        </Boton>
        {servidores.data.length > 1 ? (
          <Boton
            cargando={crear.isPending}
            onClick={async () => {
              if (await confirmar({ titulo: "Respaldar todos", mensaje: `Se pedirá un respaldo de los ${servidores.data!.length} servidores de juego al panel.`, boton: "Respaldar todos" })) crear.mutate(servidores.data!.map((s) => s.id));
            }}
          >
            Respaldar todos
          </Boton>
        ) : null}
      </div>
    </div>
  );
}

function Opcion({ icono: Icono, titulo, texto, onClick, cargando }: { icono: typeof Archive; titulo: string; texto: string; onClick: () => void; cargando: boolean }) {
  return (
    <button type="button" disabled={cargando} onClick={onClick} className={cx("rounded-xl border border-borde bg-fondo p-3 text-left transition-colors hover:bg-tarjeta disabled:opacity-60")}>
      <p className="flex items-center gap-2 text-sm font-medium">
        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icono className="h-4 w-4" />} {titulo}
      </p>
      <p className="mt-1 text-xs text-tenue">{texto}</p>
    </button>
  );
}

/** Crear respaldos en el VPS: carpeta, Pterodactyl, base de Mi Setup o el VPS completo. */
function CrearRespaldo() {
  const servidores = useQuery({ queryKey: ["vps", "servidores"], queryFn: () => api<ServidorVps[]>("/api/vps/servidores"), retry: false });
  const [sid, setSid] = useState("");
  const [ruta, setRuta] = useState("/opt/mi-setup");
  const actual = sid || servidores.data?.[0]?.id || "";
  const estado = useQuery({
    queryKey: ["respaldos", "vps", actual],
    queryFn: () => api<EstadoVps>(`/api/respaldos/vps?servidorId=${actual}`),
    enabled: Boolean(actual),
    retry: false,
    // Mientras haya un respaldo en curso se revisa seguido.
    refetchInterval: (q) => (q.state.data?.archivos.some((a) => a.estado === "en_curso") ? 4000 : 30_000),
  });
  const crear = useMutation({
    mutationFn: (b: { tipo: TipoRespaldo; ruta?: string }) => api<{ nombre: string }>("/api/respaldos/vps", { cuerpo: { servidorId: actual, ...b } }),
    onSuccess: (r) => {
      avisar(`Respaldo iniciado (${r.nombre}). Sigue en segundo plano en el VPS.`);
      void estado.refetch();
    },
    onError: avisarError,
  });
  const borrar = useMutation({
    mutationFn: (nombre: string) => api(`/api/respaldos/vps?servidorId=${actual}&nombre=${encodeURIComponent(nombre)}`, { metodo: "DELETE" }),
    onSuccess: () => void estado.refetch(),
    onError: avisarError,
  });
  const d = estado.data;
  const enCurso = crear.isPending ? crear.variables?.tipo : null;
  const host = servidores.data?.find((s) => s.id === actual)?.host ?? "TU_IP";
  return (
    <Tarjeta
      titulo="Crear respaldo"
      icono={FolderArchive}
      acciones={
        servidores.data && servidores.data.length > 1 ? (
          <Selector value={actual} onChange={(e) => setSid(e.target.value)} className="h-8 w-48 text-xs">
            {servidores.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Selector>
        ) : null
      }
    >
      <ErrorCaja error={servidores.error} />
      {servidores.data?.length === 0 ? <Vacio icono={Server} texto="Agrega tu VPS en la sección VPS para crear respaldos desde aquí." /> : null}
      {actual ? (
        <div className="space-y-3">
          {d ? (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-fondo">
                <div className="h-full bg-acento" style={{ width: `${Math.min(100, (d.disco.usado / Math.max(1, d.disco.total)) * 100)}%` }} />
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-tenue">
                <HardDrive className="h-3 w-3" /> Disco del VPS: {fmtBytes(d.disco.usado)} usados · {fmtBytes(d.disco.libre)} libres de {fmtBytes(d.disco.total)}
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Opcion icono={Boxes} titulo="Todo Pterodactyl" texto="Los archivos de todos tus servidores de juego, la configuración de Wings y el panel." cargando={enCurso === "pterodactyl"} onClick={() => crear.mutate({ tipo: "pterodactyl" })} />
            <Opcion icono={Database} titulo="Base de datos de Mi Setup" texto="Una copia ahora mismo de tus notas, finanzas, sitios y demás." cargando={enCurso === "base"} onClick={() => crear.mutate({ tipo: "base" })} />
            <Opcion
              icono={Server}
              titulo="VPS completo"
              texto="Casi todo el disco (sin imágenes de Docker ni caché). Puede pesar varios GB."
              cargando={enCurso === "vps"}
              onClick={async () => {
                const libre = d ? ` Te quedan ${fmtBytes(d.disco.libre)} libres.` : "";
                if (await confirmar({ titulo: "Respaldar todo el VPS", mensaje: `Puede ocupar hasta ${d ? fmtBytes(d.disco.usado) : "varios GB"} y tardar varios minutos.${libre} Corre en segundo plano.`, boton: "Crear respaldo completo" })) crear.mutate({ tipo: "vps" });
              }}
            />
            <div className="rounded-xl border border-borde bg-fondo p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <FolderArchive className="h-4 w-4" /> Una carpeta
              </p>
              <div className="mt-2 flex gap-2">
                <Entrada value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="/opt/mi-setup" className="h-9 text-sm" />
                <Boton tamano="sm" variante="primario" cargando={enCurso === "carpeta"} disabled={!ruta.startsWith("/")} onClick={() => crear.mutate({ tipo: "carpeta", ruta })}>
                  Respaldar
                </Boton>
              </div>
            </div>
          </div>
          <RespaldoJuego />
          {d && d.disco.libre < 5 * 1024 ** 3 ? (
            <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 p-2 text-xs">
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-400" /> Queda poco espacio en el VPS. Descarga los respaldos viejos y bórralos del VPS.
            </p>
          ) : null}
          <ErrorCaja error={estado.error} />
          {estado.isLoading ? <Cargando /> : null}
          {d ? (
            <div>
              <p className="mb-1 text-xs text-tenue">Guardados en {d.carpeta} (en el VPS):</p>
              {d.archivos.length === 0 ? <p className="text-sm text-tenue">Todavía no hay respaldos hechos desde aquí.</p> : null}
              <ul className="max-h-80 space-y-1 overflow-auto">
                {d.archivos.map((a) => (
                  <li key={a.nombre} className="rounded-lg bg-fondo px-3 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate">{a.nombre.replace(/\.(parte|error)$/, "")}</span>
                      {a.estado === "en_curso" ? (
                        <Insignia tono="aviso">
                          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                          Creando… {fmtBytes(a.bytes)}
                        </Insignia>
                      ) : a.estado === "error" ? (
                        <Insignia tono="peligro">Falló</Insignia>
                      ) : (
                        <span className="shrink-0 text-tenue">
                          {haceCuanto(a.fecha)} · {fmtBytes(a.bytes)}
                        </span>
                      )}
                      {a.estado === "listo" && a.bytes <= LIMITE_DESCARGA ? (
                        <button
                          type="button"
                          aria-label={`Descargar ${a.nombre}`}
                          className="text-tenue hover:text-texto"
                          onClick={() => void descargar(`/api/respaldos/vps/descargar?servidorId=${actual}&nombre=${encodeURIComponent(a.nombre)}`, a.nombre).catch(avisarError)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {a.estado !== "en_curso" ? (
                        <button
                          type="button"
                          aria-label={`Borrar ${a.nombre}`}
                          className="text-tenue hover:text-texto"
                          onClick={async () => {
                            if (await confirmar({ titulo: "Borrar respaldo", mensaje: `${a.nombre.replace(/\.error$/, "")} se borra del VPS para siempre.`, peligroso: true, boton: "Borrar" })) borrar.mutate(a.nombre);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {a.estado === "error" && d.errores[a.nombre] ? <p className="mt-1 text-[11px] text-peligro">{d.errores[a.nombre]}</p> : null}
                    {a.estado === "listo" && a.bytes > LIMITE_DESCARGA ? (
                      <button type="button" className="mt-1 text-[11px] text-acento underline" onClick={() => void copiarSeguro(`scp root@${host}:${d.carpeta}/${a.nombre} .`, "Comando copiado")}>
                        Muy grande para bajarlo aquí: copiar comando scp
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Tarjeta>
  );
}

function ServidoresJuego() {
  const [id, setId] = useState<string>("");
  const servidores = useQuery({ queryKey: ["ptero", "servidores"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/ptero/servidores"), retry: false });
  const actual = id || servidores.data?.[0]?.id || "";
  return (
    <Tarjeta
      titulo="Servidores de juego"
      icono={Gamepad2}
      acciones={
        servidores.data?.length ? (
          <Selector value={actual} onChange={(e) => setId(e.target.value)} className="h-8 w-56 text-xs">
            {servidores.data.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </Selector>
        ) : null
      }
    >
      <ErrorCaja error={servidores.error} />
      {servidores.data?.length === 0 ? <Vacio icono={Gamepad2} texto="No hay servidores en el panel." /> : null}
      {actual ? <RespaldosServidor key={actual} id={actual} /> : null}
    </Tarjeta>
  );
}

export default function Respaldos() {
  const verPtero = usePuede("pterodactyl");
  const maestra = useMe().data?.usuario.role === "maestra";
  const base = useQuery({ queryKey: ["respaldos", "base"], queryFn: () => api<EstadoBase>("/api/respaldos/base"), retry: false });
  return (
    <>
      <Encabezado titulo="Respaldos" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {maestra ? (
          <div className="lg:col-span-2">
            <CrearRespaldo />
          </div>
        ) : null}
        <Tarjeta
          titulo="Base de datos de Mi Setup"
          icono={Database}
          acciones={base.data ? <Insignia tono={base.data.alDia ? "ok" : "peligro"}>{base.data.alDia ? "Al día" : "Atrasado"}</Insignia> : null}
        >
          <ErrorCaja error={base.error} />
          {base.isLoading ? <Cargando /> : null}
          {base.data?.ultimo ? (
            <p className="mb-3 text-sm">
              Último: <span className="font-medium">{base.data.ultimo.nombre}</span> · {haceCuanto(base.data.ultimo.fecha)} · {fmtBytes(base.data.ultimo.bytes)}
            </p>
          ) : base.data ? (
            <Vacio icono={Archive} texto="Aún no hay respaldos en la carpeta." />
          ) : null}
          <ul className="max-h-80 space-y-1 overflow-auto">
            {base.data?.archivos.map((a) => (
              <li key={a.nombre} className="flex justify-between gap-2 rounded-lg bg-fondo px-3 py-1.5 text-xs">
                <span className="truncate">{a.nombre}</span>
                <span className="flex shrink-0 items-center gap-2 text-tenue">
                  {fmtFechaHora(a.fecha)} · {fmtBytes(a.bytes)}
                  {maestra ? (
                    <button type="button" aria-label={`Descargar ${a.nombre}`} className="hover:text-texto" onClick={() => void descargar(`/api/respaldos/base/descargar/${encodeURIComponent(a.nombre)}`, a.nombre).catch(avisarError)}>
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
        {verPtero ? <ServidoresJuego /> : null}
        <Tarjeta titulo="Mis datos" icono={FileJson}>
          <p className="text-sm text-tenue">Descarga todo lo tuyo (notas, tareas, finanzas, suscripciones, calendario, enlaces, prompts y tu lista por ver) en un archivo. Guárdalo en tu PC o en la nube.</p>
          <Boton className="mt-3" icono={Download} onClick={() => void descargar("/api/respaldos/mis-datos", `mis-datos-${new Date().toISOString().slice(0, 10)}.json`).catch(avisarError)}>
            Descargar mis datos
          </Boton>
          <p className="mt-3 text-xs text-tenue">Tus archivos subidos (música, videos, compartidos) viven en el volumen misetup_archivos del VPS; el script de respaldo también los copia (ver USO.md).</p>
        </Tarjeta>
      </div>
    </>
  );
}
