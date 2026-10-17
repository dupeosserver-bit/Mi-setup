/**
 * Estructura de la app.
 * - PC: barra superior estilo LP (Archivo · categorías · Ver · Ventana · Ayuda)
 *   con menús desplegables y barra lateral compacta.
 * - Celular: botón de tres rayas → panel lateral con íconos y texto, lupa,
 *   equipos con indicador conectado/desconectado y botón "+" flotante.
 */
import { MODULES, temas, type ModuleId } from "@mi-setup/shared";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  LogOut,
  Menu,
  MessagesSquare,
  NotebookPen,
  PanelLeftClose,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { queryClient, useApariencia, useMe } from "../lib/consultas";
import { olvidarDispositivo } from "../lib/dispositivo";
import { escritorio } from "../lib/plataforma";
import { useSesion } from "../lib/sesion";
import { tiempoReal, useEstadoConexion, useTema } from "../lib/tiempo-real";
import { CATEGORIAS, MODULOS_UI, moduloPorRuta } from "../modulos";
import { AsistenteFlotante } from "./Asistente";
import { Buscador } from "./Buscador";
import { Logo } from "./Logo";
import { Cargando, Punto, cx } from "./ui";

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

// ---------------------------------------------------------------- menú desplegable

function Menu_({ titulo, children }: { titulo: ReactNode; children: (cerrar: () => void) => ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={cx("flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-[13px]", abierto ? "bg-tarjeta text-texto" : "text-tenue hover:text-texto")}
      >
        {titulo}
      </button>
      {abierto ? (
        <div className="absolute left-0 top-8 z-40 min-w-56 rounded-xl border border-borde bg-superficie p-1 shadow-2xl">
          {children(() => setAbierto(false))}
        </div>
      ) : null}
    </div>
  );
}

function ItemMenu({ onClick, children, atajo }: { onClick: () => void; children: ReactNode; atajo?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] hover:bg-tarjeta">
      <span className="flex flex-1 items-center gap-2">{children}</span>
      {atajo ? <span className="text-xs text-tenue">{atajo}</span> : null}
    </button>
  );
}

const Separador = () => <div className="my-1 h-px bg-borde" />;

// ---------------------------------------------------------------- PC

