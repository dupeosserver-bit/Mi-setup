/**
 * Estructura de la app.
 * - PC: barra superior mínima (logo, buscar, conexión, cuenta) y barra lateral
 *   con ícono y nombre de cada apartado, agrupados por categoría; se puede
 *   compactar a solo íconos.
 * - Celular: botón de tres rayas → panel lateral con íconos y texto, lupa,
 *   equipos con indicador conectado/desconectado y botón "+" flotante.
 */
import { MODULES, temas, type ModuleId } from "@mi-setup/shared";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronsLeft, ChevronsRight, CircleHelp, LogOut, Menu, MessagesSquare, NotebookPen, Plus, Search, X } from "lucide-react";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { AYUDA } from "../lib/ayuda";
import { queryClient, useApariencia, useMe } from "../lib/consultas";
import { olvidarDispositivo } from "../lib/dispositivo";
import { mostrarNotificacion, prepararNotificaciones } from "../lib/notificaciones";
import { escritorio } from "../lib/plataforma";
import { usePreferencias } from "../lib/preferencias";
import { useSesion } from "../lib/sesion";
import { tiempoReal, useEstadoConexion, useTema } from "../lib/tiempo-real";
import { CATEGORIAS, MODULOS_UI, moduloPorRuta } from "../modulos";
import { AsistenteFlotante } from "./Asistente";
import { Buscador } from "./Buscador";
import { ErrorPantalla } from "./ErrorPantalla";
import { Logo } from "./Logo";
import { Cargando, Modal, Punto, cx } from "./ui";

const CLAVE_RECIENTES = "mi-setup.recientes";
const CLAVE_LATERAL = "mi-setup.lateral";

export async function cerrarSesion(): Promise<void> {
  await api("/api/auth/logout", { metodo: "POST" }).catch(() => undefined);
  tiempoReal.detener();
  useSesion.getState().salir();
  queryClient.clear();
}

function useVisibles(): Set<ModuleId> {
  const { data } = useMe();
  return useMemo(() => {
    const s = new Set<ModuleId>();
    if (!data) return s;
    for (const [id, nivel] of Object.entries(data.permisos)) if (nivel !== "ninguno") s.add(id as ModuleId);
    return s;
  }, [data]);
}

function agruparVisibles(visibles: Set<ModuleId>) {
  return CATEGORIAS.map((c) => ({
    ...c,
    modulos: Object.values(MODULOS_UI).filter((mod) => MODULES[mod.id].category === c.id && visibles.has(mod.id)),
  })).filter((c) => c.modulos.length > 0);
}

interface Equipo {
  id: string;
  nombre: string;
  tipo: string;
  conectado: boolean;
}

function useEquipos(activo: boolean) {
  useTema(activo ? temas.dispositivos : null, () => void queryClient.invalidateQueries({ queryKey: ["equipos"] }));
  return useQuery({ queryKey: ["equipos"], queryFn: () => api<Equipo[]>("/api/equipos"), enabled: activo });
}

// ---------------------------------------------------------------- PC

