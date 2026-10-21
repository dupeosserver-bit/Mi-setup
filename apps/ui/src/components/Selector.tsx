/**
 * Selector propio (en lugar del menú del sistema): mismo estilo que el resto de
 * la interfaz en PC y celular. Se usa igual que un <select> con <option> y
 * <optgroup>; `onChange` recibe un evento con `target.value`.
 * En pantallas chicas la lista sale desde abajo, con opciones grandes.
 */
import { Check, ChevronDown, Search } from "lucide-react";
import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export interface OpcionSelector {
  valor: string;
  texto: string;
  grupo?: string;
  deshabilitada?: boolean;
}

/** Texto plano de lo que va dentro de un <option> (puede venir en pedazos). */
export function textoDe(nodo: ReactNode): string {
  if (nodo === null || nodo === undefined || typeof nodo === "boolean") return "";
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join("");
  if (isValidElement<{ children?: ReactNode }>(nodo)) return textoDe(nodo.props.children);
  return "";
}

/** Lee las <option> y <optgroup> que se pasan como hijos. */
export function leerOpciones(hijos: ReactNode, grupo?: string): OpcionSelector[] {
  const lista: OpcionSelector[] = [];
  Children.forEach(hijos, (h) => {
    if (!isValidElement(h)) {
      if (Array.isArray(h)) lista.push(...leerOpciones(h, grupo));
      return;
    }
    const el = h as ReactElement<{ value?: unknown; children?: ReactNode; disabled?: boolean; label?: string }>;
    if (el.type === "option") {
      const texto = textoDe(el.props.children);
      lista.push({ valor: el.props.value === undefined ? texto : String(el.props.value), texto, grupo, deshabilitada: Boolean(el.props.disabled) });
    } else if (el.type === "optgroup") {
      lista.push(...leerOpciones(el.props.children, el.props.label));
    } else if (el.props.children) {
      lista.push(...leerOpciones(el.props.children, grupo));
    }
  });
  return lista;
}

const CAMPO =
  "w-full min-w-0 rounded-xl border border-borde bg-superficie px-3 text-sm text-texto placeholder:text-tenue focus:border-acento focus:outline-none disabled:opacity-60";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
};

