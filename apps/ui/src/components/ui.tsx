/** Componentes base de la interfaz (tema oscuro gris, tarjetas de 16 px). */
import { AlertTriangle, CheckCircle2, Info, Loader2, Settings2, X, XCircle, type LucideIcon } from "lucide-react";
import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { ApiError, mensajeDeError } from "../lib/api";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variante = "primario" | "secundario" | "fantasma" | "peligro";
const VARIANTES: Record<Variante, string> = {
  primario: "bg-acento text-black hover:bg-white",
  secundario: "bg-tarjeta text-texto border border-borde hover:bg-[#3a3a3c]",
  fantasma: "text-tenue hover:text-texto hover:bg-tarjeta",
  peligro: "bg-peligro/15 text-peligro border border-peligro/40 hover:bg-peligro/25",
};

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: "sm" | "md" | "icono";
  icono?: LucideIcon;
  cargando?: boolean;
}

export const Boton = forwardRef<HTMLButtonElement, BotonProps>(function Boton(
  { variante = "secundario", tamano = "md", icono: Icono, cargando, className, children, disabled, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || cargando}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTES[variante],
        tamano === "sm" && "h-8 px-3 text-xs",
        tamano === "md" && "h-10 px-4 text-sm",
        tamano === "icono" && "h-9 w-9",
        className,
      )}
      {...props}
    >
      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : Icono ? <Icono className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});

const CAMPO =
  "w-full min-w-0 rounded-xl border border-borde bg-superficie px-3 text-sm text-texto placeholder:text-tenue focus:border-acento focus:outline-none disabled:opacity-60";

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Entrada(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx(CAMPO, "h-10", className)} {...props} />;
});

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function AreaTexto({ className, ...props }, ref) {
    return <textarea ref={ref} className={cx(CAMPO, "min-h-24 py-2", className)} {...props} />;
  },
);

// Selector propio con el estilo de la interfaz (no el menú feo del sistema).
export { Selector } from "./Selector";

export function Campo({
  etiqueta,
  ayuda,
  children,
  className,
}: {
  etiqueta: string;
  ayuda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-tenue">{etiqueta}</span>
      {children}
      {ayuda ? <span className="block text-xs text-tenue">{ayuda}</span> : null}
    </label>
  );
}

