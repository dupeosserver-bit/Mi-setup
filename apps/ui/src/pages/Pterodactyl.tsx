/** Pterodactyl: servidores, consola, energía, archivos, respaldos, administración y panel web. */
import { temas } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft, ExternalLink, File, Folder, Gamepad2, Play, RotateCw, Send, Skull, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, FaltaConfigurar, Insignia, Modal, Pestanas, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { PteroAdmin } from "../components/PteroAdmin";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes, fmtDuracion, fmtFechaHora } from "../lib/formato";
import { abrirExterno, escritorio } from "../lib/plataforma";
import { useTema } from "../lib/tiempo-real";

interface Estado {
  url: string;
  cliente: boolean;
  administracion: boolean;
}

interface ServidorJuego {
  id: string;
  nombre: string;
  descripcion: string;
  nodo: string;
  suspendido: boolean;
  limites: { memoriaMb: number; discoMb: number; cpu: number };
  direccion: string | null;
}

interface Recursos {
  estado: string;
  cpu: number;
  memoria: number;
  disco: number;
  rx: number;
  tx: number;
  uptimeMs: number;
}

const ESTADOS: Record<string, { texto: string; tono: "ok" | "aviso" | "peligro" | "neutro" }> = {
  running: { texto: "Encendido", tono: "ok" },
  starting: { texto: "Iniciando", tono: "aviso" },
  stopping: { texto: "Deteniendo", tono: "aviso" },
  offline: { texto: "Apagado", tono: "peligro" },
};

// Quita los códigos de color ANSI (ESC [ … letra) de la consola.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
const sinAnsi = (s: string) => s.replace(ANSI, "");

function useRecursos(id: string) {
  return useQuery({ queryKey: ["ptero", "recursos", id], queryFn: () => api<Recursos>(`/api/ptero/servidores/${id}/recursos`), refetchInterval: 10_000, retry: false });
}

function Tarjeta_({ s, alAbrir }: { s: ServidorJuego; alAbrir: () => void }) {
  const r = useRecursos(s.id);
  const e = ESTADOS[r.data?.estado ?? ""] ?? { texto: r.data?.estado ?? "…", tono: "neutro" as const };
  return (
    <button type="button" onClick={alAbrir} className="rounded-tarjeta border border-borde bg-superficie p-4 text-left hover:bg-tarjeta">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{s.nombre}</p>
          <p className="truncate text-xs text-tenue">{s.direccion ?? s.nodo}</p>
        </div>
        {s.suspendido ? <Insignia tono="peligro">Suspendido</Insignia> : <Insignia tono={e.tono}>{e.texto}</Insignia>}
      </div>
      {r.data ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-tenue">CPU</p>
            <p>{r.data.cpu.toFixed(0)}% / {s.limites.cpu || "∞"}%</p>
          </div>
          <div>
            <p className="text-tenue">RAM</p>
            <p>{fmtBytes(r.data.memoria)} / {s.limites.memoriaMb ? fmtBytes(s.limites.memoriaMb * 1024 * 1024) : "∞"}</p>
          </div>
          <div>
            <p className="text-tenue">Disco</p>
            <p>{fmtBytes(r.data.disco)}</p>
          </div>
        </div>
      ) : null}
    </button>
  );
}

function Consola({ id }: { id: string }) {
  const [lineas, setLineas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [comando, setComando] = useState("");
  const caja = useRef<HTMLPreElement>(null);
  const puede = usePuede("pterodactyl", "escritura");
  useTema<{ linea?: string; error?: string }>(temas.consolaPtero(id), (d) => {
    if (d.error) setError(d.error);
    if (d.linea !== undefined) setLineas((l) => [...l, sinAnsi(d.linea!)].slice(-800));
  });
  useEffect(() => {
    const el = caja.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lineas.length]);
  const enviar = useMutation({
    mutationFn: () => api(`/api/ptero/servidores/${id}/comando`, { cuerpo: { comando } }),
    onSuccess: () => setComando(""),
    onError: avisarError,
  });
  return (
    <div className="space-y-2">
      {error ? <ErrorCaja error={new Error(error)} /> : null}
      <pre ref={caja} className="h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-fondo p-3 font-mono text-xs">
        {lineas.length ? lineas.join("\n") : "Esperando la consola…"}
      </pre>
      {puede ? (
        <form
          className="flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (comando.trim()) enviar.mutate();
          }}
        >
          <Entrada value={comando} onChange={(e) => setComando(e.target.value)} placeholder="Comando de consola (p. ej. say hola)" className="font-mono" />
          <Boton type="submit" variante="primario" tamano="icono" icono={Send} cargando={enviar.isPending} aria-label="Enviar" />
        </form>
      ) : null}
    </div>
  );
}

