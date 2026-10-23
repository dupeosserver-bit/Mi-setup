import { useMutation, useQuery } from "@tanstack/react-query";
import { Braces, ExternalLink, FolderTree, KeyRound, Laptop, Network, Pencil, Plug, Plus, ScrollText, Search, Server, ShieldCheck, TerminalSquare, Trash2, X, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { confirmar } from "../../lib/confirmar";
import { queryClient, usePuede } from "../../lib/consultas";
import { haceCuanto } from "../../lib/formato";
import { type Servidor } from "../../lib/vps";
import { usePaginado } from "../Paginas";
import { Boton, Insignia, Vacio, avisarError, cx } from "../ui";

export type SeccionHosts = "hosts" | "llavero" | "tuneles" | "comandos" | "conocidos" | "registros";

export interface ComandoGuardado {
  id: string;
  nombre: string;
  comando: string;
  descripcion: string;
  peligroso: boolean;
}

export interface EntradaHistorial {
  servidorId: string;
  comando: string;
  fecha: string;
}

export const SECCIONES: [SeccionHosts, LucideIcon, string][] = [
  ["hosts", Server, "Hosts"],
  ["llavero", KeyRound, "Llavero"],
  ["tuneles", Network, "Túneles"],
  ["comandos", Braces, "Comandos"],
  ["conocidos", ShieldCheck, "Hosts conocidos"],
  ["registros", ScrollText, "Registros"],
];

const COLORES = ["#e95420", "#3949ab", "#2e9e6b", "#8b5cf6", "#0ea5e9", "#d946ef"];
const colorDe = (id: string) => COLORES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length]!;

export const normalizarNombre = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");

function TarjetaHost({ titulo, detalle, color, icono: Icono, sel, estado, alTocar, alAbrir }: { titulo: string; detalle: string; color: string; icono: LucideIcon; sel?: boolean; estado?: Servidor["estado"]; alTocar: () => void; alAbrir: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={alTocar}
      onDoubleClick={alAbrir}
      onKeyDown={(e) => e.key === "Enter" && alAbrir()}
      className={cx("grid cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-tarjeta p-3 text-left", sel ? "border-acento shadow-[0_0_0_1px_var(--acento)]" : "border-borde")}
    >
      <span className="grid h-10 w-10 place-items-center rounded-[11px] text-white" style={{ background: color }}>
        <Icono className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <b className="block truncate text-sm">{titulo}</b>
        <small className="block truncate text-[11px] text-tenue">{detalle}</small>
      </span>
      <span className="flex items-center gap-1.5">
        {estado ? <span className={cx("h-2 w-2 rounded-full", estado === "arriba" ? "bg-ok" : estado === "caido" ? "bg-peligro" : "bg-tenue")} /> : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            alAbrir();
          }}
          className="grid h-8 w-8 place-items-center rounded-lg text-acento hover:bg-fondo"
          aria-label={`Conectar a ${titulo}`}
        >
          <TerminalSquare className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}

