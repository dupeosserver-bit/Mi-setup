import { Search, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../ui";

export interface OpcionPaleta {
  id: string;
  grupo: string;
  titulo: string;
  detalle?: string;
  icono: LucideIcon;
  hacer: () => void;
  alTab?: () => void;
}

const quitarAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Paleta({ abierta, alCerrar, opciones }: { abierta: boolean; alCerrar: () => void; opciones: OpcionPaleta[] }) {
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierta) return;
    setTexto("");
    setSel(0);
    requestAnimationFrame(() => entrada.current?.focus());
  }, [abierta]);

  const filtradas = useMemo(() => {
    const q = quitarAcentos(texto.trim().replace(/^\//, ""));
    const lista = q ? opciones.filter((o) => quitarAcentos(`${o.titulo} ${o.detalle ?? ""} ${o.grupo}`).includes(q)) : opciones;
    return lista.slice(0, 40);
  }, [opciones, texto]);

  useEffect(() => setSel(0), [texto]);

  if (!abierta) return null;

  const elegir = (o: OpcionPaleta | undefined) => {
    if (!o) return;
    alCerrar();
    o.hacer();
  };

  let grupoAnterior = "";
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/55" onMouseDown={alCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comandos, hosts y acciones"
        className="absolute left-1/2 top-[8vh] w-[min(620px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-borde bg-superficie shadow-[0_30px_80px_rgba(0,0,0,.6)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-borde px-4 py-3.5">
          <Search className="h-4 w-4 text-acento" />
          <input
            ref={entrada}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Busca un comando, un host o una acción…"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-tenue"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(filtradas.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                elegir(filtradas[sel]);
              } else if (e.key === "Tab" && filtradas[sel]?.alTab) {
                e.preventDefault();
                const o = filtradas[sel]!;
                alCerrar();
                o.alTab?.();
              } else if (e.key === "Escape") alCerrar();
            }}
          />
          <kbd className="rounded-md border border-borde px-1.5 font-mono text-[11px] text-tenue">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtradas.length === 0 ? <p className="px-4 py-6 text-center text-sm text-tenue">No hay nada con ese nombre.</p> : null}
          {filtradas.map((o, i) => {
            const encabezado = o.grupo !== grupoAnterior;
            grupoAnterior = o.grupo;
            const Icono = o.icono;
            return (
              <div key={o.id}>
                {encabezado ? <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-tenue">{o.grupo}</p> : null}
                <button
                  type="button"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => elegir(o)}
                  className={cx("flex w-full items-center gap-3 px-4 py-2 text-left", i === sel && "bg-[color-mix(in_srgb,var(--acento)_15%,transparent)]")}
                >
                  <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-tarjeta text-acento">
                    <Icono className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate text-sm font-semibold">{o.titulo}</b>
                    {o.detalle ? <small className="block truncate font-mono text-[11px] text-tenue">{o.detalle}</small> : null}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="hidden gap-3.5 border-t border-borde px-4 py-2.5 text-[11px] text-tenue sm:flex">
          <span>↑↓ moverse</span>
          <span>Enter usar</span>
          <span>Tab poner en la caja</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
