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
import { Bell, ChevronsLeft, ChevronsRight, CircleHelp, LogOut, Menu, MessagesSquare, NotebookPen, PanelLeftOpen, Plus, Search, X, type LucideIcon } from "lucide-react";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { AYUDA } from "../lib/ayuda";
import { queryClient, useApariencia, useMe } from "../lib/consultas";
import { olvidarDispositivo } from "../lib/dispositivo";
import { mostrarNotificacion, prepararNotificaciones } from "../lib/notificaciones";
import { useAcostado, useAltoVisible, useForma, useMarco } from "../lib/marco";
import { escritorio } from "../lib/plataforma";
import { useBotonFlotante, usePreferencias } from "../lib/preferencias";
import { useSesion } from "../lib/sesion";
import { tiempoReal, useEstadoConexion, useTema } from "../lib/tiempo-real";
import { CATEGORIAS, MODULOS_UI, categoriaDe, grupoDe, moduloPorRuta } from "../modulos";
import { AsistenteFlotante } from "./Asistente";
import { Buscador } from "./Buscador";
import { ErrorPantalla } from "./ErrorPantalla";
import { Tutorial } from "./Tutorial";
import { AvisoActualizacion } from "./Actualizaciones";
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

/** Alto más grande visto con este ancho: así el teclado del celular no cambia la forma de la pantalla. */
let altoMaximo = { ancho: 0, alto: 0 };

/**
 * Ancho ÷ alto de la pantalla. Al abrir el teclado solo baja el alto; si se
 * usara ese alto, el fondo pasaba a «imagen completa» y salía dos veces.
 */
export function formaPantalla(ancho = window.innerWidth, alto = window.innerHeight): number {
  if (ancho !== altoMaximo.ancho) altoMaximo = { ancho, alto };
  else altoMaximo.alto = Math.max(altoMaximo.alto, alto);
  return ancho / Math.max(1, altoMaximo.alto);
}

/**
 * Fondo de pantalla que se adapta: en PC usa el «fondo para PC» si hay. Si la
 * imagen no tiene la forma de la pantalla (ej. una foto vertical en una
 * pantalla ancha) se muestra completa y el resto se rellena con la misma
 * imagen oscurecida, en lugar de recortarla.
 */
