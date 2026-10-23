import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  Boxes,
  CalendarClock,
  CircleX,
  Database,
  Download,
  FileJson,
  FolderArchive,
  Gamepad2,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePaginado } from "../components/Paginas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { SUAVE } from "../components/vps/piezas";
import { PUBLICA } from "../edicion";
import { api, descargar } from "../lib/api";
import { copiarSeguro } from "../lib/boveda/utilidades";
import { confirmar } from "../lib/confirmar";
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
interface ArchivoRespaldo {
  nombre: string;
  bytes: number;
  fecha: string;
  estado: "listo" | "en_curso" | "error" | "restaurando" | "error_restaurar";
}
interface EstadoVps {
  carpeta: string;
  disco: { total: number; usado: number; libre: number };
  archivos: ArchivoRespaldo[];
  errores: Record<string, string>;
}
type TipoRespaldo = "carpeta" | "vps" | "base" | "pterodactyl";

const LIMITE_DESCARGA = 300 * 1024 * 1024;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const NOMBRE_TIPO: Record<TipoRespaldo, string> = { carpeta: "Carpeta", vps: "VPS completo", base: "Base de Mi Setup", pterodactyl: "Todo Pterodactyl" };
const ESTILO_TIPO: Record<TipoRespaldo, { icono: LucideIcon; tono: string; color: string }> = {
  base: { icono: Database, tono: SUAVE.acento, color: "var(--acento)" },
  pterodactyl: { icono: Boxes, tono: "bg-[color-mix(in_srgb,#4c8dff_14%,transparent)] text-sky-300", color: "#4c8dff" },
  carpeta: { icono: FolderArchive, tono: "bg-[color-mix(in_srgb,#ec4899_14%,transparent)] text-pink-300", color: "#ec4899" },
  vps: { icono: Server, tono: SUAVE.aviso, color: "var(--aviso)" },
};

function tipoDe(nombre: string): TipoRespaldo {
  const n = nombre.replace(/^auto-/, "");
  if (n.startsWith("vps-completo-")) return "vps";
  if (n.startsWith("pterodactyl-")) return "pterodactyl";
  if (n.endsWith(".sql.gz") || n.startsWith("base-")) return "base";
  return "carpeta";
}

const limpio = (nombre: string) => nombre.replace(/\.(parte|error|restaurando|restaurar-error)$/, "");

function RespaldoJuego() {
  const puede = usePuede("pterodactyl", "escritura");
  const servidores = useQuery({ queryKey: ["ptero", "servidores"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/ptero/servidores"), retry: false, enabled: puede });
  const crear = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((x) => api(`/api/ptero/servidores/${x}/respaldos`, { metodo: "POST" }))),
    onSuccess: () => {
      avisar("Respaldo pedido al panel. Aparece abajo cuando termine.");
      void queryClient.invalidateQueries({ queryKey: ["ptero"] });
    },
    onError: avisarError,
  });
  if (!puede || !servidores.data?.length) return null;
  return (
    <div className="space-y-1.5">
      {servidores.data.map((s) => (
        <div key={s.id} className="flex items-center gap-3 border-b border-borde py-2 last:border-0">
          <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", SUAVE.acento)}>
            <Gamepad2 className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{s.nombre}</p>
          <Boton tamano="sm" cargando={crear.isPending && crear.variables?.length === 1 && crear.variables[0] === s.id} disabled={crear.isPending} onClick={() => crear.mutate([s.id])}>
            Respaldar
          </Boton>
        </div>
      ))}
      {servidores.data.length > 1 ? (
        <Boton
          tamano="sm"
          className="w-full"
          disabled={crear.isPending}
          onClick={async () => {
            if (await confirmar({ titulo: "Respaldar todos", mensaje: `Se pedirá un respaldo de los ${servidores.data!.length} servidores de juego al panel.`, boton: "Respaldar todos" })) crear.mutate(servidores.data!.map((s) => s.id));
          }}
        >
          Respaldar todos
        </Boton>
      ) : null}
      <p className="text-xs text-tenue">Usa el respaldo del panel: guarda el mundo y los archivos sin apagar el servidor.</p>
    </div>
  );
}