export const Selector = forwardRef<HTMLButtonElement, Props>(function Selector(
  { className, children, value, defaultValue, onChange, disabled, name, id, title, required, onClick, ...resto },
  ref,
) {
  const opciones = useMemo(() => leerOpciones(children), [children]);
  const [propio, setPropio] = useState(() => String(defaultValue ?? opciones[0]?.valor ?? ""));
  const actual = value !== undefined && value !== null ? String(value) : propio;
  const elegida = opciones.find((o) => o.valor === actual);
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [marcada, setMarcada] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; arriba: boolean; alto: number } | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const lista = useRef<HTMLDivElement | null>(null);
  const idLista = useId();
  const chico = typeof window !== "undefined" && window.innerWidth < 640;

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return f ? opciones.filter((o) => o.texto.toLowerCase().includes(f) || o.grupo?.toLowerCase().includes(f)) : opciones;
  }, [opciones, filtro]);

  const colocar = useCallback(() => {
    const b = boton.current?.getBoundingClientRect();
    if (!b) return;
    const abajo = window.innerHeight - b.bottom - 8;
    const arribaEspacio = b.top - 8;
    const arriba = abajo < 220 && arribaEspacio > abajo;
    setPos({ top: arriba ? b.top - 4 : b.bottom + 4, left: Math.min(b.left, window.innerWidth - Math.max(b.width, 180) - 8), width: Math.max(b.width, 180), arriba, alto: Math.min(320, arriba ? arribaEspacio : abajo) });
  }, []);

  const abrir = () => {
    if (disabled) return;
    colocar();
    setFiltro("");
    setMarcada(Math.max(0, opciones.findIndex((o) => o.valor === actual)));
    setAbierto(true);
  };

  const elegir = (o: OpcionSelector) => {
    if (o.deshabilitada) return;
    setAbierto(false);
    boton.current?.focus();
    if (o.valor === actual) return;
    if (value === undefined) setPropio(o.valor);
    const objetivo = { value: o.valor, name: name ?? "", id: id ?? "" };
    onChange?.({ target: objetivo, currentTarget: objetivo, preventDefault() {}, stopPropagation() {} } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  useEffect(() => {
    if (!abierto) return;
    const cerrarFuera = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!lista.current?.contains(t) && !boton.current?.contains(t)) setAbierto(false);
    };
    const mover = (e: Event) => {
      if (lista.current?.contains(e.target as Node)) return;
      colocar();
    };
    document.addEventListener("mousedown", cerrarFuera);
    document.addEventListener("touchstart", cerrarFuera);
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", mover, true);
    return () => {
      document.removeEventListener("mousedown", cerrarFuera);
      document.removeEventListener("touchstart", cerrarFuera);
      window.removeEventListener("resize", colocar);
      window.removeEventListener("scroll", mover, true);
    };
  }, [abierto, colocar]);

  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLElement>(`[data-indice="${marcada}"]`)?.scrollIntoView({ block: "nearest" });
  }, [abierto, marcada]);

  const teclas = (e: KeyboardEvent) => {
    if (!abierto) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setAbierto(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarcada((m) => Math.min(visibles.length - 1, m + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarcada((m) => Math.max(0, m - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = visibles[marcada];
      if (o) elegir(o);
    } else if (e.key === "Tab") {
      setAbierto(false);
    }
  };

  const conBuscador = opciones.length > 10;
  let grupoAnterior: string | undefined;

  const panel = abierto && pos
    ? createPortal(
        <>
          {chico ? <div className="fixed inset-0 z-[90] bg-black/50" aria-hidden onClick={() => setAbierto(false)} /> : null}
          <div
            ref={lista}
            role="listbox"
            id={idLista}
            onKeyDown={teclas}
            className={cx(
              "z-[100] flex flex-col overflow-hidden border border-borde bg-superficie text-sm text-texto shadow-2xl",
              chico ? "fixed inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]" : "fixed rounded-xl",
            )}
            style={
              chico
                ? undefined
                : { left: pos.left, width: pos.width, maxHeight: Math.max(160, pos.alto), ...(pos.arriba ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }
            }
          >
            {chico ? <div className="mx-auto my-2 h-1 w-10 shrink-0 rounded-full bg-borde" /> : null}
            {conBuscador ? (
              <label className="flex shrink-0 items-center gap-2 border-b border-borde px-3 py-2">
                <Search className="h-4 w-4 text-tenue" />
                <input
                  autoFocus={!chico}
                  value={filtro}
                  onChange={(e) => {
                    setFiltro(e.target.value);
                    setMarcada(0);
                  }}
                  onKeyDown={teclas}
                  placeholder="Buscar…"
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tenue"
                />
              </label>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {visibles.length === 0 ? <p className="px-3 py-2 text-tenue">Sin resultados</p> : null}
              {visibles.map((o, i) => {
                const titulo = o.grupo && o.grupo !== grupoAnterior ? o.grupo : null;
                grupoAnterior = o.grupo;
                const activa = o.valor === actual;
                return (
                  <div key={`${o.grupo ?? ""}|${o.valor}|${i}`}>
                    {titulo ? <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-tenue">{titulo}</p> : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={activa}
                      data-indice={i}
                      disabled={o.deshabilitada}
                      onMouseEnter={() => setMarcada(i)}
                      onClick={() => elegir(o)}
                      className={cx(
                        "flex w-full items-center gap-2 rounded-lg px-3 text-left disabled:opacity-40",
                        chico ? "min-h-11 py-2" : "min-h-9 py-1.5",
                        i === marcada ? "bg-tarjeta" : "",
                        activa && "text-acento",
                      )}
                    >
                      <span className="min-w-0 flex-1 break-words">{o.texto || " "}</span>
                      {activa ? <Check className="h-4 w-4 shrink-0" /> : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        {...(resto as Record<string, unknown>)}
        ref={(el) => {
          boton.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-required={required || undefined}
        data-valor={actual}
        onClick={(e) => {
          onClick?.(e as never);
          if (abierto) setAbierto(false);
          else abrir();
        }}
        onKeyDown={teclas}
        className={cx(CAMPO, "flex h-10 items-center gap-2 text-left", abierto && "border-acento", className)}
      >
        <span className={cx("min-w-0 flex-1 truncate", !elegida?.texto && "text-tenue")}>{elegida?.texto || "Elegir…"}</span>
        <ChevronDown className={cx("h-4 w-4 shrink-0 text-tenue transition-transform", abierto && "rotate-180")} />
      </button>
      {name ? <input type="hidden" name={name} value={actual} /> : null}
      {panel}
    </>
  );
});