function BarraSuperior({
  grupos,
  alBuscar,
  alternarLateral,
  avatar,
}: {
  grupos: ReturnType<typeof agruparVisibles>;
  alBuscar: () => void;
  alternarLateral: () => void;
  avatar: string | null;
}) {
  const navegar = useNavigate();
  const { data: me } = useMe();
  const conexion = useEstadoConexion();
  const pc = escritorio();
  const ir = (cerrar: () => void, ruta: string) => {
    cerrar();
    navegar(ruta);
  };

  return (
    <div className="hidden h-11 shrink-0 items-center gap-1 border-b border-borde bg-superficie px-3 md:flex">
      <Link to="/" className="mr-2 flex items-center">
        <Logo tamano="sm" />
      </Link>
      <Menu_ titulo="Archivo">
        {(c) => (
          <>
            <ItemMenu onClick={() => ir(c, "/notas?nueva=1")}>Nueva nota</ItemMenu>
            <ItemMenu onClick={() => ir(c, "/recordatorios?nuevo=1")}>Nuevo recordatorio</ItemMenu>
            <Separador />
            <ItemMenu onClick={() => ir(c, "/ajustes")}>Ajustes</ItemMenu>
            <ItemMenu
              onClick={() => {
                c();
                void cerrarSesion().then(() => navegar("/login"));
              }}
            >
              Cerrar sesión
            </ItemMenu>
          </>
        )}
      </Menu_>
      {grupos
        .filter((g) => g.id !== "ajustes")
        .map((g) => (
          <div key={g.id} className="hidden xl:block">
            <Menu_ titulo={g.titulo}>
              {(c) =>
                g.modulos.map((mod) => (
                  <ItemMenu key={mod.id} onClick={() => ir(c, mod.ruta)}>
                    <mod.icono className="h-4 w-4 text-tenue" />
                    {MODULES[mod.id].label}
                  </ItemMenu>
                ))
              }
            </Menu_>
          </div>
        ))}
      <div className="xl:hidden">
        <Menu_ titulo="Apartados">
          {(c) => (
            <div className="max-h-[70vh] overflow-y-auto">
              {grupos.map((g) => (
                <div key={g.id}>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-tenue">{g.titulo}</div>
                  {g.modulos.map((mod) => (
                    <ItemMenu key={mod.id} onClick={() => ir(c, mod.ruta)}>
                      <mod.icono className="h-4 w-4 text-tenue" />
                      {MODULES[mod.id].label}
                    </ItemMenu>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Menu_>
      </div>
      <Menu_ titulo="Ver">
        {(c) => (
          <>
            <ItemMenu atajo="Ctrl+K" onClick={() => (c(), alBuscar())}>Buscar apartado</ItemMenu>
            <ItemMenu onClick={() => (c(), alternarLateral())}>Mostrar u ocultar barra lateral</ItemMenu>
            <Separador />
            <ItemMenu atajo="F5" onClick={() => (c(), pc ? pc.ventana("recargar") : window.location.reload())}>Recargar</ItemMenu>
            <ItemMenu
              atajo="F11"
              onClick={() => {
                c();
                if (pc) pc.ventana("pantallaCompleta");
                else if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen();
              }}
            >
              Pantalla completa
            </ItemMenu>
          </>
        )}
      </Menu_>
      <Menu_ titulo="Ventana">
        {(c) =>
          pc ? (
            <>
              <ItemMenu onClick={() => (c(), pc.ventana("minimizar"))}>Minimizar</ItemMenu>
              <ItemMenu onClick={() => (c(), pc.ventana("maximizar"))}>Maximizar o restaurar</ItemMenu>
              <ItemMenu onClick={() => (c(), pc.ventana("cerrar"))}>Cerrar ventana (sigue en la bandeja)</ItemMenu>
            </>
          ) : (
            <ItemMenu onClick={() => (c(), window.open(window.location.href, "_blank", "noopener"))}>Abrir en una ventana nueva</ItemMenu>
          )
        }
      </Menu_>
      <Menu_ titulo="Ayuda">
        {(c) => (
          <>
            <ItemMenu onClick={() => (c(), alBuscar())}>Atajos: Ctrl+K busca apartados</ItemMenu>
            <Separador />
            <div className="px-3 py-1.5 text-xs text-tenue">Mi Setup {pc ? `· PC ${pc.version}` : ""}</div>
          </>
        )}
      </Menu_>

      <div className="ml-auto flex items-center gap-3">
        <button type="button" onClick={alBuscar} className="flex h-7 items-center gap-2 rounded-lg border border-borde px-2.5 text-xs text-tenue hover:text-texto">
          <Search className="h-3.5 w-3.5" /> Buscar <span className="text-[10px]">Ctrl+K</span>
        </button>
        <Punto conectado={conexion === "conectado"} texto />
        <Link to="/ajustes" className="flex items-center gap-2 text-xs text-tenue hover:text-texto">
          {avatar ? <img src={avatar} alt="" className="h-6 w-6 rounded-full object-cover" /> : null}
          {me?.usuario.displayName}
        </Link>
      </div>
    </div>
  );
}

function BarraLateral({ grupos }: { grupos: ReturnType<typeof agruparVisibles> }) {
  return (
    <nav className="hidden w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-borde bg-superficie py-3 md:flex">
      {grupos.map((g, i) => (
        <div key={g.id} className="flex flex-col items-center gap-1">
          {i > 0 ? <div className="my-1 h-px w-6 bg-borde" /> : null}
          {g.modulos.map((mod) => (
            <NavLink
              key={mod.id}
              to={mod.ruta}
              title={MODULES[mod.id].label}
              className={({ isActive }) =>
                cx("flex h-9 w-9 items-center justify-center rounded-xl transition-colors", isActive ? "bg-acento text-black" : "text-tenue hover:bg-tarjeta hover:text-texto")
              }
            >
              <mod.icono className="h-[18px] w-[18px]" />
            </NavLink>
          ))}
        </div>
      ))}
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

// ---------------------------------------------------------------- estructura

export function Layout() {
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const { data: me } = useMe();
  const { data: apariencia } = useApariencia();
  const conexion = useEstadoConexion();
  const visibles = useVisibles();
  const grupos = useMemo(() => agruparVisibles(visibles), [visibles]);
  const [panel, setPanel] = useState(false);
  const [buscar, setBuscar] = useState(false);
  const [lateral, setLateral] = useState(() => localStorage.getItem(CLAVE_LATERAL) !== "no");

  // Sincronización entre dispositivos: el servidor avisa qué recurso cambió.
  useTema<{ recurso: string }>(me ? temas.usuario(me.usuario.id) : null, ({ recurso }) => {
    void queryClient.invalidateQueries({ queryKey: [recurso] });
  });
  useTema("apariencia", () => void queryClient.invalidateQueries({ queryKey: ["apariencia"] }));

  useEffect(() => escritorio()?.alNavegar((ruta) => navegar(ruta)), [navegar]);

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
    setLateral((v) => {
      localStorage.setItem(CLAVE_LATERAL, v ? "no" : "si");
      return !v;
    });
  };

  const fondo = apariencia?.fondo
    ? { backgroundImage: `linear-gradient(rgba(18,18,18,.9), rgba(18,18,18,.95)), url(${apariencia.fondo})`, backgroundSize: "cover", backgroundPosition: "center" }
    : undefined;

  return (
    <div className="flex h-full flex-col" style={fondo}>
      <BarraSuperior grupos={grupos} alBuscar={() => setBuscar(true)} alternarLateral={alternarLateral} avatar={apariencia?.avatar ?? null} />

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
        {lateral ? <BarraLateral grupos={grupos} /> : null}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 pb-28 md:p-6">
            <Suspense fallback={<Cargando />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {!lateral ? (
        <button
          type="button"
          onClick={alternarLateral}
          title="Mostrar barra lateral"
          className="fixed bottom-4 left-4 z-20 hidden rounded-xl border border-borde bg-superficie p-2 text-tenue md:block"
        >
          <PanelLeftClose className="h-4 w-4 rotate-180" />
        </button>
      ) : null}
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