function Restaurar({ servidorId, nombre, alCerrar, alTerminar }: { servidorId: string; nombre: string; alCerrar: () => void; alTerminar: () => void }) {
  const soloAparte = /^(auto-)?vps-completo-/.test(nombre);
  const esBase = nombre.endsWith(".sql.gz");
  const [modo, setModo] = useState<"aparte" | "lugar">("aparte");
  const [texto, setTexto] = useState("");
  const restaurar = useMutation({
    mutationFn: () => api<{ destino: string | null }>("/api/respaldos/vps/restaurar", { cuerpo: { servidorId, nombre, modo, ...(modo === "lugar" ? { confirmacion: texto } : {}) } }),
    onSuccess: (r) => {
      avisar(r.destino ? `Restaurando en ${r.destino}` : esBase ? "Restaurando la base: Mi Setup se reiniciará al terminar" : "Restaurando en su lugar…");
      alTerminar();
      alCerrar();
    },
    onError: avisarError,
  });
  return (
    <Modal abierto titulo={`Restaurar ${nombre}`} alCerrar={alCerrar}>
      <div className="space-y-3 text-sm">
        <label className={cx("flex items-start gap-3 rounded-xl border p-3", modo === "aparte" ? "border-acento" : "border-borde")}>
          <input type="radio" checked={modo === "aparte"} onChange={() => setModo("aparte")} className="mt-1 accent-[var(--acento)]" />
          <span>
            <b>En una carpeta aparte</b>
            <span className="block text-xs text-tenue">Se saca en /opt/mi-setup/restaurados/ sin tocar nada. Luego copias lo que necesites (en Archivos).</span>
          </span>
        </label>
        <label className={cx("flex items-start gap-3 rounded-xl border p-3", modo === "lugar" ? "border-peligro" : "border-borde", soloAparte && "opacity-50")}>
          <input type="radio" disabled={soloAparte} checked={modo === "lugar"} onChange={() => setModo("lugar")} className="mt-1 accent-[var(--error)]" />
          <span>
            <b>En su lugar</b>
            <span className="block text-xs text-tenue">
              {soloAparte
                ? "El VPS completo solo se restaura aparte (ponerlo encima del sistema encendido lo rompería)."
                : esBase
                  ? "Cambia TODA la base de Mi Setup por la del respaldo. Antes se guarda un respaldo de cómo está ahora y al final Mi Setup se reinicia."
                  : "Los archivos vuelven a donde estaban y reemplazan a los actuales con el mismo nombre. Apaga antes los servidores que usen esa carpeta."}
            </span>
          </span>
        </label>
        {modo === "lugar" ? (
          <Campo etiqueta="Escribe RESTAURAR para confirmar">
            <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="RESTAURAR" />
          </Campo>
        ) : null}
        <Boton variante={modo === "lugar" ? "peligro" : "primario"} icono={RotateCcw} className="w-full" cargando={restaurar.isPending} disabled={modo === "lugar" && texto !== "RESTAURAR"} onClick={() => restaurar.mutate()}>
          Restaurar
        </Boton>
      </div>
    </Modal>
  );
}

interface Programacion {
  id: string;
  servidorId: string;
  tipo: TipoRespaldo;
  ruta?: string;
  frecuencia: "diario" | "semanal";
  dia: number;
  hora: number;
  conservar: number;
  activo: boolean;
  ultimo: string | null;
  ultimoError: string | null;
}