function useFondo(fondo: string | null, fondoPc: string | null, ajuste: "auto" | "llenar" | "completo") {
  const [ancho, setAncho] = useState(() => (typeof window === "undefined" ? 1 : formaPantalla()));
  const pc = ancho > 1.2 && typeof window !== "undefined" && window.innerWidth >= 768;
  const url = (pc && fondoPc) || fondo;
  const [forma, setForma] = useState<number | null>(null);
  useEffect(() => {
    const alCambiar = () => setAncho(formaPantalla());
    window.addEventListener("resize", alCambiar);
    return () => window.removeEventListener("resize", alCambiar);
  }, []);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => setForma(img.naturalWidth / Math.max(1, img.naturalHeight));
    img.src = url;
  }, [url]);
  if (!url) return undefined;
  const velo = "linear-gradient(color-mix(in srgb, var(--fondo) calc(var(--velo, 90) * 1%), transparent), color-mix(in srgb, var(--fondo) calc(var(--velo, 90) * 1%), transparent))";
  // En el celular (pantalla táctil) «Automático» siempre llena la pantalla, también al girarlo:
  // si no, una foto vertical se veía chiquita en horizontal.
  const tactil = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const completo = ajuste === "completo" || (ajuste === "auto" && !tactil && forma !== null && Math.abs(Math.log(forma / ancho)) > Math.log(1.4));
  if (!completo) return { backgroundImage: `${velo}, url(${url})`, backgroundSize: "cover", backgroundPosition: "center" };
  // Imagen completa al centro y, detrás, la misma imagen llenando la pantalla pero oscurecida.
  return {
    backgroundImage: `${velo}, url(${url}), linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(${url})`,
    backgroundSize: "cover, contain, cover, cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
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

/** Una entrada del menú: un apartado o un grupo de apartados (con pestañas adentro). */
interface ItemMenu {
  readonly clave: string;
  readonly ruta: string;
  readonly texto: string;
  readonly icono: LucideIcon;
  readonly ids: readonly ModuleId[];
}

function agruparVisibles(visibles: Set<ModuleId>, esDueno: boolean) {
  return CATEGORIAS.map((c) => {
    const modulos = Object.values(MODULOS_UI)
      .filter((mod) => categoriaDe(mod.id, esDueno) === c.id && (mod.enMenu !== false || !visibles.has("novedades")) && visibles.has(mod.id))
      .sort((a, b) => Number(MODULES[a.id].category !== c.id) - Number(MODULES[b.id].category !== c.id));
    const items: ItemMenu[] = [];
    for (const mod of modulos) {
      const grupo = grupoDe(mod.id);
      if (!grupo) {
        items.push({ clave: mod.id, ruta: mod.ruta, texto: MODULES[mod.id].label, icono: mod.icono, ids: [mod.id] });
        continue;
      }
      const ids = grupo.miembros.map((m) => m.id).filter((id) => visibles.has(id));
      // El grupo sale una vez, en el lugar de su primer apartado visible.
      if (ids[0] !== mod.id) continue;
      items.push(ids.length > 1 ? { clave: grupo.id, ruta: mod.ruta, texto: grupo.titulo, icono: grupo.icono, ids } : { clave: mod.id, ruta: mod.ruta, texto: MODULES[mod.id].label, icono: mod.icono, ids });
    }
    return { ...c, modulos, items };
  }).filter((c) => c.modulos.length > 0);
}

/** Enlace del menú; un grupo queda marcado en cualquiera de sus pestañas. */
function EnlaceMenu({ item, className, onClick, children }: { item: ItemMenu; className: (activo: boolean) => string; onClick?: () => void; children: ReactNode }) {
  const { pathname } = useLocation();
  const actual = moduloPorRuta(pathname);
  const activo = Boolean(actual && item.ids.includes(actual.id));
  return (
    <Link to={item.ruta} title={item.texto} onClick={onClick} className={className(activo)}>
      {children}
    </Link>
  );
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

function BarraSuperior({ alBuscar, avatar, alMenu, baja }: { alBuscar: () => void; avatar: string | null; alMenu?: () => void; baja: boolean }) {
  const { data: me } = useMe();
  const conexion = useEstadoConexion();
  return (
    <div className={cx("safe-top flex shrink-0 items-center gap-3 border-b border-borde bg-superficie px-4", baja ? "h-11" : "h-12")}>
      {alMenu ? (
        <button type="button" onClick={alMenu} className="-ml-2 rounded-lg p-2 text-tenue hover:text-texto" aria-label="Abrir menú">
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      ) : null}
      <Link to="/" className="flex items-center">
        <Logo tamano="sm" />
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <button type="button" onClick={alBuscar} className="flex h-8 items-center gap-2 rounded-lg border border-borde px-3 text-xs text-tenue hover:text-texto">
          <Search className="h-3.5 w-3.5" /> Buscar <span className="hidden text-[10px] lg:inline">Ctrl+K</span>
        </button>
        <Punto conectado={conexion === "conectado"} texto />
        <Link to="/ajustes" className="flex items-center gap-2 text-xs text-tenue hover:text-texto">
          {avatar ? <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" /> : null}
          <span className="hidden max-w-[14rem] truncate sm:inline">{me?.usuario.displayName}</span>
        </Link>
      </div>
    </div>
  );
}

function BarraLateral({ grupos, compacta, alternar, riel }: { grupos: ReturnType<typeof agruparVisibles>; compacta: boolean; alternar: () => void; riel: boolean }) {
  return (
    <nav className={cx("flex shrink-0 flex-col border-r border-borde bg-superficie transition-[width] duration-200", compacta ? "w-[68px]" : "w-60")} aria-label="Menú">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {grupos.map((g, i) => (
          <div key={g.id} className={cx(i > 0 && "mt-3")}>
            {compacta ? (
              i > 0 ? <div className="mx-auto mb-2 h-px w-8 bg-borde" /> : null
            ) : (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-tenue">{g.titulo}</div>
            )}
            {g.items.map((item) => (
              <EnlaceMenu
                key={item.clave}
                item={item}
                className={(activo) =>
                  cx(
                    "flex items-center gap-3 rounded-xl text-sm transition-colors",
                    compacta ? "mx-auto h-10 w-10 justify-center" : "px-3 py-2",
                    activo ? "bg-acento text-black" : "text-tenue hover:bg-tarjeta hover:text-texto",
                  )
                }
              >
                <item.icono className="h-[18px] w-[18px] shrink-0" />
                {compacta ? null : <span className="truncate">{item.texto}</span>}
              </EnlaceMenu>
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={alternar}
        className={cx("flex items-center gap-2 border-t border-borde px-4 py-3 text-xs text-tenue hover:text-texto", compacta && "justify-center px-0")}
        title={riel ? "Ver menú completo" : compacta ? "Mostrar nombres" : "Solo íconos"}
      >
        {riel ? <PanelLeftOpen className="h-4 w-4" /> : compacta ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
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
    <div className="fixed inset-0 z-50">
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
            {g.items.map((item) => (
              <EnlaceMenu key={item.clave} item={item} onClick={alCerrar} className={(activo) => cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm", activo ? "bg-tarjeta" : "hover:bg-tarjeta")}>
                <item.icono className="h-4 w-4 text-tenue" />
                {item.texto}
              </EnlaceMenu>
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
  const flotante = useBotonFlotante();
  if (acciones.length === 0 || flotante.oculto) return null;
  return (
    <div className="safe-bottom fixed bottom-5 right-5 z-30 flex flex-col items-end gap-2" style={flotante.estilo} {...flotante.eventos}>
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
        className={cx("flex h-14 w-14 items-center justify-center rounded-full bg-acento text-black shadow-xl", flotante.moviendo && "scale-110 ring-4 ring-acento/40")}
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
      <div className="mb-2 flex shrink-0 justify-end">
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
  const prefs = usePreferencias();
  const conexion = useEstadoConexion();
  const visibles = useVisibles();
  const esDueno = me?.usuario.role === "maestra";
  const grupos = useMemo(() => agruparVisibles(visibles, esDueno), [visibles, esDueno]);
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

  const fondo = useFondo(apariencia?.fondo ?? null, apariencia?.fondoPc ?? null, prefs.vidrio.ajuste);
  const forma = useForma();
  const acostado = useAcostado();
  const modoPedido = useMarco((s) => s.modo);
  useAltoVisible();
  const modo = acostado && modoPedido === "fijo" ? "normal" : modoPedido;
  const completa = modo === "completa";
  const sinScroll = modo !== "normal";
  const lateralVisible = !completa && forma !== "celular";
  const flotantesVisibles = !completa && modo !== "pleno";

  return (
    <div className="flex flex-col overflow-hidden" style={{ ...fondo, height: "var(--alto-app, 100dvh)" }} data-forma={forma} data-modo={modo}>
      {completa ? null : forma === "celular" ? (
        <header className={cx("safe-top flex shrink-0 items-center gap-2 border-b border-borde bg-superficie px-2", acostado ? "h-11" : "h-14")}>
          <button type="button" onClick={() => setPanel(true)} className="rounded-lg p-2" aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-titulo text-base font-semibold">{actual ? MODULES[actual.id].label : <Logo tamano="sm" />}</h1>
          <Punto conectado={conexion === "conectado"} />
          <button type="button" onClick={() => setBuscar(true)} className="rounded-lg p-2" aria-label="Buscar">
            <Search className="h-5 w-5" />
          </button>
        </header>
      ) : (
        <BarraSuperior alBuscar={() => setBuscar(true)} avatar={apariencia?.avatar ?? null} alMenu={forma === "tablet" ? () => setPanel(true) : undefined} baja={acostado} />
      )}

      {completa ? null : <AvisoActualizacion />}

      <div className="flex min-h-0 flex-1">
        {lateralVisible ? (
          <BarraLateral grupos={grupos} compacta={forma === "tablet" || compacta || modo === "pleno"} riel={forma === "tablet"} alternar={forma === "tablet" ? () => setPanel(true) : alternarLateral} />
        ) : null}
        <main className={cx("min-w-0 flex-1 overflow-x-hidden", sinScroll ? "overflow-y-hidden" : "overflow-y-auto")}>
          <div
            className={cx(
              modo === "normal" && "mx-auto max-w-7xl p-4 pb-32 md:p-6 md:pb-32",
              modo === "fijo" && "mx-auto flex h-full max-w-7xl flex-col p-3 md:p-5",
              (modo === "pleno" || completa) && "flex h-full flex-col",
            )}
          >
            {actual && modo !== "pleno" && !completa ? <BotonAyuda modulo={actual.id} /> : null}
            <div className={cx(sinScroll && "flex min-h-0 flex-1 flex-col")}>
              <ErrorPantalla key={ubicacion.pathname}>
                <Suspense fallback={<Cargando />}>
                  <Outlet />
                </Suspense>
              </ErrorPantalla>
            </div>
          </div>
        </main>
      </div>

      <PanelMovil abierto={panel} alCerrar={() => setPanel(false)} grupos={grupos} visibles={visibles} />
      {flotantesVisibles && forma === "celular" && actual?.id !== "ia" ? <BotonMas visibles={visibles} /> : null}
      <Buscador abierto={buscar} alCerrar={() => setBuscar(false)} visibles={visibles} />
      {visibles.has("ia") && actual?.id !== "ia" ? <AsistenteFlotante modulo={actual?.id ?? null} sinBoton={!flotantesVisibles} /> : null}
      <Tutorial grupos={grupos} />
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
  const grupo = grupoDe(modulo);
  const hermanos = grupo?.miembros.filter((m) => visibles.has(m.id)) ?? [];
  return (
    <>
      {hermanos.length > 1 ? (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-superficie p-1" role="tablist" aria-label={grupo?.titulo}>
          {hermanos.map((h) => (
            <NavLink
              key={h.id}
              to={MODULOS_UI[h.id].ruta}
              role="tab"
              aria-selected={h.id === modulo}
              className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors", h.id === modulo ? "bg-acento text-black" : "text-tenue hover:text-texto")}
            >
              {h.texto}
            </NavLink>
          ))}
        </div>
      ) : null}
      {children}
    </>
  );
}
