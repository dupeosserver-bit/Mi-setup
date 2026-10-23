import { temas } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft, Copy, Download, ExternalLink, File, FileCode2, Folder, Gamepad2, Gauge, Globe, Lock, Play, RotateCw, Search, Send, Skull, Sparkles, Square, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAsistente } from "../components/Asistente";
import { usePaginado } from "../components/Paginas";
import { PteroAdmin } from "../components/PteroAdmin";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, FaltaConfigurar, Insignia, Pestanas, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes, fmtDuracion, fmtFechaHora } from "../lib/formato";
import { useForma, useModoPagina } from "../lib/marco";
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

interface Respaldo {
  uuid: string;
  nombre: string;
  bytes: number;
  creado: string;
  completado: string | null;
  exitoso: boolean;
}

const ESTADOS: Record<string, { texto: string; tono: "ok" | "aviso" | "peligro" | "neutro" }> = {
  running: { texto: "Encendido", tono: "ok" },
  starting: { texto: "Iniciando", tono: "aviso" },
  stopping: { texto: "Deteniendo", tono: "aviso" },
  offline: { texto: "Apagado", tono: "peligro" },
};

const COLORES = ["#3fb950", "#58a6ff", "#d29922", "#bc8cff", "#ff7b72", "#39c5cf"];
const colorDe = (id: string) => COLORES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length]!;

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
const sinAnsi = (s: string) => s.replace(ANSI, "");

function useRecursos(id: string) {
  return useQuery({ queryKey: ["ptero", "recursos", id], queryFn: () => api<Recursos>(`/api/ptero/servidores/${id}/recursos`), refetchInterval: 10_000, retry: false });
}

function estadoDe(s: ServidorJuego, r?: Recursos) {
  if (s.suspendido) return { texto: "Suspendido", tono: "peligro" as const };
  return ESTADOS[r?.estado ?? ""] ?? { texto: r?.estado ?? "…", tono: "neutro" as const };
}

function IconoJuego({ s, grande }: { s: ServidorJuego; grande?: boolean }) {
  const c = colorDe(s.id);
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-xl", grande ? "h-12 w-12" : "h-9 w-9")}
      style={{ background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c }}
    >
      <Gamepad2 className={grande ? "h-6 w-6" : "h-[18px] w-[18px]"} />
    </span>
  );
}