export function Tarjeta({
  titulo,
  acciones,
  children,
  className,
  icono: Icono,
}: {
  titulo?: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
  className?: string;
  icono?: LucideIcon;
}) {
  return (
    <section className={cx("min-w-0 rounded-tarjeta border border-borde bg-superficie p-4", className)}>
      {titulo || acciones ? (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold">
            {Icono ? <Icono className="h-4 w-4 text-tenue" /> : null}
            {titulo}
          </h3>
          {acciones ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{acciones}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type Tono = "ok" | "aviso" | "peligro" | "neutro";
const TONOS: Record<Tono, string> = {
  ok: "bg-ok/15 text-ok",
  aviso: "bg-aviso/15 text-aviso",
  peligro: "bg-peligro/15 text-peligro",
  neutro: "bg-tarjeta text-tenue",
};

export function Insignia({ tono = "neutro", children }: { tono?: Tono; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TONOS[tono])}>{children}</span>;
}

export function Punto({ conectado, texto }: { conectado: boolean; texto?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-tenue" title={conectado ? "Conectado" : "Desconectado"}>
      <span className={cx("h-2 w-2 rounded-full", conectado ? "bg-ok" : "bg-[#636366]")} />
      {texto ? (conectado ? "Conectado" : "Desconectado") : null}
    </span>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-tenue">
      <Loader2 className="h-4 w-4 animate-spin" />
      {texto}
    </div>
  );
}

export function Vacio({ icono: Icono = Info, texto, accion }: { icono?: LucideIcon; texto: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-tenue">
      <Icono className="h-6 w-6" />
      <p>{texto}</p>
      {accion}
    </div>
  );
}

export function FaltaConfigurar({ variable, detalle }: { variable: string; detalle?: string }) {
  // La demo no tiene servidor: pedir claves del .env ahí solo confunde.
  if (import.meta.env.VITE_DEMO === "1") return null;
  return (
    <div className="flex min-w-0 max-w-full items-start gap-3 rounded-tarjeta border border-aviso/40 bg-aviso/10 p-4 text-sm">
      <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-aviso" />
      {/* Los nombres largos (GOOGLE_CLIENT_ID…) se parten: el aviso no se sale de su tarjeta. */}
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="font-medium text-aviso">Falta configurar: {variable}</p>
        <p className="mt-1 text-tenue">
          {detalle ?? "Agrega esta variable al archivo .env del servidor y vuelve a desplegar. Consulta docs/USO.md."}
        </p>
      </div>
    </div>
  );
}

export function ErrorCaja({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError && error.codigo === "falta_configuracion") {
    return <FaltaConfigurar variable={String(error.datos?.["variable"] ?? error.message.replace("Falta configurar: ", ""))} />;
  }
  return (
    <div className="flex min-w-0 max-w-full items-start gap-2 rounded-xl border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{mensajeDeError(error)}</span>
    </div>
  );
}

export function Encabezado({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold md:text-2xl">{titulo}</h1>
        {descripcion ? <p className="mt-1 text-sm text-tenue">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </header>
  );
}

export function Pestanas<T extends string>({
  opciones,
  valor,
  alCambiar,
}: {
  opciones: readonly { id: T; texto: string }[];
  valor: T;
  alCambiar: (v: T) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-superficie p-1">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => alCambiar(o.id)}
          className={cx(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
            valor === o.id ? "bg-tarjeta text-texto" : "text-tenue hover:text-texto",
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Interruptor({
  activo,
  alCambiar,
  etiqueta,
}: {
  activo: boolean;
  alCambiar: (v: boolean) => void;
  etiqueta?: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={activo} onClick={() => alCambiar(!activo)} className="inline-flex max-w-full items-start gap-2 text-left text-sm">
      {/* Tamaño fijo: con textos largos el interruptor ya no se aplasta. */}
      <span className={cx("relative mt-px h-5 w-9 shrink-0 rounded-full transition-colors", activo ? "bg-ok" : "bg-borde")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", activo ? "left-[18px]" : "left-0.5")} />
      </span>
      {etiqueta ? <span className="min-w-0 flex-1">{etiqueta}</span> : null}
    </button>
  );
}

export function Modal({
  abierto,
  titulo,
  alCerrar,
  children,
  ancho = "max-w-lg",
}: {
  abierto: boolean;
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, alCerrar]);
  if (!abierto) return null;
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={alCerrar}>
      <div
        className={cx("max-h-[92vh] w-full overflow-y-auto rounded-t-tarjeta border border-borde bg-superficie p-5 sm:rounded-tarjeta safe-bottom", ancho)}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <Boton variante="fantasma" tamano="icono" icono={X} onClick={alCerrar} aria-label="Cerrar" />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- avisos (toasts)

interface Aviso {
  id: number;
  texto: string;
  tono: "ok" | "error" | "info";
}
const useAvisos = create<{ lista: Aviso[] }>(() => ({ lista: [] }));
let siguiente = 1;

export function avisar(texto: string, tono: Aviso["tono"] = "ok"): void {
  const id = siguiente++;
  useAvisos.setState((s) => ({ lista: [...s.lista, { id, texto, tono }] }));
  setTimeout(() => useAvisos.setState((s) => ({ lista: s.lista.filter((a) => a.id !== id) })), 4000);
}

export function avisarError(error: unknown): void {
  avisar(mensajeDeError(error), "error");
}

export function Avisos() {
  const lista = useAvisos((s) => s.lista);
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[95] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 md:bottom-6">
      {lista.map((a) => {
        const Icono = a.tono === "ok" ? CheckCircle2 : a.tono === "error" ? AlertTriangle : Info;
        return (
          <div key={a.id} className="flex items-center gap-2 rounded-xl border border-borde bg-tarjeta px-3 py-2 text-sm shadow-lg">
            <Icono className={cx("h-4 w-4 shrink-0", a.tono === "ok" ? "text-ok" : a.tono === "error" ? "text-peligro" : "text-tenue")} />
            {a.texto}
          </div>
        );
      })}
    </div>
  );
}