function DatosHost({ s, alCerrar, alConectar, alProbar, alEditar, alBorrar, esAdmin }: { s: Servidor; alCerrar: () => void; alConectar: () => void; alProbar: () => void; alEditar: () => void; alBorrar: () => void; esAdmin: boolean }) {
  const fila = (t: string, v: string, mono = false) => (
    <div className="flex h-[38px] items-center gap-2 rounded-[9px] border border-borde bg-fondo px-3 text-sm">
      <span className="w-16 shrink-0 text-xs text-tenue">{t}</span>
      <span className={cx("min-w-0 truncate", mono && "font-mono text-xs")}>{v}</span>
    </div>
  );
  return (
    <aside className="flex min-h-0 flex-col border-l border-borde bg-superficie">
      <div className="flex items-center justify-between border-b border-borde px-4 py-3.5 font-bold">
        Datos del host
        <Boton tamano="icono" variante="fantasma" icono={X} onClick={alCerrar} aria-label="Cerrar" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="space-y-2 rounded-xl bg-tarjeta p-3.5">
          <h4 className="text-[13px] font-semibold">General</h4>
          {fila("Nombre", s.nombre)}
          {fila("Dirección", s.host, true)}
          {fila("Estado", s.estado === "arriba" ? "En línea" : s.estado === "caido" ? "Sin respuesta" : "Sin revisar")}
          {s.ultimaRevision ? fila("Revisado", haceCuanto(s.ultimaRevision)) : null}
        </div>
        <div className="space-y-2 rounded-xl bg-tarjeta p-3.5">
          <h4 className="flex items-center gap-2 text-[13px] font-semibold">
            SSH en el puerto <kbd className="rounded-md border border-borde px-1.5 font-mono text-[11px]">{s.puerto}</kbd> {s.esRoot ? <Insignia tono="aviso">root</Insignia> : null}
          </h4>
          {fila("Usuario", s.usuario)}
          {fila("Entrada", s.tipo === "llave" ? `Llave guardada${s.conFrase ? " · con frase" : ""}` : "Contraseña guardada")}
          {fila("Huella", s.huella ? `${s.huella.slice(0, 18)}… ✓` : "Se acepta al conectar", true)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Boton tamano="sm" icono={Plug} onClick={alProbar}>Probar</Boton>
          <Link to={`/vps/archivos?servidor=${s.id}`} className="inline-flex h-8 items-center gap-2 rounded-xl border border-borde bg-tarjeta px-3 text-xs font-medium">
            <FolderTree className="h-4 w-4" /> SFTP
          </Link>
          {esAdmin ? (
            <>
              <Boton tamano="sm" variante="fantasma" icono={Pencil} onClick={alEditar}>Editar</Boton>
              <Boton tamano="sm" variante="fantasma" icono={Trash2} onClick={alBorrar}>Quitar</Boton>
            </>
          ) : null}
        </div>
      </div>
      <div className="border-t border-borde p-3">
        <Boton variante="primario" icono={TerminalSquare} className="h-[42px] w-full" onClick={alConectar}>
          Conectar
        </Boton>
      </div>
    </aside>
  );
}

function Comandos({ alUsar }: { alUsar: (c: ComandoGuardado) => void }) {
  const puede = usePuede("vps_comandos", "lectura");
  const comandos = useQuery({ queryKey: ["vps", "comandos"], queryFn: () => api<ComandoGuardado[]>("/api/vps/comandos"), enabled: puede });
  const { visibles, paginas } = usePaginado(comandos.data, 12);
  if (!puede) return <Vacio texto="No tienes permiso para ver los comandos guardados." />;
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-tenue">En la terminal escribe /nombre y se ejecuta.</p>
        <Link to="/vps/comandos" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-acento">
          Administrar <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      {comandos.data?.length === 0 ? <Vacio icono={Braces} texto="Aún no guardas comandos." /> : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
        {visibles.map((c) => (
          <button key={c.id} type="button" onClick={() => alUsar(c)} className="min-w-0 rounded-xl border border-borde bg-tarjeta p-3 text-left hover:border-acento">
            <b className="flex items-center gap-2 font-mono text-xs text-acento">
              /{normalizarNombre(c.nombre)} {c.peligroso ? <Insignia tono="peligro">peligroso</Insignia> : null}
            </b>
            {c.descripcion ? <small className="mt-1 block truncate text-xs text-tenue">{c.descripcion}</small> : null}
            <code className="mt-2 block truncate font-mono text-[11px] text-tenue">{c.comando}</code>
          </button>
        ))}
      </div>
      {paginas}
    </>
  );
}

function Registros({ servidores, alUsar }: { servidores: Servidor[]; alUsar: (comando: string) => void }) {
  const [filtro, setFiltro] = useState<string>("");
  const historial = useQuery({ queryKey: ["vps", "historial", filtro || null], queryFn: () => api<EntradaHistorial[]>(`/api/vps/historial${filtro ? `?servidorId=${filtro}` : ""}`) });
  const { visibles, paginas } = usePaginado(historial.data, 20);
  const borrar = useMutation({
    mutationFn: () => api("/api/vps/historial", { metodo: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["vps", "historial"] }),
    onError: avisarError,
  });
  const nombre = new Map(servidores.map((s) => [s.id, s.nombre]));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {[{ id: "", nombre: "Todos" }, ...servidores].map((s) => (
            <button key={s.id || "todos"} type="button" onClick={() => setFiltro(s.id)} className={cx("h-8 shrink-0 rounded-full border px-3 text-xs", filtro === s.id ? "border-acento text-acento" : "border-borde text-tenue")}>
              {s.nombre}
            </button>
          ))}
        </div>
        {historial.data?.length ? (
          <Boton
            tamano="sm"
            variante="fantasma"
            className="ml-auto"
            onClick={async () => {
              if (await confirmar({ titulo: "Borrar historial", mensaje: "Se borra el historial de todos tus servidores." })) borrar.mutate();
            }}
          >
            Borrar todo
          </Boton>
        ) : null}
      </div>
      {historial.data?.length === 0 ? <Vacio icono={ScrollText} texto="Aquí salen los comandos que ejecutes." /> : null}
      <div className="space-y-1">
        {visibles.map((h) => (
          <button key={`${h.fecha}-${h.comando}`} type="button" onClick={() => alUsar(h.comando)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-tarjeta">
            <code className="truncate font-mono text-xs">{h.comando}</code>
            <small className="whitespace-nowrap text-[11px] text-tenue">
              {nombre.get(h.servidorId) ?? "—"} · {haceCuanto(h.fecha)}
            </small>
          </button>
        ))}
      </div>
      {paginas}
    </>
  );
}

export function VistaHosts({
  seccion,
  servidores,
  shells,
  esAdmin,
  alAbrir,
  alAbrirLocal,
  alProbar,
  alEditar,
  alBorrar,
  alNuevo,
  alUsarComando,
  alUsarTexto,
}: {
  seccion: SeccionHosts;
  servidores: Servidor[];
  shells: { id: string; nombre: string }[];
  esAdmin: boolean;
  alAbrir: (s: Servidor) => void;
  alAbrirLocal: (shell: string, nombre: string) => void;
  alProbar: (s: Servidor) => void;
  alEditar: (s: Servidor) => void;
  alBorrar: (s: Servidor) => void;
  alNuevo: () => void;
  alUsarComando: (c: ComandoGuardado) => void;
  alUsarTexto: (t: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? servidores.filter((s) => `${s.nombre} ${s.usuario}@${s.host}`.toLowerCase().includes(q)) : servidores;
  }, [servidores, busca]);
  const sel = servidores.find((s) => s.id === elegido) ?? null;

  const conectarEscrito = () => {
    const q = busca.trim().toLowerCase();
    const exacto = servidores.find((s) => `${s.usuario}@${s.host}`.toLowerCase() === q || s.host.toLowerCase() === q || s.nombre.toLowerCase() === q) ?? filtrados[0];
    if (exacto) alAbrir(exacto);
    else if (esAdmin) alNuevo();
  };

  let cuerpo;
  if (seccion === "hosts") {
    cuerpo = (
      <>
        <form
          className="mb-3 flex h-[42px] items-center gap-2 rounded-[11px] border border-borde bg-tarjeta pl-3.5 pr-1.5 text-tenue"
          onSubmit={(e) => {
            e.preventDefault();
            conectarEscrito();
          }}
        >
          <Search className="h-4 w-4 shrink-0" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busca un host o escribe usuario@servidor…" className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-tenue" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <Boton type="submit" tamano="sm">Conectar</Boton>
        </form>
        {esAdmin ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <Boton tamano="sm" icono={Plus} onClick={alNuevo}>Nuevo host</Boton>
          </div>
        ) : null}
        {shells.length ? (
          <>
            <p className="mb-2.5 mt-1.5 font-bold">Esta PC</p>
            <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
              {shells.map((sh) => (
                <TarjetaHost key={sh.id} titulo={sh.nombre} detalle="Terminal de esta PC" color="#3949ab" icono={Laptop} alTocar={() => alAbrirLocal(sh.id, sh.nombre)} alAbrir={() => alAbrirLocal(sh.id, sh.nombre)} />
              ))}
            </div>
          </>
        ) : null}
        <p className="mb-2.5 mt-1.5 font-bold">Servidores</p>
        {servidores.length === 0 ? <Vacio icono={Server} texto="Agrega tu VPS con su llave SSH." /> : null}
        <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
          {filtrados.map((s) => (
            <TarjetaHost key={s.id} titulo={s.nombre} detalle={`ssh, ${s.usuario}`} color={colorDe(s.id)} icono={Server} sel={s.id === elegido} estado={s.estado} alTocar={() => (window.matchMedia("(min-width: 1024px)").matches ? setElegido(s.id) : alAbrir(s))} alAbrir={() => alAbrir(s)} />
          ))}
        </div>
      </>
    );
  } else if (seccion === "llavero") {
    cuerpo = (
      <>
        <p className="mb-3 text-sm text-tenue">Cómo entra la app a cada servidor. Las llaves y contraseñas se guardan cifradas y nunca se muestran.</p>
        <div className="space-y-2">
          {servidores.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-borde bg-tarjeta p-3">
              <KeyRound className="h-5 w-5 shrink-0 text-acento" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{s.tipo === "llave" ? "Llave privada" : "Contraseña"} · {s.nombre}</b>
                <small className="block truncate text-xs text-tenue">
                  {s.usuario}@{s.host}
                  {s.conFrase ? " · con frase" : ""}
                </small>
              </span>
              {esAdmin ? <Boton tamano="sm" variante="fantasma" icono={Pencil} onClick={() => alEditar(s)}>Cambiar</Boton> : null}
            </div>
          ))}
        </div>
      </>
    );
  } else if (seccion === "tuneles") {
    cuerpo = <Vacio icono={Network} texto="Pronto: abrir un puerto de tu servidor en esta PC (túnel SSH). Por ahora usa la terminal o Tailscale." />;
  } else if (seccion === "comandos") {
    cuerpo = <Comandos alUsar={alUsarComando} />;
  } else if (seccion === "conocidos") {
    cuerpo = (
      <>
        <p className="mb-3 text-sm text-tenue">La huella confirma que te conectas al servidor de siempre. Si cambia sin que reinstalaras, no aceptes.</p>
        <div className="space-y-2">
          {servidores.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-tarjeta p-3">
              <ShieldCheck className={cx("h-5 w-5 shrink-0", s.huella ? "text-ok" : "text-tenue")} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{s.host}:{s.puerto}</b>
                <small className="block truncate font-mono text-[11px] text-tenue">{s.huella ?? "Sin huella: se acepta en la primera conexión"}</small>
              </span>
              <Boton tamano="sm" icono={Plug} onClick={() => alProbar(s)}>Revisar</Boton>
            </div>
          ))}
        </div>
      </>
    );
  } else {
    cuerpo = <Registros servidores={servidores} alUsar={alUsarTexto} />;
  }

  return (
    <div className={cx("grid min-h-0 flex-1", sel && seccion === "hosts" ? "grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-[minmax(0,1fr)]")}>
      <section className="min-h-0 overflow-y-auto px-3 py-4 sm:px-5">{cuerpo}</section>
      {sel && seccion === "hosts" ? (
        <div className="hidden min-h-0 lg:flex lg:flex-col">
          <DatosHost s={sel} esAdmin={esAdmin} alCerrar={() => setElegido(null)} alConectar={() => alAbrir(sel)} alProbar={() => alProbar(sel)} alEditar={() => alEditar(sel)} alBorrar={() => alBorrar(sel)} />
        </div>
      ) : null}
    </div>
  );
}
