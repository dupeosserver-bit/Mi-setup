import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Braces, ClipboardPaste, History, Keyboard, LayoutGrid, SlidersHorizontal, TextCursorInput, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FILA_1, FILA_2, filasValidas, GRUPOS_PANEL, secuenciaDe, TECLAS, type Modificadores, type Tecla } from "../../lib/teclasTerminal";
import { useGuardarPreferencias, usePreferencias } from "../../lib/preferencias";
import { useAcostado } from "../../lib/marco";
import { Boton, Modal, cx } from "../ui";

const FLECHA: Record<NonNullable<Tecla["icono"]>, LucideIcon> = { izquierda: ArrowLeft, arriba: ArrowUp, abajo: ArrowDown, derecha: ArrowRight };

export type PanelBarra = "teclas" | "comandos" | "historial" | null;

function BotonTecla({ tecla, activa, alTocar, ancho }: { tecla: Tecla; activa: boolean; alTocar: () => void; ancho?: boolean }) {
  const Icono = tecla.icono ? FLECHA[tecla.icono] : null;
  return (
    <button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={alTocar}
      aria-label={tecla.etiqueta}
      aria-pressed={tecla.tipo === "mod" ? activa : undefined}
      className={cx(
        "grid h-10 shrink-0 snap-start place-items-center rounded-[10px] px-3 font-mono text-[13px] shadow-[0_1px_0_rgba(0,0,0,.5)] transition-colors",
        ancho ? "w-full min-w-0 px-1 text-xs" : "min-w-11",
        activa ? "bg-acento text-black" : "bg-[#262134] text-texto active:bg-[#352d4a]",
        !activa && (tecla.tipo === "mod" || tecla.tipo === "combo") && "text-acento",
        !activa && tecla.tipo === "fn" && "text-[#7cb7ff]",
        tecla.tipo === "sim" && !ancho && "min-w-[38px] text-[15px]",
      )}
    >
      {Icono ? <Icono className="h-[17px] w-[17px]" /> : tecla.etiqueta}
    </button>
  );
}

function Fila({ ids, mods, alTecla }: { ids: string[]; mods: Modificadores; alTecla: (id: string) => void }) {
  const pista = useRef<HTMLDivElement>(null);
  const [avance, setAvance] = useState(0);
  const [alFinal, setAlFinal] = useState(false);
  useEffect(() => {
    const p = pista.current;
    if (!p) return;
    const marcar = () => {
      const max = p.scrollWidth - p.clientWidth;
      setAlFinal(max <= 2 || p.scrollLeft >= max - 2);
      setAvance(max <= 0 ? 0 : Math.round((p.scrollLeft / max) * 2));
    };
    marcar();
    p.addEventListener("scroll", marcar, { passive: true });
    const obs = new ResizeObserver(marcar);
    obs.observe(p);
    return () => {
      p.removeEventListener("scroll", marcar);
      obs.disconnect();
    };
  }, [ids]);
  return (
    <div className="min-w-0">
      <div className="relative">
        <div ref={pista} className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-2 [scroll-padding:0_8px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ids.map((id) => (
            <BotonTecla key={id} tecla={TECLAS[id]!} activa={(id === "ctrl" && mods.ctrl) || (id === "alt" && mods.alt)} alTocar={() => alTecla(id)} />
          ))}
        </div>
        {alFinal ? null : <div className="pointer-events-none absolute inset-y-0 right-0 w-9 bg-gradient-to-r from-transparent to-[#16131f]" />}
      </div>
      <div className="mt-1 flex h-2 items-center justify-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <i key={i} className={cx("block h-[5px] rounded-full transition-all", i === avance ? "w-3.5 bg-acento" : "w-[5px] bg-borde")} />
        ))}
      </div>
    </div>
  );
}

