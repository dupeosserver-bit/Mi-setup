import { AppWindow, Ban, BellOff, CameraOff, EyeOff, Ghost, Globe, Info, MapPinOff, MonitorSmartphone, Plus, Search, X, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Boton, Campo, Entrada, Modal, cx } from "../components/ui";
import { escritorio, esMovil } from "../lib/plataforma";

interface Acceso {
  nombre: string;
  url: string;
}

const CLAVE = "mi-setup.navegador.rapidos";
const POR_DEFECTO: Acceso[] = [{ nombre: "Buscar", url: "https://duckduckgo.com" }];
const COLORES = ["#de5833", "#3a7bd5", "#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6"];

const PROTEGE: { icono: LucideIcon; titulo: string; detalle: string; aviso?: boolean }[] = [
  { icono: AppWindow, titulo: "Sesión aislada", detalle: "No comparte cookies con la app ni con otras ventanas." },
  { icono: Ban, titulo: "Bloquea rastreadores", detalle: "Y anuncios conocidos." },
  { icono: CameraOff, titulo: "Sin cámara ni micrófono", detalle: "Ninguna página los puede pedir." },
  { icono: MapPinOff, titulo: "Sin ubicación", detalle: "No sabe dónde estás." },
  { icono: BellOff, titulo: "Sin notificaciones", detalle: "Nada de avisos de páginas." },
  { icono: Info, titulo: "No oculta tu IP", detalle: "Para eso necesitas una VPN.", aviso: true },
];

function normalizar(texto: string): string | undefined {
  const t = texto.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t)) return `https://${t}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
}

function leerAccesos(): Acceso[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Acceso[] | null;
    return Array.isArray(v) ? v.filter((a) => a && typeof a.nombre === "string" && typeof a.url === "string").slice(0, 12) : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

function guardarAccesos(lista: Acceso[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    return;
  }
}

const dominio = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const colorDe = (texto: string) => COLORES[[...texto].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length]!;

export default function NavegadorPrivado() {
  const pc = escritorio();
  const [texto, setTexto] = useState("");
  const [accesos, setAccesos] = useState<Acceso[]>(leerAccesos);
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState<Acceso>({ nombre: "", url: "" });

  const abrir = (url?: string) => pc?.abrirNavegadorPrivado(url);
  const cambiar = (lista: Acceso[]) => {
    setAccesos(lista);
    guardarAccesos(lista);
  };
  const agregar = (e: FormEvent) => {
    e.preventDefault();
    const url = normalizar(nuevo.url);
    if (!url || !nuevo.nombre.trim()) return;
    cambiar([...accesos, { nombre: nuevo.nombre.trim(), url }].slice(0, 12));
    setNuevo({ nombre: "", url: "" });
    setAgregando(false);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-2">
      <section className="flex flex-col items-center gap-3 pt-4 text-center sm:pt-8">
        <span className="grid h-20 w-20 place-items-center rounded-[26px] text-acento" style={{ background: "color-mix(in srgb, var(--acento) 16%, transparent)" }}>
          <Ghost className="h-10 w-10" />
        </span>
        <h1 className="text-2xl font-semibold sm:text-3xl">Navegador privado</h1>
        <p className="max-w-xl text-sm text-tenue">Todo se borra al cerrar la ventana: historial, cookies, caché y sesiones.</p>
        {pc ? (
          <form
            className="mt-2 flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-borde bg-superficie p-2 focus-within:border-acento"
            onSubmit={(e) => {
              e.preventDefault();
              abrir(normalizar(texto));
              setTexto("");
            }}
          >
            <EyeOff className="ml-2 h-5 w-5 shrink-0 text-tenue" />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Dirección o búsqueda (DuckDuckGo)"
              aria-label="Dirección o búsqueda"
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-texto placeholder:text-tenue focus:outline-none"
            />
            <Boton type="submit" variante="primario" icono={Globe}>
              Abrir
            </Boton>
          </form>
        ) : (
          <div className="mt-2 flex w-full max-w-2xl items-start gap-3 rounded-2xl border border-borde bg-superficie p-4 text-left">
            <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-acento" />
            <div>
              <b className="text-sm">Solo en la app de PC</b>
              <p className="text-sm text-tenue">
                {esMovil()
                  ? "En el celular usa la pestaña de incógnito de tu navegador; la app de Android no incluye un navegador propio."
                  : "Abre Mi Setup en la app de Windows para usar el navegador privado (también desde el menú Ver o la bandeja)."}
              </p>
            </div>
          </div>
        )}
      </section>

      {pc ? (
        <section className="space-y-3">
          <header className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold">Accesos rápidos</h2>
            <small className="text-xs text-tenue">Los eliges tú; no es historial.</small>
          </header>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {accesos.map((a, i) => (
              <div key={`${a.url}-${i}`} className="group relative">
                <button
                  type="button"
                  onClick={() => abrir(a.url)}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border border-borde bg-superficie p-4 text-center hover:bg-tarjeta"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ background: colorDe(a.nombre) }}>
                    {a.url.includes("duckduckgo") ? <Search className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
                  </span>
                  <b className="w-full truncate text-sm">{a.nombre}</b>
                  <small className="w-full truncate text-xs text-tenue">{dominio(a.url)}</small>
                </button>
                <button
                  type="button"
                  aria-label={`Quitar ${a.nombre}`}
                  onClick={() => cambiar(accesos.filter((_, j) => j !== i))}
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg text-tenue opacity-100 hover:bg-tarjeta hover:text-texto sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {accesos.length < 12 ? (
              <button
                type="button"
                onClick={() => setAgregando(true)}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-borde p-4 text-sm text-tenue hover:bg-tarjeta hover:text-texto"
              >
                <Plus className="h-5 w-5" />
                Agregar
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Qué protege</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROTEGE.map(({ icono: Icono, titulo, detalle, aviso }) => (
            <div key={titulo} className="flex items-start gap-3 rounded-2xl border border-borde bg-superficie p-4">
              <span
                className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", aviso ? "text-aviso" : "text-ok")}
                style={{ background: `color-mix(in srgb, var(${aviso ? "--aviso" : "--ok"}) 14%, transparent)` }}
              >
                <Icono className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <b className="block text-sm">{titulo}</b>
                <small className="text-xs text-tenue">{detalle}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Modal abierto={agregando} titulo="Agregar acceso rápido" alCerrar={() => setAgregando(false)}>
        <form className="space-y-3" onSubmit={agregar}>
          <Campo etiqueta="Nombre">
            <Entrada value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} maxLength={30} required autoFocus />
          </Campo>
          <Campo etiqueta="Dirección">
            <Entrada value={nuevo.url} onChange={(e) => setNuevo({ ...nuevo, url: e.target.value })} placeholder="ejemplo.com" required />
          </Campo>
          <Boton type="submit" variante="primario" className="w-full" icono={Plus}>
            Agregar
          </Boton>
        </form>
      </Modal>
    </div>
  );
}