function Barra({ titulo, valor, maximo, texto }: { titulo: string; valor: number; maximo: number; texto: string }) {
  const pct = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  const color = pct > 85 ? "var(--error)" : pct > 65 ? "var(--aviso)" : "var(--acento)";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-tenue">{titulo}</span>
        <span>{texto}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-fondo">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function FilaServidor({ s, activo, alAbrir }: { s: ServidorJuego; activo: boolean; alAbrir: () => void }) {
  const r = useRecursos(s.id);
  const e = estadoDe(s, r.data);
  return (
    <button
      type="button"
      onClick={alAbrir}
      className={cx(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        activo ? "border-[color-mix(in_srgb,var(--acento)_45%,transparent)] bg-[color-mix(in_srgb,var(--acento)_10%,transparent)]" : "border-transparent hover:bg-tarjeta",
      )}
    >
      <IconoJuego s={s} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{s.nombre}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-tenue">
          <span className={cx("h-2 w-2 shrink-0 rounded-full", e.tono === "ok" ? "bg-ok" : e.tono === "aviso" ? "bg-aviso" : e.tono === "peligro" ? "bg-peligro" : "bg-borde")} />
          <span className="truncate">{r.data?.estado === "running" ? `${e.texto} · ${r.data.cpu.toFixed(0)}% · ${fmtBytes(r.data.memoria)}` : e.texto}</span>
        </span>
      </span>
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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {error ? <ErrorCaja error={new Error(error)} /> : null}
      <pre ref={caja} className="min-h-[18rem] flex-1 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-fondo p-3 font-mono text-xs">
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

function ArchivoCompleto({ id, servidor, ruta, alCerrar }: { id: string; servidor: string; ruta: string; alCerrar: () => void }) {
  useModoPagina("completa");
  const abrirIa = useAsistente((e) => e.poner);
  const contenido = useQuery({
    queryKey: ["ptero", "contenido", id, ruta],
    queryFn: () => api<{ contenido: string }>(`/api/ptero/servidores/${id}/archivos/contenido?archivo=${encodeURIComponent(ruta)}`),
  });
  const nombre = ruta.split("/").pop() ?? ruta;
  const texto = contenido.data?.contenido ?? "";
  const lineas = useMemo(() => texto.split("\n"), [texto]);
  const descargar = () => {
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="fixed inset-0 z-[60] flex h-[var(--alto-app,100dvh)] min-h-0 flex-col bg-fondo">
      <header className="flex flex-wrap items-center gap-2 border-b border-borde bg-superficie px-3 py-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alCerrar} aria-label="Volver" />
        <FileCode2 className="h-5 w-5 shrink-0 text-acento" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{nombre}</p>
          <p className="truncate text-xs text-tenue">
            {servidor} · {ruta}
          </p>
        </div>
        <Insignia tono="neutro">Solo lectura</Insignia>
        <Boton
          tamano="sm"
          icono={Copy}
          disabled={!texto}
          onClick={() => void navigator.clipboard?.writeText(texto).then(() => avisar("Copiado"), () => avisar("No se pudo copiar"))}
        >
          <span className="hidden sm:inline">Copiar</span>
        </Boton>
        <Boton tamano="sm" icono={Download} disabled={!texto} onClick={descargar}>
          <span className="hidden sm:inline">Descargar</span>
        </Boton>
      </header>
      <ErrorCaja error={contenido.error} />
      {contenido.isLoading ? <Cargando /> : null}
      <main className="min-h-0 flex-1 overflow-auto py-2 font-mono text-[13px] leading-6">
        {lineas.map((l, i) => (
          <div key={i} className="flex">
            <span className="w-12 shrink-0 select-none pr-3 text-right text-tenue">{i + 1}</span>
            <span className={cx("min-w-0 whitespace-pre-wrap break-all pr-3", l.trimStart().startsWith("#") && "text-tenue")}>{l || " "}</span>
          </div>
        ))}
      </main>
      <footer className="flex flex-wrap items-center gap-2 border-t border-borde bg-superficie px-3 py-2 text-sm">
        <Sparkles className="h-4 w-4 shrink-0 text-acento" />
        <span className="min-w-0 flex-1 text-tenue">¿Quieres cambiar algo? Pídeselo a la IA: propone el cambio y solo se guarda cuando tocas «Aprobar».</span>
        <Boton tamano="sm" variante="primario" onClick={() => abrirIa(true)}>
          Pedir cambio
        </Boton>
      </footer>
    </div>
  );
}

function Archivos({ id, servidor }: { id: string; servidor: string }) {
  const [dir, setDir] = useState("/");
  const [viendo, setViendo] = useState<string | null>(null);
  const lista = useQuery({
    queryKey: ["ptero", "archivos", id, dir],
    queryFn: () => api<{ nombre: string; tamano: number; archivo: boolean; modificado: string }[]>(`/api/ptero/servidores/${id}/archivos?dir=${encodeURIComponent(dir)}`),
  });
  const pg = usePaginado(lista.data, 14);
  const ruta = (n: string) => `${dir.replace(/\/$/, "")}/${n}`;
  if (viendo) return <ArchivoCompleto id={id} servidor={servidor} ruta={viendo} alCerrar={() => setViendo(null)} />;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Boton tamano="sm" variante="fantasma" icono={ArrowLeft} disabled={dir === "/"} onClick={() => setDir(dir.split("/").slice(0, -1).join("/") || "/")}>
          Subir
        </Boton>
        <code className="truncate text-xs text-tenue">{dir}</code>
      </div>
      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      <div className="overflow-hidden rounded-xl bg-fondo">
        {pg.visibles.map((f) => (
          <button
            key={f.nombre}
            type="button"
            onClick={() => (f.archivo ? setViendo(ruta(f.nombre)) : setDir(ruta(f.nombre)))}
            className="flex w-full items-center gap-3 border-b border-borde px-3 py-2.5 text-left text-sm last:border-0 hover:bg-tarjeta"
          >
            {f.archivo ? <File className="h-4 w-4 shrink-0 text-tenue" /> : <Folder className="h-4 w-4 shrink-0 text-acento" />}
            <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
            <span className="hidden text-xs text-tenue sm:inline">{f.modificado ? fmtFechaHora(f.modificado) : ""}</span>
            <span className="w-16 shrink-0 text-right text-xs text-tenue">{f.archivo ? fmtBytes(f.tamano) : ""}</span>
          </button>
        ))}
      </div>
      {pg.paginas}
    </div>
  );
}

function useRespaldos(id: string) {
  return useQuery({ queryKey: ["ptero", "respaldos", id], queryFn: () => api<Respaldo[]>(`/api/ptero/servidores/${id}/respaldos`) });
}

function useCrearRespaldo(id: string) {
  return useMutation({
    mutationFn: () => api(`/api/ptero/servidores/${id}/respaldos`, { metodo: "POST" }),
    onSuccess: () => {
      avisar("Respaldo iniciado");
      void queryClient.invalidateQueries({ queryKey: ["ptero", "respaldos", id] });
    },
    onError: avisarError,
  });
}

function FilaRespaldo({ b }: { b: Respaldo }) {
  return (
    <li className="flex items-center gap-2 rounded-lg bg-fondo px-3 py-2 text-sm">
      <Archive className="h-4 w-4 shrink-0 text-tenue" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{b.nombre}</span>
        <span className="block truncate text-xs text-tenue">
          {fmtFechaHora(b.creado)} · {fmtBytes(b.bytes)}
        </span>
      </span>
      <Insignia tono={!b.completado ? "aviso" : b.exitoso ? "ok" : "peligro"}>{!b.completado ? "en curso" : b.exitoso ? "listo" : "falló"}</Insignia>
    </li>
  );
}

export function RespaldosServidor({ id }: { id: string }) {
  const puede = usePuede("pterodactyl", "escritura");
  const q = useRespaldos(id);
  const crear = useCrearRespaldo(id);
  const pg = usePaginado(q.data, 12);
  return (
    <div className="space-y-2">
      {puede ? (
        <Boton icono={Archive} cargando={crear.isPending} onClick={() => crear.mutate()}>
          Crear respaldo ahora
        </Boton>
      ) : null}
      <ErrorCaja error={q.error} />
      {q.data?.length === 0 ? <Vacio icono={Archive} texto="Este servidor no tiene respaldos." /> : null}
      <ul className="space-y-1">
        {pg.visibles.map((b) => (
          <FilaRespaldo key={b.uuid} b={b} />
        ))}
      </ul>
      {pg.paginas}
    </div>
  );
}

function Lado({ s }: { s: ServidorJuego }) {
  const r = useRecursos(s.id);
  const q = useRespaldos(s.id);
  const crear = useCrearRespaldo(s.id);
  const puede = usePuede("pterodactyl", "escritura");
  const abrirIa = useAsistente((e) => e.poner);
  const memMax = s.limites.memoriaMb * 1024 * 1024;
  const discoMax = s.limites.discoMb * 1024 * 1024;
  return (
    <div className="space-y-3">
      <Tarjeta titulo="Recursos" icono={Gauge}>
        {r.data ? (
          <div className="space-y-3">
            <Barra titulo="CPU" valor={r.data.cpu} maximo={s.limites.cpu || 100} texto={`${r.data.cpu.toFixed(0)}% / ${s.limites.cpu || "∞"}%`} />
            <Barra titulo="RAM" valor={r.data.memoria} maximo={memMax || r.data.memoria * 2 || 1} texto={`${fmtBytes(r.data.memoria)} / ${memMax ? fmtBytes(memMax) : "∞"}`} />
            <Barra titulo="Disco" valor={r.data.disco} maximo={discoMax || r.data.disco * 2 || 1} texto={`${fmtBytes(r.data.disco)}${discoMax ? ` / ${fmtBytes(discoMax)}` : ""}`} />
            <p className="flex justify-between text-xs text-tenue">
              <span>↓ {fmtBytes(r.data.rx)}</span>
              <span>↑ {fmtBytes(r.data.tx)}</span>
            </p>
          </div>
        ) : (
          <Cargando />
        )}
      </Tarjeta>
      <div className="flex gap-3 rounded-tarjeta border border-[color-mix(in_srgb,var(--acento)_35%,transparent)] bg-[color-mix(in_srgb,var(--acento)_8%,var(--superficie))] p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-acento" />
        <div className="min-w-0 space-y-2 text-sm">
          <p className="font-semibold">Pídele a la IA</p>
          <p className="text-tenue">Revisa la consola y los recursos de {s.nombre}. La IA solo propone; nada cambia hasta que tocas «Aprobar».</p>
          <Boton tamano="sm" variante="primario" icono={Sparkles} onClick={() => abrirIa(true)}>
            Preguntar
          </Boton>
        </div>
      </div>
      <Tarjeta titulo="Respaldos" icono={Archive}>
        <ul className="space-y-1">
          {(q.data ?? []).slice(0, 3).map((b) => (
            <FilaRespaldo key={b.uuid} b={b} />
          ))}
        </ul>
        {q.data?.length === 0 ? <p className="text-sm text-tenue">Aún no hay respaldos.</p> : null}
        {puede ? (
          <Boton className="mt-2 w-full" tamano="sm" icono={Archive} cargando={crear.isPending} onClick={() => crear.mutate()}>
            Crear respaldo ahora
          </Boton>
        ) : null}
      </Tarjeta>
    </div>
  );
}

function Detalle({ s, alVolver }: { s: ServidorJuego; alVolver?: () => void }) {
  const [vista, setVista] = useState<"consola" | "archivos" | "respaldos">("consola");
  const puede = usePuede("pterodactyl", "escritura");
  const r = useRecursos(s.id);
  const e = estadoDe(s, r.data);
  const energia = async (senal: "start" | "stop" | "restart" | "kill") => {
    if (senal === "kill" && !(await confirmar({ titulo: "Forzar apagado", mensaje: `Matar el proceso de ${s.nombre} puede corromper el mundo o los datos.`, peligroso: true, textoExacto: s.nombre, boton: "Matar" }))) return;
    if (senal === "stop" && !(await confirmar({ titulo: "Detener servidor", mensaje: `¿Detener ${s.nombre}?` }))) return;
    await api(`/api/ptero/servidores/${s.id}/energia`, { cuerpo: { senal } }).then(() => avisar("Señal enviada"), avisarError);
    void queryClient.invalidateQueries({ queryKey: ["ptero", "recursos", s.id] });
  };
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-3">
        {alVolver ? <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} aria-label="Volver" /> : null}
        <IconoJuego s={s} grande />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{s.nombre}</h2>
          <p className="truncate text-xs text-tenue">
            {[s.direccion, s.nodo, r.data?.estado === "running" ? `encendido ${fmtDuracion(r.data.uptimeMs / 1000)}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Insignia tono={e.tono}>{e.texto}</Insignia>
      </div>
      {puede ? (
        <div className="flex flex-wrap gap-1.5">
          <Boton tamano="sm" icono={Play} onClick={() => void energia("start")}>
            Iniciar
          </Boton>
          <Boton tamano="sm" icono={RotateCw} onClick={() => void energia("restart")}>
            Reiniciar
          </Boton>
          <Boton tamano="sm" icono={Square} onClick={() => void energia("stop")}>
            Detener
          </Boton>
          <Boton tamano="sm" variante="peligro" icono={Skull} onClick={() => void energia("kill")}>
            Matar
          </Boton>
        </div>
      ) : null}
      <Pestanas
        opciones={[
          { id: "consola", texto: "Consola" },
          { id: "archivos", texto: "Archivos" },
          { id: "respaldos", texto: "Respaldos" },
        ]}
        valor={vista}
        alCambiar={setVista}
      />
      {vista === "consola" ? <Consola id={s.id} /> : vista === "archivos" ? <Archivos id={s.id} servidor={s.nombre} /> : <RespaldosServidor id={s.id} />}
    </section>
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
        <div className="space-y-3 text-sm">
          <p className="text-tenue">Por seguridad, Pterodactyl no permite mostrarse dentro de otra app. Se abre en tu navegador, donde tu sesión del panel queda guardada.</p>
          <p className="truncate font-mono text-xs text-tenue">{url}</p>
          <Boton variante="primario" icono={ExternalLink} onClick={() => abrirExterno(url)}>
            Abrir el panel
          </Boton>
        </div>
      )}
    </Tarjeta>
  );
}

function Dueno({ url }: { url?: string }) {
  const ir = useNavigate();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--acento)_40%,transparent)] bg-[color-mix(in_srgb,var(--acento)_10%,transparent)] px-3 py-1 text-xs font-medium text-acento">
        <Lock className="h-3.5 w-3.5" />
        Solo tú y los roles que elijas
      </span>
      {url ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-tenue">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
        </span>
      ) : null}
      <Boton tamano="sm" variante="fantasma" icono={Users} onClick={() => ir("/seguridad/cuentas")}>
        Quién puede entrar
      </Boton>
    </div>
  );
}

function Servidores({ lista }: { lista: ServidorJuego[] }) {
  const forma = useForma();
  const [buscar, setBuscar] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const filtrados = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return t ? lista.filter((s) => `${s.nombre} ${s.direccion ?? ""} ${s.nodo}`.toLowerCase().includes(t)) : lista;
  }, [lista, buscar]);
  const pg = usePaginado(filtrados, 8);
  const celular = forma === "celular";
  const actual = lista.find((s) => s.id === elegido) ?? (celular ? null : lista[0] ?? null);
  const listaCaja = (
    <aside className="flex min-w-0 flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tenue" />
        <Entrada value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar servidor" className="pl-9" />
      </div>
      <div className="space-y-1">
        {pg.visibles.map((s) => (
          <FilaServidor key={s.id} s={s} activo={actual?.id === s.id} alAbrir={() => setElegido(s.id)} />
        ))}
      </div>
      {!filtrados.length ? <p className="px-1 py-2 text-sm text-tenue">Ningún servidor coincide.</p> : null}
      {pg.paginas}
    </aside>
  );
  if (celular) return actual ? <div className="space-y-3"><Detalle s={actual} alVolver={() => setElegido(null)} /><Lado s={actual} /></div> : listaCaja;
  return (
    <div className="grid items-start gap-3 md:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)_300px]">
      {listaCaja}
      {actual ? <Detalle s={actual} /> : null}
      {actual ? (
        <div className="md:col-span-2 xl:col-span-1">
          <Lado s={actual} />
        </div>
      ) : null}
    </div>
  );
}

export default function Pterodactyl() {
  const estado = useQuery({ queryKey: ["ptero", "estado"], queryFn: () => api<Estado>("/api/ptero/estado") });
  const esAdmin = usePuede("pterodactyl", "administrar");
  const [vista, setVista] = useState<"servidores" | "panel" | "admin">("servidores");
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
  const url = estado.data?.url;
  return (
    <>
      <Encabezado
        titulo="Pterodactyl"
        descripcion="Tus servidores de juego, su consola y el panel."
        acciones={
          url ? (
            <Boton variante="fantasma" icono={ExternalLink} onClick={() => setVista("panel")}>
              Abrir el panel
            </Boton>
          ) : undefined
        }
      />
      <Dueno {...(url ? { url } : {})} />
      <Pestanas opciones={opciones} valor={vista} alCambiar={setVista} />
      {vista === "panel" && estado.data ? <PanelWeb url={estado.data.url} /> : null}
      {vista === "admin" ? <PteroAdmin /> : null}
      {vista === "servidores" ? (
        estado.data && !estado.data.cliente ? (
          <FaltaConfigurar variable="PTERO_CLIENT_KEY" detalle="Crea una llave de API de cliente (ptlc_) en tu cuenta del panel y agrégala al .env del servidor. Mientras tanto puedes usar el panel web." />
        ) : (
          <>
            <ErrorCaja error={servidores.error} />
            {servidores.isLoading ? <Cargando /> : null}
            {servidores.data?.length === 0 ? <Vacio icono={Gamepad2} texto="Tu cuenta del panel no tiene servidores." /> : null}
            {servidores.data?.length ? <Servidores lista={servidores.data} /> : null}
          </>
        )
      ) : null}
    </>
  );
}