function BarraSuperior({ alBuscar, avatar }: { alBuscar: () => void; avatar: string | null }) {
  const { data: me } = useMe();
  const conexion = useEstadoConexion();
  return (
    <div className="hidden h-12 shrink-0 items-center gap-3 border-b border-borde bg-superficie px-4 md:flex">
      <Link to="/" className="flex items-center">
        <Logo tamano="sm" />
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <button type="button" onClick={alBuscar} className="flex h-8 items-center gap-2 rounded-lg border border-borde px-3 text-xs text-tenue hover:text-texto">
          <Search className="h-3.5 w-3.5" /> Buscar <span className="text-[10px]">Ctrl+K</span>
        </button>
        <Punto conectado={conexion === "conectado"} texto />
        <Link to="/ajustes" className="flex items-center gap-2 text-xs text-tenue hover:text-texto">
          {avatar ? <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" /> : null}
          {me?.usuario.displayName}
        </Link>
      </div>
    </div>
  );
}

function BarraLateral({ grupos, compacta, alternar }: { grupos: ReturnType<typeof agruparVisibles>; compacta: boolean; alternar: () => void }) {
  return (
    <nav className={cx("hidden shrink-0 flex-col border-r border-borde bg-superficie md:flex", compacta ? "w-16" : "w-60")}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {grupos.map((g, i) => (
          <div key={g.id} className={cx(i > 0 && "mt-3")}>
            {compacta ? (
              i > 0 ? <div className="mx-auto mb-2 h-px w-8 bg-borde" /> : null
            ) : (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-tenue">{g.titulo}</div>
            )}
            {g.modulos.map((mod) => (
              <NavLink
                key={mod.id}
                to={mod.ruta}
                end={mod.ruta === "/"}
                title={MODULES[mod.id].label}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-3 rounded-xl text-sm transition-colors",
                    compacta ? "mx-auto h-10 w-10 justify-center" : "px-3 py-2",
                    isActive ? "bg-acento text-black" : "text-tenue hover:bg-tarjeta hover:text-texto",
                  )
                }
              >
                <mod.icono className="h-[18px] w-[18px] shrink-0" />
                {compacta ? null : <span className="truncate">{MODULES[mod.id].label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={alternar}
        className={cx("flex items-center gap-2 border-t border-borde px-4 py-3 text-xs text-tenue hover:text-texto", compacta && "justify-center px-0")}
        title={compacta ? "Mostrar nombres" : "Solo íconos"}
      >
        {compacta ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        {compacta ? null : "Solo íconos"}
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------- celular

function PanelMovil({
  abierto,
  alCerrar,
  grupos,
  visibles,
}: {
  abierto: boolean;
  alCerrar: () => void;
  grupos: ReturnType<typeof agruparVisibles>;
  visibles: Set<ModuleId>;
}) {
  const navegar = useNavigate();
  const { data: me } = useMe();
  const equipos = useEquipos(abierto && visibles.has("equipos"));
  const recientes = (JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? "[]") as ModuleId[]).filter((id) => visibles.has(id));
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={alCerrar} />
      <aside className="safe-top safe-bottom absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col overflow-y-auto border-r border-borde bg-superficie">
        <div className="flex items-center justify-between p-4">
          <Logo tamano="sm" />
          <button type="button" onClick={alCerrar} className="rounded-lg p-2 text-tenue" aria-label="Cerrar menú">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="px-4 pb-2 text-xs text-tenue">{me?.usuario.displayName}</p>

        {equipos.data && equipos.data.length > 0 ? (
          <section className="px-2 pb-2">
            <h4 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-tenue">Equipos</h4>
            {equipos.data.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => (navegar(`/equipos?id=${e.id}`), alCerrar())}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-tarjeta"
              >
                {e.nombre}
                <Punto conectado={e.conectado} texto />
              </button>
            ))}
          </section>
        ) : null}

        {recientes.length > 0 ? (
          <section className="px-2 pb-2">
            <h4 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-tenue">Recientes</h4>
            {recientes.map((id) => {
              const mod = MODULOS_UI[id];
              return (
                <NavLink key={id} to={mod.ruta} onClick={alCerrar} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-tarjeta">
                  <mod.icono className="h-4 w-4 text-tenue" />
                  {MODULES[id].label}
                </NavLink>
              );
            })}
          </section>
        ) : null}

        {grupos.map((g) => (
          <section key={g.id} className="px-2 pb-2">
            <h4 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-tenue">{g.titulo}</h4>
            {g.modulos.map((mod) => (
              <NavLink
                key={mod.id}
                to={mod.ruta}
                onClick={alCerrar}
                className={({ isActive }) => cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm", isActive ? "bg-tarjeta" : "hover:bg-tarjeta")}
              >
                <mod.icono className="h-4 w-4 text-tenue" />
                {MODULES[mod.id].label}
              </NavLink>
            ))}
          </section>
        ))}
        <button
          type="button"
          onClick={() => void cerrarSesion().then(() => navegar("/login"))}
          className="m-4 mt-auto flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-tenue hover:bg-tarjeta"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </aside>
    </div>
  );
}

function BotonMas({ visibles }: { visibles: Set<ModuleId> }) {
  const [abierto, setAbierto] = useState(false);
  const navegar = useNavigate();
  const acciones = [
    { id: "notas" as const, texto: "Nota", icono: NotebookPen, ruta: "/notas?nueva=1" },
    { id: "recordatorios" as const, texto: "Recordatorio", icono: Bell, ruta: "/recordatorios?nuevo=1" },
    { id: "chat" as const, texto: "Mensaje", icono: MessagesSquare, ruta: "/chat" },
  ].filter((a) => visibles.has(a.id));
  if (acciones.length === 0) return null;
  return (
    <div className="safe-bottom fixed bottom-5 right-5 z-30 flex flex-col items-end gap-2 md:hidden">
      {abierto
        ? acciones.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => (setAbierto(false), navegar(a.ruta))}
              className="flex items-center gap-2 rounded-full border border-borde bg-tarjeta px-4 py-2 text-sm shadow-lg"
            >
              <a.icono className="h-4 w-4" /> {a.texto}
            </button>
          ))
        : null}
      <button
        type="button"
        aria-label="Crear"
        onClick={() => setAbierto((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-acento text-black shadow-xl"
      >
        <Plus className={cx("h-6 w-6 transition-transform", abierto && "rotate-45")} />
      </button>
    </div>
  );
}

/** "¿Cómo se usa?": abre los pasos del apartado actual. */
function BotonAyuda({ modulo }: { modulo: ModuleId }) {
  const [abierto, setAbierto] = useState(false);
  const ayuda = AYUDA[modulo];
  return (
    <>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={() => setAbierto(true)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-tenue hover:bg-tarjeta hover:text-texto">
          <CircleHelp className="h-3.5 w-3.5" /> ¿Cómo se usa?
        </button>
      </div>
      <Modal abierto={abierto} titulo={`Cómo usar: ${MODULES[modulo].label}`} alCerrar={() => setAbierto(false)}>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {ayuda.pasos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        {ayuda.nota ? <p className="mt-3 rounded-xl bg-fondo p-3 text-xs text-tenue">{ayuda.nota}</p> : null}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- estructura

export function Layout() {
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const { data: me } = useMe();
  const { data: apariencia } = useApariencia();
  usePreferencias();
  const conexion = useEstadoConexion();
  const visibles = useVisibles();
  const grupos = useMemo(() => agruparVisibles(visibles), [visibles]);
  const [panel, setPanel] = useState(false);
  const [buscar, setBuscar] = useState(false);
  const [compacta, setCompacta] = useState(() => localStorage.getItem(CLAVE_LATERAL) === "iconos");

  // Sincronización entre dispositivos: el servidor avisa qué recurso cambió
  // (y, si trae aviso, se muestra como notificación local).
  useTema<{ recurso: string; aviso?: { titulo: string; cuerpo: string } }>(me ? temas.usuario(me.usuario.id) : null, ({ recurso, aviso }) => {
    void queryClient.invalidateQueries({ queryKey: [recurso] });
    if (aviso) void mostrarNotificacion(aviso.titulo, aviso.cuerpo);
  });

  useEffect(() => {
    void prepararNotificaciones();
  }, []);
  useTema("apariencia", () => void queryClient.invalidateQueries({ queryKey: ["apariencia"] }));

  useEffect(() => {
    const pc = escritorio();
    if (!pc) return;
    return pc.alNavegar((ruta) => navegar(ruta));
  }, [navegar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscar(true);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const actual = moduloPorRuta(ubicacion.pathname);
  useEffect(() => {
    if (!actual) return;
    const lista = (JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? "[]") as ModuleId[]).filter((id) => id !== actual.id);
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify([actual.id, ...lista].slice(0, 5)));
  }, [actual]);

  // Si el servidor no reconoce este dispositivo (lo borraron), se registra de nuevo.
  useEffect(
    () =>
      tiempoReal.on("auth.ok", (msg) => {
        if (msg.dispositivo === false) olvidarDispositivo();
      }),
    [],
  );

  const alternarLateral = () => {
    setCompacta((v) => {
      localStorage.setItem(CLAVE_LATERAL, v ? "nombres" : "iconos");
      return !v;
    });
  };

  const fondo = apariencia?.fondo
    ? {
        backgroundImage: `linear-gradient(color-mix(in srgb, var(--fondo) 90%, transparent), color-mix(in srgb, var(--fondo) 95%, transparent)), url(${apariencia.fondo})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  return (
    <div className="flex h-full flex-col" style={fondo}>
      <BarraSuperior alBuscar={() => setBuscar(true)} avatar={apariencia?.avatar ?? null} />

      <header className="safe-top flex h-14 shrink-0 items-center gap-2 border-b border-borde bg-superficie px-2 md:hidden">
        <button type="button" onClick={() => setPanel(true)} className="rounded-lg p-2" aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-titulo text-base font-semibold">
          {actual ? MODULES[actual.id].label : <Logo tamano="sm" />}
        </h1>
        <Punto conectado={conexion === "conectado"} />
        <button type="button" onClick={() => setBuscar(true)} className="rounded-lg p-2" aria-label="Buscar">
          <Search className="h-5 w-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <BarraLateral grupos={grupos} compacta={compacta} alternar={alternarLateral} />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-7xl p-4 pb-28 md:p-6">
            {actual ? <BotonAyuda modulo={actual.id} /> : null}
            <ErrorPantalla key={ubicacion.pathname}>
              <Suspense fallback={<Cargando />}>
                <Outlet />
              </Suspense>
            </ErrorPantalla>
          </div>
        </main>
      </div>

      <PanelMovil abierto={panel} alCerrar={() => setPanel(false)} grupos={grupos} visibles={visibles} />
      <BotonMas visibles={visibles} />
      <Buscador abierto={buscar} alCerrar={() => setBuscar(false)} visibles={visibles} />
      {visibles.has("ia") ? <AsistenteFlotante modulo={actual?.id ?? null} /> : null}
    </div>
  );
}

export function GuardiaModulo({ modulo, children }: { modulo: ModuleId; children: ReactNode }) {
  const visibles = useVisibles();
  const { data } = useMe();
  if (!data) return <Cargando />;
  if (!visibles.has(modulo)) {
    return <p className="py-10 text-center text-sm text-tenue">No tienes permiso para ver este apartado.</p>;
  }
  return <>{children}</>;
}