function Automaticos({ servidorId }: { servidorId: string }) {
  const q = useQuery({ queryKey: ["respaldos", "automaticos"], queryFn: () => api<Programacion[]>("/api/respaldos/automaticos"), retry: false });
  const [f, setF] = useState({ tipo: "base" as TipoRespaldo, ruta: "/opt/mi-setup", frecuencia: "diario" as "diario" | "semanal", dia: 0, hora: 3, conservar: 7 });
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["respaldos", "automaticos"] });
  const crear = useMutation({
    mutationFn: () =>
      api("/api/respaldos/automaticos", {
        cuerpo: { servidorId, tipo: f.tipo, ...(f.tipo === "carpeta" ? { ruta: f.ruta } : {}), frecuencia: f.frecuencia, dia: f.dia, hora: f.hora, conservar: f.conservar, zona: Intl.DateTimeFormat().resolvedOptions().timeZone },
      }),
    onSuccess: () => {
      avisar("Respaldo automático programado");
      refrescar();
    },
    onError: avisarError,
  });
  const cambiar = useMutation({ mutationFn: (p: Programacion) => api(`/api/respaldos/automaticos/${p.id}`, { metodo: "PATCH", cuerpo: { activo: !p.activo } }), onSuccess: refrescar, onError: avisarError });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/respaldos/automaticos/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  return (
    <Tarjeta titulo="Respaldos automáticos" icono={CalendarClock}>
      <ErrorCaja error={q.error} />
      <ul className="divide-y divide-borde">
        {q.data?.map((p) => {
          const { icono: Icono, tono } = ESTILO_TIPO[p.tipo];
          return (
            <li key={p.id} className={cx("flex items-center gap-3 py-2.5", !p.activo && "opacity-60")}>
              <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tono)}>
                <Icono className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 text-xs">
                <p className="text-sm font-semibold">
                  {NOMBRE_TIPO[p.tipo]} {p.ruta ? <span className="font-mono text-xs font-normal text-tenue">{p.ruta}</span> : null}
                </p>
                <p className="text-tenue">
                  {p.frecuencia === "diario" ? "Cada día" : `Cada ${DIAS[p.dia]}`} a las {String(p.hora).padStart(2, "0")}:00 · guarda {p.conservar} · {p.ultimo ? `último ${haceCuanto(p.ultimo)}` : "todavía no corre"}
                </p>
                {p.ultimoError ? <p className="flex items-center gap-1 text-peligro"><TriangleAlert className="h-3 w-3" />{p.ultimoError}</p> : null}
              </div>
              <Interruptor activo={p.activo} alCambiar={() => cambiar.mutate(p)} etiqueta={p.activo ? "Activo" : "Pausado"} />
              <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar" onClick={() => borrar.mutate(p.id)} />
            </li>
          );
        })}
        {q.data?.length === 0 ? <li className="py-2 text-sm text-tenue">Ninguno todavía.</li> : null}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Selector value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoRespaldo })} className="h-9 text-sm" aria-label="Qué respaldar">
          {Object.entries(NOMBRE_TIPO).map(([id, t]) => (
            <option key={id} value={id}>
              {t}
            </option>
          ))}
        </Selector>
        {f.tipo === "carpeta" ? <Entrada value={f.ruta} onChange={(e) => setF({ ...f, ruta: e.target.value })} className="h-9 font-mono text-sm" aria-label="Carpeta" /> : null}
        <Selector value={f.frecuencia} onChange={(e) => setF({ ...f, frecuencia: e.target.value as "diario" | "semanal" })} className="h-9 text-sm" aria-label="Cada cuánto">
          <option value="diario">Cada día</option>
          <option value="semanal">Cada semana</option>
        </Selector>
        {f.frecuencia === "semanal" ? (
          <Selector value={f.dia} onChange={(e) => setF({ ...f, dia: Number(e.target.value) })} className="h-9 text-sm" aria-label="Día">
            {DIAS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Selector>
        ) : null}
        <Selector value={f.hora} onChange={(e) => setF({ ...f, hora: Number(e.target.value) })} className="h-9 text-sm" aria-label="Hora">
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </Selector>
        <Selector value={f.conservar} onChange={(e) => setF({ ...f, conservar: Number(e.target.value) })} className="h-9 text-sm" aria-label="Cuántos guardar">
          {[3, 5, 7, 14, 30].map((n) => (
            <option key={n} value={n}>
              Guardar {n}
            </option>
          ))}
        </Selector>
        <Boton tamano="sm" variante="primario" icono={Plus} className="h-9" cargando={crear.isPending} onClick={() => crear.mutate()} disabled={!servidorId}>
          Programar
        </Boton>
      </div>
      <p className="mt-2 text-xs text-tenue">Se guardan en el mismo servidor como «auto-…». Al pasar del número elegido se borran los más viejos. Si falla, te llega un aviso.</p>
    </Tarjeta>
  );
}