function Personalizar({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const prefs = usePreferencias();
  const guardar = useGuardarPreferencias();
  const [f1, setF1] = useState<string[]>([]);
  const [f2, setF2] = useState<string[]>([]);
  useEffect(() => {
    if (!abierto) return;
    setF1(filasValidas(prefs.terminal.teclas.fila1, FILA_1));
    setF2(filasValidas(prefs.terminal.teclas.fila2, FILA_2));
  }, [abierto, prefs.terminal.teclas.fila1, prefs.terminal.teclas.fila2]);
  const alternar = (fila: 1 | 2, id: string) => {
    const [lista, poner] = fila === 1 ? [f1, setF1] : [f2, setF2];
    poner(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  };
  const mover = (fila: 1 | 2, id: string, paso: number) => {
    const [lista, poner] = fila === 1 ? [f1, setF1] : [f2, setF2];
    const i = lista.indexOf(id);
    const j = i + paso;
    if (i < 0 || j < 0 || j >= lista.length) return;
    const nueva = [...lista];
    [nueva[i], nueva[j]] = [nueva[j]!, nueva[i]!];
    poner(nueva);
  };
  return (
    <Modal abierto={abierto} titulo="Personalizar teclas" alCerrar={alCerrar} ancho="max-w-2xl">
      <p className="mb-3 text-xs text-tenue">Toca una tecla para ponerla o quitarla de cada fila. En las filas, las flechas cambian el orden.</p>
      {([1, 2] as const).map((fila) => {
        const lista = fila === 1 ? f1 : f2;
        return (
          <div key={fila} className="mb-4">
            <p className="mb-2 text-sm font-medium">Fila {fila}</p>
            <div className="flex flex-wrap gap-1.5">
              {lista.map((id) => (
                <span key={id} className="flex items-center gap-0.5 rounded-lg border border-borde bg-fondo pl-2 font-mono text-xs">
                  {TECLAS[id]?.etiqueta}
                  <button type="button" className="px-1 text-tenue" onClick={() => mover(fila, id, -1)} aria-label="Mover antes">‹</button>
                  <button type="button" className="px-1 text-tenue" onClick={() => mover(fila, id, 1)} aria-label="Mover después">›</button>
                  <button type="button" className="px-1.5 text-peligro" onClick={() => alternar(fila, id)} aria-label="Quitar">×</button>
                </span>
              ))}
            </div>
          </div>
        );
      })}
      {GRUPOS_PANEL.map((g) => (
        <div key={g.titulo} className="mb-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-tenue">{g.titulo}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.teclas.map((id) => (
              <span key={id} className="flex items-center overflow-hidden rounded-lg border border-borde font-mono text-xs">
                <span className="px-2">{TECLAS[id]?.etiqueta}</span>
                <button type="button" onClick={() => alternar(1, id)} className={cx("px-2 py-1", f1.includes(id) ? "bg-acento text-black" : "bg-fondo text-tenue")}>1</button>
                <button type="button" onClick={() => alternar(2, id)} className={cx("px-2 py-1", f2.includes(id) ? "bg-acento text-black" : "bg-fondo text-tenue")}>2</button>
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Boton
          variante="fantasma"
          onClick={() => {
            setF1(FILA_1);
            setF2(FILA_2);
          }}
        >
          Volver a las de siempre
        </Boton>
        <Boton
          variante="primario"
          onClick={() => {
            guardar((p) => ({ ...p, terminal: { ...p.terminal, teclas: { fila1: f1, fila2: f2 } } }));
            alCerrar();
          }}
        >
          Guardar
        </Boton>
      </div>
    </Modal>
  );
}

function PanelTeclas({ mods, alTecla, alPersonalizar }: { mods: Modificadores; alTecla: (id: string) => void; alPersonalizar: () => void }) {
  return (
    <div className="max-h-[300px] overflow-y-auto px-2.5 pb-3">
      <div className="sticky top-0 z-[1] flex items-center justify-between bg-[#16131f] py-2">
        <b className="text-sm">Todas las teclas</b>
        <Boton tamano="sm" icono={SlidersHorizontal} onClick={alPersonalizar}>
          Personalizar
        </Boton>
      </div>
      <p className="mb-1.5 mt-2 text-[11px] font-bold uppercase tracking-wider text-tenue">Flechas</p>
      <div className="grid w-[132px] grid-cols-3 gap-1.5">
        {(["arriba", "izquierda", "abajo", "derecha"] as const).map((id) => (
          <div key={id} style={{ gridArea: id === "arriba" ? "1/2" : id === "izquierda" ? "2/1" : id === "abajo" ? "2/2" : "2/3" }}>
            <BotonTecla tecla={TECLAS[id]!} activa={false} alTocar={() => alTecla(id)} ancho />
          </div>
        ))}
      </div>
      {GRUPOS_PANEL.map((g) => (
        <div key={g.titulo}>
          <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-wider text-tenue">{g.titulo}</p>
          <div className={cx("grid gap-1.5", g.teclas.length > 9 ? "grid-cols-6" : "grid-cols-4")}>
            {g.teclas.map((id) => (
              <BotonTecla key={id} tecla={TECLAS[id]!} activa={(id === "ctrl" && mods.ctrl) || (id === "alt" && mods.alt)} alTocar={() => alTecla(id)} ancho />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BarraTeclas({
  enviar,
  mods,
  setMods,
  panel,
  setPanel,
  cajaVisible,
  alCaja,
  alTeclado,
  alPegar,
  contenidoPanel,
}: {
  enviar: ((texto: string) => void) | null;
  mods: Modificadores;
  setMods: (m: Modificadores) => void;
  panel: PanelBarra;
  setPanel: (p: PanelBarra) => void;
  cajaVisible: boolean;
  alCaja: () => void;
  alTeclado: () => void;
  alPegar: () => void;
  contenidoPanel: ReactNode;
}) {
  const prefs = usePreferencias();
  const acostado = useAcostado();
  const [personalizar, setPersonalizar] = useState(false);
  const fila1 = filasValidas(prefs.terminal.teclas.fila1, FILA_1);
  const fila2 = filasValidas(prefs.terminal.teclas.fila2, FILA_2);

  const alTecla = (id: string) => {
    if (id === "ctrl") return setMods({ ...mods, ctrl: !mods.ctrl });
    if (id === "alt") return setMods({ ...mods, alt: !mods.alt });
    const datos = secuenciaDe(id, mods);
    if (datos && enviar) enviar(datos);
    if (mods.ctrl || mods.alt) setMods({ ctrl: false, alt: false });
  };

  const botones: [PanelBarra | "pegar" | "caja" | "teclado", LucideIcon, string][] = [
    ["teclas", LayoutGrid, "Todas las teclas"],
    ["comandos", Braces, "Comandos guardados"],
    ["historial", History, "Historial"],
    ["pegar", ClipboardPaste, "Pegar"],
    ["caja", TextCursorInput, "Caja de comando"],
    ["teclado", Keyboard, "Teclado"],
  ];

  return (
    <div className={cx("flex shrink-0 border-t border-borde bg-[#16131f] safe-bottom", acostado ? "flex-row items-center" : "flex-col")}>
      {panel === "teclas" ? (
        <div className={cx(acostado && "min-w-0 flex-1")}>
          <PanelTeclas mods={mods} alTecla={alTecla} alPersonalizar={() => setPersonalizar(true)} />
        </div>
      ) : panel ? (
        <div className={cx("max-h-[300px] overflow-y-auto p-2.5", acostado && "min-w-0 flex-1")}>{contenidoPanel}</div>
      ) : (
        <div className={cx("flex gap-1.5 pt-2 pb-1", acostado ? "min-w-0 flex-1 flex-row py-1.5" : "flex-col")}>
          <Fila ids={fila1} mods={mods} alTecla={alTecla} />
          {acostado ? null : <Fila ids={fila2} mods={mods} alTecla={alTecla} />}
        </div>
      )}
      <div className={cx("flex items-center", acostado ? "gap-0.5 border-l border-borde px-1" : "h-12 justify-around border-t border-borde px-1.5")}>
        {botones.map(([id, Icono, nombre]) => {
          const encendido = (id === "caja" && cajaVisible) || id === panel;
          return (
            <button
              key={nombre}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              aria-label={nombre}
              title={nombre}
              aria-pressed={encendido}
              onClick={() => {
                if (id === "pegar") return alPegar();
                if (id === "caja") return alCaja();
                if (id === "teclado") return alTeclado();
                setPanel(panel === id ? null : id);
              }}
              className={cx("grid h-[38px] place-items-center rounded-[11px]", acostado ? "w-10" : "w-[46px]", encendido ? "bg-[color-mix(in_srgb,var(--acento)_16%,transparent)] text-acento" : "text-tenue")}
            >
              <Icono className="h-5 w-5" />
            </button>
          );
        })}
      </div>
      <Personalizar abierto={personalizar} alCerrar={() => setPersonalizar(false)} />
    </div>
  );
}