function Archivos({ id }: { id: string }) {
  const [dir, setDir] = useState("/");
  const [viendo, setViendo] = useState<string | null>(null);
  const lista = useQuery({
    queryKey: ["ptero", "archivos", id, dir],
    queryFn: () => api<{ nombre: string; tamano: number; archivo: boolean; modificado: string }[]>(`/api/ptero/servidores/${id}/archivos?dir=${encodeURIComponent(dir)}`),
  });
  const contenido = useQuery({
    queryKey: ["ptero", "contenido", id, viendo],
    queryFn: () => api<{ contenido: string }>(`/api/ptero/servidores/${id}/archivos/contenido?archivo=${encodeURIComponent(viendo!)}`),
    enabled: Boolean(viendo),
  });
  const ruta = (n: string) => `${dir.replace(/\/$/, "")}/${n}`;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <Boton tamano="sm" variante="fantasma" disabled={dir === "/"} onClick={() => setDir(dir.split("/").slice(0, -1).join("/") || "/")}>Subir</Boton>
        <span className="font-mono text-xs text-tenue">{dir}</span>
      </div>
      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      <div className="max-h-96 overflow-auto rounded-xl bg-fondo">
        {lista.data?.map((f) => (
          <button
            key={f.nombre}
            type="button"
            onClick={() => (f.archivo ? setViendo(ruta(f.nombre)) : setDir(ruta(f.nombre)))}
            className="flex w-full items-center gap-2 border-b border-borde px-3 py-2 text-left text-sm last:border-0 hover:bg-tarjeta"
          >
            {f.archivo ? <File className="h-4 w-4 text-tenue" /> : <Folder className="h-4 w-4 text-tenue" />}
            <span className="flex-1 truncate">{f.nombre}</span>
            <span className="text-xs text-tenue">{f.archivo ? fmtBytes(f.tamano) : ""}</span>
          </button>
        ))}
      </div>
      <Modal abierto={Boolean(viendo)} titulo={viendo ?? ""} alCerrar={() => setViendo(null)} ancho="max-w-4xl">
        <ErrorCaja error={contenido.error} />
        {contenido.isLoading ? <Cargando /> : <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl bg-fondo p-3 font-mono text-xs">{contenido.data?.contenido}</pre>}
      </Modal>
    </div>
  );
}