function Crear({ icono: Icono, titulo, texto, tono, cargando, alCrear, principal, children }: { icono: LucideIcon; titulo: string; texto: string; tono: string; cargando: boolean; alCrear: () => void; principal?: boolean; children?: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4">
      <span className={cx("grid h-10 w-10 place-items-center rounded-xl", tono)}>
        <Icono className="h-5 w-5" />
      </span>
      <h3 className="mt-1 text-base font-bold">{titulo}</h3>
      <p className="text-xs text-tenue">{texto}</p>
      {children}
      <div className="mt-auto pt-1">
        <Boton tamano="sm" variante={principal ? "primario" : "secundario"} icono={Plus} cargando={cargando} onClick={alCrear}>
          Crear respaldo
        </Boton>
      </div>
    </section>
  );
}

function Guardados({ servidorId, host, alRestaurar }: { servidorId: string; host: string; alRestaurar: (nombre: string) => void }) {
  const estado = useQuery({
    queryKey: ["respaldos", "vps", servidorId],
    queryFn: () => api<EstadoVps>(`/api/respaldos/vps?servidorId=${servidorId}`),
    enabled: Boolean(servidorId),
    retry: false,
    refetchInterval: (q) => (q.state.data?.archivos.some((a) => a.estado === "en_curso" || a.estado === "restaurando") ? 4000 : 30_000),
  });
  const borrar = useMutation({
    mutationFn: (nombre: string) => api(`/api/respaldos/vps?servidorId=${servidorId}&nombre=${encodeURIComponent(nombre)}`, { metodo: "DELETE" }),
    onSuccess: () => void estado.refetch(),
    onError: avisarError,
  });
  const d = estado.data;
  const pg = usePaginado(d?.archivos, 8);
  const porTipo = (d?.archivos ?? []).reduce<Record<TipoRespaldo, number>>((acc, a) => ({ ...acc, [tipoDe(a.nombre)]: acc[tipoDe(a.nombre)] + a.bytes }), { base: 0, pterodactyl: 0, carpeta: 0, vps: 0 });
  const totalRespaldos = Object.values(porTipo).reduce((a, b) => a + b, 0);
  const total = d ? Math.max(1, d.disco.total) : 1;
  return (
    <Tarjeta titulo="Respaldos guardados" icono={Archive}>
      <ErrorCaja error={estado.error} />
      {estado.isLoading ? <Cargando /> : null}
      {d ? (
        <>
          <div className="mb-3 rounded-xl border border-borde bg-fondo p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tenue">
              <span className="flex min-w-0 items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 shrink-0" /> Guardados en <span className="truncate font-mono">{d.carpeta}</span>
              </span>
              <span className="text-base font-bold text-texto">{fmtBytes(totalRespaldos)}</span>
            </div>
            <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-tarjeta">
              {(Object.keys(porTipo) as TipoRespaldo[]).map((t) =>
                porTipo[t] > 0 ? <span key={t} style={{ width: `${Math.max(1, (porTipo[t] / total) * 100)}%`, background: ESTILO_TIPO[t].color }} title={`${NOMBRE_TIPO[t]}: ${fmtBytes(porTipo[t])}`} /> : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tenue">
              {(Object.keys(porTipo) as TipoRespaldo[]).map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: ESTILO_TIPO[t].color }} />
                  {NOMBRE_TIPO[t]}
                </span>
              ))}
              <span>
                Libre en el servidor <b className="text-texto">{fmtBytes(d.disco.libre)}</b>
              </span>
            </div>
          </div>
          {d.disco.libre < 5 * 1024 ** 3 ? (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--aviso)_10%,transparent)] p-2 text-xs">
              <TriangleAlert className="h-4 w-4 shrink-0 text-aviso" /> Queda poco espacio en el servidor. Descarga los respaldos viejos y bórralos de aquí.
            </p>
          ) : null}
          {d.archivos.length === 0 ? <Vacio icono={Archive} texto="Todavía no hay respaldos hechos desde aquí." /> : null}
          <ul className="divide-y divide-borde">
            {pg.visibles.map((a) => {
              const tipo = tipoDe(a.nombre);
              const { icono: Icono, tono } = ESTILO_TIPO[tipo];
              return (
                <li key={a.nombre} className="py-2">
                  <div className="flex items-center gap-3">
                    <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tono)}>
                      <Icono className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{limpio(a.nombre)}</p>
                      <p className="truncate text-xs text-tenue">
                        {NOMBRE_TIPO[tipo]} · {fmtFechaHora(a.fecha)}
                      </p>
                    </div>
                    {a.estado === "en_curso" ? (
                      <Insignia tono="aviso">
                        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                        Creando… {fmtBytes(a.bytes)}
                      </Insignia>
                    ) : a.estado === "restaurando" ? (
                      <Insignia tono="aviso">
                        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                        Restaurando…
                      </Insignia>
                    ) : a.estado === "error_restaurar" ? (
                      <Insignia tono="peligro">No se pudo restaurar</Insignia>
                    ) : a.estado === "error" ? (
                      <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", SUAVE.peligro)}>
                        <CircleX className="h-3 w-3" />
                        Falló
                      </span>
                    ) : (
                      <span className="hidden shrink-0 text-xs text-tenue sm:block">{fmtBytes(a.bytes)}</span>
                    )}
                    {a.estado === "listo" && a.bytes <= LIMITE_DESCARGA ? (
                      <Boton
                        tamano="icono"
                        variante="fantasma"
                        icono={Download}
                        aria-label={`Descargar ${a.nombre}`}
                        onClick={() => void descargar(`/api/respaldos/vps/descargar?servidorId=${servidorId}&nombre=${encodeURIComponent(a.nombre)}`, a.nombre).catch(avisarError)}
                      />
                    ) : null}
                    {a.estado === "listo" ? <Boton tamano="icono" variante="fantasma" icono={RotateCcw} aria-label={`Restaurar ${a.nombre}`} title="Restaurar" onClick={() => alRestaurar(a.nombre)} /> : null}
                    {a.estado !== "en_curso" && a.estado !== "restaurando" ? (
                      <Boton
                        tamano="icono"
                        variante="fantasma"
                        icono={Trash2}
                        aria-label={`Borrar ${a.nombre}`}
                        className="hover:text-peligro"
                        onClick={async () => {
                          if (await confirmar({ titulo: "Borrar respaldo", mensaje: `${limpio(a.nombre)} se borra del servidor para siempre.`, peligroso: true, boton: "Borrar" })) borrar.mutate(a.nombre);
                        }}
                      />
                    ) : null}
                  </div>
                  {(a.estado === "error" || a.estado === "error_restaurar") && d.errores[a.nombre] ? <p className="ml-12 mt-1 text-xs text-peligro">{d.errores[a.nombre]}</p> : null}
                  {a.estado === "listo" && a.bytes > LIMITE_DESCARGA ? (
                    <button type="button" className="ml-12 mt-1 text-xs text-acento underline" onClick={() => void copiarSeguro(`scp root@${host}:${d.carpeta}/${a.nombre} .`, "Comando copiado")}>
                      Muy grande para bajarlo aquí: copiar comando para tu PC
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {pg.paginas}
        </>
      ) : null}
    </Tarjeta>
  );
}

function ServidoresJuego() {
  const [id, setId] = useState<string>("");
  const servidores = useQuery({ queryKey: ["ptero", "servidores"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/ptero/servidores"), retry: false });
  const actual = id || servidores.data?.[0]?.id || "";
  return (
    <Tarjeta titulo="Servidores de juego" icono={Gamepad2}>
      <ErrorCaja error={servidores.error} />
      {servidores.data?.length === 0 ? <Vacio icono={Gamepad2} texto="No hay servidores en el panel." /> : null}
      <RespaldoJuego />
      {servidores.data?.length ? (
        <div className="mt-3 border-t border-borde pt-3">
          <Selector value={actual} onChange={(e) => setId(e.target.value)} className="mb-2 h-9 text-sm" aria-label="Ver respaldos de">
            {servidores.data.map((s) => (
              <option key={s.id} value={s.id}>
                {`Respaldos de ${s.nombre}`}
              </option>
            ))}
          </Selector>
          {actual ? <RespaldosServidor key={actual} id={actual} /> : null}
        </div>
      ) : null}
    </Tarjeta>
  );
}

function RespaldoDiarioBase({ alTerminar }: { alTerminar: () => void }) {
  const correr = useMutation({
    mutationFn: (d: { ahora: boolean; programar: boolean }) => api<{ programado: boolean }>("/api/respaldos/base/script", { cuerpo: d }),
    onSuccess: (_r, d) => {
      avisar(d.programar ? (d.ahora ? "Respaldo hecho y programado cada día a las 4:15" : "Programado cada día a las 4:15") : "Respaldo hecho");
      alTerminar();
    },
    onError: avisarError,
  });
  return (
    <div className="mb-3 rounded-xl border border-[color-mix(in_srgb,var(--aviso)_40%,transparent)] bg-[color-mix(in_srgb,var(--aviso)_7%,var(--superficie))] p-3 text-sm">
      <p className="text-tenue">El respaldo diario no está corriendo en tu servidor. Hazlo aquí (base + archivos subidos, guarda 14 días):</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Boton tamano="sm" variante="primario" icono={Database} cargando={correr.isPending && correr.variables?.programar} disabled={correr.isPending} onClick={() => correr.mutate({ ahora: true, programar: true })}>
          Respaldar ahora y cada día
        </Boton>
        <Boton tamano="sm" cargando={correr.isPending && !correr.variables?.programar} disabled={correr.isPending} onClick={() => correr.mutate({ ahora: true, programar: false })}>
          Solo ahora
        </Boton>
      </div>
    </div>
  );
}

function BaseMiSetup({ maestra }: { maestra: boolean }) {
  const base = useQuery({ queryKey: ["respaldos", "base"], queryFn: () => api<EstadoBase>("/api/respaldos/base"), retry: false });
  const pg = usePaginado(base.data?.archivos, 6);
  return (
    <Tarjeta titulo="Base de datos de Mi Setup" icono={Database} acciones={base.data ? <Insignia tono={base.data.alDia ? "ok" : "peligro"}>{base.data.alDia ? "Al día" : "Atrasado"}</Insignia> : null}>
      <ErrorCaja error={base.error} />
      {base.isLoading ? <Cargando /> : null}
      {base.data?.ultimo ? (
        <p className="mb-3 text-sm">
          Último: <span className="font-medium">{base.data.ultimo.nombre}</span> · {haceCuanto(base.data.ultimo.fecha)} · {fmtBytes(base.data.ultimo.bytes)}
        </p>
      ) : base.data ? (
        <Vacio icono={Archive} texto="Aún no hay respaldos en la carpeta." />
      ) : null}
      {maestra && base.data && !base.data.alDia ? <RespaldoDiarioBase alTerminar={() => void base.refetch()} /> : null}
      <ul className="divide-y divide-borde">
        {pg.visibles.map((a) => (
          <li key={a.nombre} className="flex items-center justify-between gap-2 py-1.5 text-xs">
            <span className="min-w-0 truncate">{a.nombre}</span>
            <span className="flex shrink-0 items-center gap-2 text-tenue">
              {fmtFechaHora(a.fecha)} · {fmtBytes(a.bytes)}
              {maestra ? (
                <Boton tamano="icono" variante="fantasma" icono={Download} aria-label={`Descargar ${a.nombre}`} onClick={() => void descargar(`/api/respaldos/base/descargar/${encodeURIComponent(a.nombre)}`, a.nombre).catch(avisarError)} />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {pg.paginas}
    </Tarjeta>
  );
}

function MisDatos() {
  return (
    <Tarjeta titulo="Mis datos" icono={FileJson}>
      <p className="text-sm text-tenue">Descarga todo lo tuyo (notas, tareas, finanzas, suscripciones, calendario, enlaces, prompts y tu lista por ver) en un archivo. Guárdalo en tu PC o en la nube.</p>
      <Boton className="mt-3" icono={Download} onClick={() => void descargar("/api/respaldos/mis-datos", `mis-datos-${new Date().toISOString().slice(0, 10)}.json`).catch(avisarError)}>
        Descargar mis datos
      </Boton>
      <p className="mt-3 text-xs text-tenue">Tus archivos subidos (música, videos, compartidos) viven en el volumen misetup_archivos del servidor; el script de respaldo también los copia (ver USO.md).</p>
    </Tarjeta>
  );
}

export default function Respaldos() {
  const verPtero = usePuede("pterodactyl");
  const maestra = useMe().data?.usuario.role === "maestra";
  const servidores = useQuery({ queryKey: ["vps", "servidores"], queryFn: () => api<ServidorVps[]>("/api/vps/servidores"), retry: false, enabled: maestra });
  const [sid, setSid] = useState("");
  const [ruta, setRuta] = useState("/opt/mi-setup");
  const [restaurar, setRestaurar] = useState<string | null>(null);
  const actual = sid || servidores.data?.[0]?.id || "";
  const host = servidores.data?.find((s) => s.id === actual)?.host ?? "TU_IP";
  const crear = useMutation({
    mutationFn: (b: { tipo: TipoRespaldo; ruta?: string }) => api<{ nombre: string }>("/api/respaldos/vps", { cuerpo: { servidorId: actual, ...b } }),
    onSuccess: (r) => {
      avisar(`Respaldo iniciado (${r.nombre}). Sigue en segundo plano en el servidor.`);
      void queryClient.invalidateQueries({ queryKey: ["respaldos", "vps", actual] });
    },
    onError: avisarError,
  });
  const enCurso = crear.isPending ? crear.variables?.tipo : null;

  return (
    <>
      <Encabezado
        titulo="Respaldos"
        descripcion="Copias de tu servidor para no perder nada."
        acciones={
          <>
            {servidores.data && servidores.data.length > 1 ? (
              <div className="w-44">
                <Selector value={actual} onChange={(e) => setSid(e.target.value)} className="h-10 text-sm" aria-label="Servidor">
                  {servidores.data.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Selector>
              </div>
            ) : null}
            <Boton icono={RefreshCw} onClick={() => void queryClient.invalidateQueries({ queryKey: ["respaldos"] })}>
              Actualizar
            </Boton>
          </>
        }
      />
      {maestra ? (
        <>
          <ErrorCaja error={servidores.error} />
          {servidores.data?.length === 0 ? <Vacio icono={Server} texto="Agrega tu servidor en Terminal para crear respaldos desde aquí." /> : null}
          {actual ? (
            <div className={cx("mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2", PUBLICA ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
              <Crear icono={FolderArchive} titulo="Una carpeta" texto="Elige qué carpeta guardar." tono={ESTILO_TIPO.carpeta.tono} cargando={enCurso === "carpeta"} alCrear={() => (ruta.startsWith("/") ? crear.mutate({ tipo: "carpeta", ruta }) : avisar("La carpeta debe empezar con /", "error"))}>
                <Entrada value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="/opt/mi-setup" className="h-9 font-mono text-sm" aria-label="Carpeta a respaldar" />
              </Crear>
              {PUBLICA ? null : (
                <Crear icono={Boxes} titulo="Todo Pterodactyl" texto="Los archivos de tus servidores de juego, Wings y el panel." tono={ESTILO_TIPO.pterodactyl.tono} cargando={enCurso === "pterodactyl"} alCrear={() => crear.mutate({ tipo: "pterodactyl" })} />
              )}
              <Crear icono={Database} titulo="Base de Mi Setup" texto="Tus notas, finanzas, sitios y demás, ahora mismo." tono={ESTILO_TIPO.base.tono} principal cargando={enCurso === "base"} alCrear={() => crear.mutate({ tipo: "base" })} />
              <Crear
                icono={Server}
                titulo="VPS completo"
                texto="Casi todo el disco. Puede pesar varios GB."
                tono={ESTILO_TIPO.vps.tono}
                cargando={enCurso === "vps"}
                alCrear={async () => {
                  if (await confirmar({ titulo: "Respaldar todo el servidor", mensaje: "Puede ocupar varios GB y tardar varios minutos. Corre en segundo plano.", boton: "Crear respaldo completo" })) crear.mutate({ tipo: "vps" });
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {maestra && actual ? <Guardados servidorId={actual} host={host} alRestaurar={setRestaurar} /> : null}
          <BaseMiSetup maestra={maestra} />
        </div>
        <div className="min-w-0 space-y-4">
          {maestra && actual ? <Automaticos servidorId={actual} /> : null}
          {!PUBLICA && verPtero ? <ServidoresJuego /> : null}
          <MisDatos />
        </div>
      </div>
      {restaurar && actual ? (
        <Restaurar servidorId={actual} nombre={restaurar} alCerrar={() => setRestaurar(null)} alTerminar={() => void queryClient.invalidateQueries({ queryKey: ["respaldos", "vps", actual] })} />
      ) : null}
    </>
  );
}