export function RespaldosServidor({ id }: { id: string }) {
  const puede = usePuede("pterodactyl", "escritura");
  const q = useQuery({
    queryKey: ["ptero", "respaldos", id],
    queryFn: () => api<{ uuid: string; nombre: string; bytes: number; creado: string; completado: string | null; exitoso: boolean }[]>(`/api/ptero/servidores/${id}/respaldos`),
  });
  const crear = useMutation({
    mutationFn: () => api(`/api/ptero/servidores/${id}/respaldos`, { metodo: "POST" }),
    onSuccess: () => {
      avisar("Respaldo iniciado");
      void queryClient.invalidateQueries({ queryKey: ["ptero", "respaldos", id] });
    },
    onError: avisarError,
  });
  return (
    <div className="space-y-2">
      {puede ? <Boton icono={Archive} cargando={crear.isPending} onClick={() => crear.mutate()}>Crear respaldo ahora</Boton> : null}
      <ErrorCaja error={q.error} />
      {q.data?.length === 0 ? <Vacio icono={Archive} texto="Este servidor no tiene respaldos." /> : null}
      <ul className="space-y-1">
        {q.data?.map((b) => (
          <li key={b.uuid} className="flex items-center justify-between gap-2 rounded-lg bg-fondo px-3 py-2 text-sm">
            <span className="truncate">{b.nombre}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-tenue">
              {fmtFechaHora(b.creado)} · {fmtBytes(b.bytes)}
              <Insignia tono={!b.completado ? "aviso" : b.exitoso ? "ok" : "peligro"}>{!b.completado ? "en curso" : b.exitoso ? "listo" : "falló"}</Insignia>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detalle({ s, alVolver }: { s: ServidorJuego; alVolver: () => void }) {
  const [vista, setVista] = useState<"consola" | "archivos" | "respaldos">("consola");
  const puede = usePuede("pterodactyl", "escritura");
  const r = useRecursos(s.id);
  const energia = async (senal: "start" | "stop" | "restart" | "kill") => {
    if (senal === "kill" && !(await confirmar({ titulo: "Forzar apagado", mensaje: `Matar el proceso de ${s.nombre} puede corromper el mundo o los datos.`, peligroso: true, textoExacto: s.nombre, boton: "Matar" }))) return;
    if (senal === "stop" && !(await confirmar({ titulo: "Detener servidor", mensaje: `¿Detener ${s.nombre}?` }))) return;
    await api(`/api/ptero/servidores/${s.id}/energia`, { cuerpo: { senal } }).then(() => avisar("Señal enviada"), avisarError);
    void queryClient.invalidateQueries({ queryKey: ["ptero", "recursos", s.id] });
  };
  const e = ESTADOS[r.data?.estado ?? ""];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} aria-label="Volver" />
        <h2 className="text-lg font-semibold">{s.nombre}</h2>
        {e ? <Insignia tono={e.tono}>{e.texto}</Insignia> : null}
        {r.data ? <span className="text-xs text-tenue">encendido {fmtDuracion(r.data.uptimeMs / 1000)} · ↓ {fmtBytes(r.data.rx)} ↑ {fmtBytes(r.data.tx)}</span> : null}
        {puede ? (
          <div className="ml-auto flex flex-wrap gap-1">
            <Boton tamano="sm" icono={Play} onClick={() => void energia("start")}>Iniciar</Boton>
            <Boton tamano="sm" icono={RotateCw} onClick={() => void energia("restart")}>Reiniciar</Boton>
            <Boton tamano="sm" icono={Square} onClick={() => void energia("stop")}>Detener</Boton>
            <Boton tamano="sm" variante="peligro" icono={Skull} onClick={() => void energia("kill")}>Matar</Boton>
          </div>
        ) : null}
      </div>
      <Pestanas
        opciones={[
          { id: "consola", texto: "Consola" },
          { id: "archivos", texto: "Archivos" },
          { id: "respaldos", texto: "Respaldos" },
        ]}
        valor={vista}
        alCambiar={setVista}
      />
      <Tarjeta>
        {vista === "consola" ? <Consola id={s.id} /> : vista === "archivos" ? <Archivos id={s.id} /> : <RespaldosServidor id={s.id} />}
      </Tarjeta>
    </>
  );
}

function PanelWeb({ url }: { url: string }) {
  const pc = escritorio();
  return (
    <Tarjeta
      titulo="Panel completo"
      acciones={
        <Boton icono={ExternalLink} onClick={() => (pc ? pc.abrirPanel(url) : abrirExterno(url))}>
          {pc ? "Abrir en ventana" : "Abrir en pestaña"}
        </Boton>
      }
    >
      {pc ? (
        <p className="text-sm text-tenue">En la app de PC el panel se abre en su propia ventana, con tu sesión guardada.</p>
      ) : (
        // Pterodactyl no deja mostrarse dentro de otra app (X-Frame-Options: DENY) y su sesión
        // no funcionaría en un marco, así que se abre en el navegador.
        <div className="space-y-3 text-sm">
          <p className="text-tenue">
            Por seguridad, Pterodactyl no permite mostrarse dentro de otra app. Se abre en tu navegador, donde tu sesión del panel queda guardada.
          </p>
          <p className="truncate font-mono text-xs text-tenue">{url}</p>
          <Boton variante="primario" icono={ExternalLink} onClick={() => abrirExterno(url)}>
            Abrir el panel
          </Boton>
        </div>
      )}
    </Tarjeta>
  );
}

export default function Pterodactyl() {
  const estado = useQuery({ queryKey: ["ptero", "estado"], queryFn: () => api<Estado>("/api/ptero/estado") });
  const esAdmin = usePuede("pterodactyl", "administrar");
  const [vista, setVista] = useState<"servidores" | "panel" | "admin">("servidores");
  const [abierto, setAbierto] = useState<ServidorJuego | null>(null);
  const servidores = useQuery({
    queryKey: ["ptero", "servidores"],
    queryFn: () => api<ServidorJuego[]>("/api/ptero/servidores"),
    enabled: Boolean(estado.data?.cliente),
  });

  const opciones = [
    { id: "servidores" as const, texto: "Servidores" },
    { id: "panel" as const, texto: "Panel web" },
    ...(esAdmin && estado.data?.administracion ? [{ id: "admin" as const, texto: "Administración" }] : []),
  ];

  return (
    <>
      <Encabezado titulo="Pterodactyl" descripcion={estado.data?.url} />
      <Pestanas opciones={opciones} valor={vista} alCambiar={(v) => { setVista(v); setAbierto(null); }} />
      {vista === "panel" && estado.data ? <PanelWeb url={estado.data.url} /> : null}
      {vista === "admin" ? <PteroAdmin /> : null}
      {vista === "servidores" ? (
        estado.data && !estado.data.cliente ? (
          <FaltaConfigurar variable="PTERO_CLIENT_KEY" detalle="Crea una llave de API de cliente (ptlc_) en tu cuenta del panel y agrégala al .env del servidor. Mientras tanto puedes usar el panel web." />
        ) : abierto ? (
          <Detalle s={abierto} alVolver={() => setAbierto(null)} />
        ) : (
          <>
            <ErrorCaja error={servidores.error} />
            {servidores.isLoading ? <Cargando /> : null}
            {servidores.data?.length === 0 ? <Vacio icono={Gamepad2} texto="Tu cuenta del panel no tiene servidores." /> : null}
            <div className={cx("grid gap-3 sm:grid-cols-2 xl:grid-cols-3")}>
              {servidores.data?.map((s) => <Tarjeta_ key={s.id} s={s} alAbrir={() => setAbierto(s)} />)}
            </div>
          </>
        )
      ) : null}
    </>
  );
}
