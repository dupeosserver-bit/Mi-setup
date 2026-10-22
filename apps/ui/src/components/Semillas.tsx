/**
 * Servidores en mi PC → Semillas: genera semillas y mira su mapa (biomas y
 * estructuras) como en chunkbase. Todo se calcula en tu equipo.
 */
import { Copy, Dices, History, LocateFixed, Minus, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DIMENSIONES,
  ESTRUCTURAS,
  MotorSemilla,
  VERSIONES_SEMILLA,
  agregarAlHistorial,
  guardarHistorial,
  leerHistorial,
  semillaAlAzar,
  semillaDeTexto,
  type Marcador,
  type SemillaGuardada,
} from "../lib/semillas";
import { Boton, Campo, Cargando, Entrada, Insignia, Selector, Tarjeta, avisar, cx } from "./ui";

/** Bloques por pixel en cada nivel de zoom. */
const ZOOMS = [2, 4, 8, 16, 32, 64];

export function Semillas() {
  const [texto, setTexto] = useState("");
  const [semilla, setSemilla] = useState<bigint | null>(null);
  const [version, setVersion] = useState<number>(28);
  const [dim, setDim] = useState<number>(0);
  const [motor, setMotor] = useState<MotorSemilla | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<SemillaGuardada[]>(() => leerHistorial());
  const [centro, setCentro] = useState({ x: 0, z: 0 });
  const [zoom, setZoom] = useState(3);
  const [activas, setActivas] = useState<Set<number>>(new Set([5, 10, 1, 2, 8, 9, 13, 18, 19, 20]));
  const [resaltar, setResaltar] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; z: number; bioma: string } | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ ancho: 600, alto: 420 });
  const [marcadores, setMarcadores] = useState<Marcador[]>([]);
  const [aparicion, setAparicion] = useState<{ x: number; z: number } | null>(null);

  const abrir = (s: bigint, textoOriginal: string) => {
    setSemilla(s);
    setTexto(textoOriginal);
    setCentro({ x: 0, z: 0 });
    const nueva = agregarAlHistorial(historial, { semilla: s.toString(), texto: textoOriginal, version, fecha: new Date().toISOString() });
    setHistorial(nueva);
    guardarHistorial(nueva);
  };

  // Motor para la semilla, versión y dimensión elegidas.
  useEffect(() => {
    if (semilla === null) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    MotorSemilla.crear(semilla, version, dim)
      .then((m) => {
        if (!vivo) return;
        setMotor(m);
        setAparicion(dim === 0 ? m.aparicion() : null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo cargar el motor de semillas"))
      .finally(() => setCargando(false));
    return () => {
      vivo = false;
    };
  }, [semilla, version, dim]);

  // Tamaño del mapa según el espacio disponible (PC o celular).
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setTam({ ancho: Math.max(240, el.clientWidth), alto: Math.max(260, Math.min(640, Math.round(el.clientWidth * 0.75))) });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [motor]);

  const bpp = ZOOMS[zoom]!;
  const vista = useMemo(() => {
    const x0 = centro.x - (tam.ancho / 2) * bpp;
    const z0 = centro.z - (tam.alto / 2) * bpp;
    return { x0, z0, x1: x0 + tam.ancho * bpp, z1: z0 + tam.alto * bpp };
  }, [centro, tam, bpp]);

  // Dibujo: biomas a la escala que conviene (4 o 16 bloques por celda) y luego estructuras.
  useEffect(() => {
    const c = lienzo.current;
    if (!c || !motor) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const escala = bpp >= 16 ? 16 : 4;
    const celdasX = Math.ceil((tam.ancho * bpp) / escala) + 1;
    const celdasZ = Math.ceil((tam.alto * bpp) / escala) + 1;
    const cx0 = Math.floor(vista.x0 / escala);
    const cz0 = Math.floor(vista.z0 / escala);
    let biomas: Int32Array;
    try {
      biomas = motor.biomas(cx0, cz0, celdasX, celdasZ, escala);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al dibujar");
      return;
    }
    const img = ctx.createImageData(celdasX, celdasZ);
    for (let i = 0; i < biomas.length; i++) {
      const id = biomas[i]!;
      const [r, g, b] = motor.color(id);
      const apagado = resaltar !== null && id !== resaltar;
      img.data[i * 4] = apagado ? r * 0.25 : r;
      img.data[i * 4 + 1] = apagado ? g * 0.25 : g;
      img.data[i * 4 + 2] = apagado ? b * 0.25 : b;
      img.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement("canvas");
    tmp.width = celdasX;
    tmp.height = celdasZ;
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    c.width = tam.ancho;
    c.height = tam.alto;
    ctx.imageSmoothingEnabled = false;
    const desfX = (cx0 * escala - vista.x0) / bpp;
    const desfZ = (cz0 * escala - vista.z0) / bpp;
    ctx.drawImage(tmp, desfX, desfZ, (celdasX * escala) / bpp, (celdasZ * escala) / bpp);
    // Estructuras de la dimensión actual.
    const lista: Marcador[] = [];
    for (const e of ESTRUCTURAS) if (e.dim === dim && activas.has(e.id)) lista.push(...motor.estructuras(e.id, vista.x0, vista.z0, vista.x1, vista.z1, 300));
    setMarcadores(lista);
  }, [motor, vista, tam, bpp, activas, resaltar, dim]);

  const aPantalla = (x: number, z: number) => ({ left: (x - vista.x0) / bpp, top: (z - vista.z0) / bpp });

  // Arrastrar para moverse; rueda o botones para acercar.
  const arrastre = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const alMover = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.round(vista.x0 + (e.clientX - r.left) * bpp);
    const z = Math.round(vista.z0 + (e.clientY - r.top) * bpp);
    if (motor) setCursor({ x, z, bioma: motor.nombreBioma(motor.bioma(x, z)) });
    if (arrastre.current) setCentro({ x: arrastre.current.cx - (e.clientX - arrastre.current.x) * bpp, z: arrastre.current.cz - (e.clientY - arrastre.current.y) * bpp });
  };

  const biomasVisibles = useMemo(() => {
    if (!motor) return [];
    const ids = new Set<number>();
    const muestra = motor.biomas(Math.floor(vista.x0 / 16), Math.floor(vista.z0 / 16), 48, 36, 16);
    for (const id of muestra) ids.add(id);
    return [...ids].map((id) => ({ id, nombre: motor.nombreBioma(id) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [motor, vista.x0, vista.z0]);

  const [irA, setIrA] = useState({ x: "", z: "" });

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Semilla" icono={Dices}>
        <div className="space-y-3">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (texto.trim()) abrir(semillaDeTexto(texto), texto.trim());
            }}
          >
            <Entrada className="min-w-0 flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe la semilla (número o texto)" maxLength={64} />
            <Boton type="submit" variante="primario" icono={Search} disabled={!texto.trim()}>
              Ver mapa
            </Boton>
            <Boton
              icono={Dices}
              onClick={() => {
                const s = semillaAlAzar();
                abrir(s, s.toString());
              }}
            >
              Al azar
            </Boton>
          </form>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Campo etiqueta="Versión de Minecraft">
              <Selector value={String(version)} onChange={(e) => setVersion(Number(e.target.value))}>
                {VERSIONES_SEMILLA.map((v) => (
                  <option key={v.id} value={v.id}>
                    Java {v.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Dimensión">
              <Selector value={String(dim)} onChange={(e) => setDim(Number(e.target.value))}>
                {DIMENSIONES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>
          {semilla !== null ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-tenue">Semilla:</span>
              <code className="rounded bg-fondo px-2 py-0.5">{semilla.toString()}</code>
              <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Copiar semilla" onClick={() => void navigator.clipboard.writeText(semilla.toString()).then(() => avisar("Semilla copiada"))} />
              {aparicion ? <Insignia>Aparición: {aparicion.x}, {aparicion.z}</Insignia> : null}
            </div>
          ) : null}
        </div>
      </Tarjeta>

      {semilla !== null ? (
        <Tarjeta titulo="Mapa">
          {cargando ? <Cargando texto="Calculando el mundo…" /> : null}
          {error ? <p className="text-sm text-peligro">{error}</p> : null}
          <div ref={caja} className="w-full">
            <div
              className="relative touch-none select-none overflow-hidden rounded-xl border border-borde bg-black"
              style={{ width: tam.ancho, height: tam.alto, cursor: arrastre.current ? "grabbing" : "grab" }}
              onPointerDown={(e) => {
                arrastre.current = { x: e.clientX, y: e.clientY, cx: centro.x, cz: centro.z };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={alMover}
              onPointerUp={() => {
                arrastre.current = null;
              }}
              onPointerLeave={() => setCursor(null)}
              onWheel={(e) => setZoom((z) => Math.max(0, Math.min(ZOOMS.length - 1, z + (e.deltaY > 0 ? 1 : -1))))}
            >
              <canvas ref={lienzo} className="absolute inset-0" />
              {marcadores.map((m, i) => {
                // Al cambiar de dimensión pueden quedar marcadores de la anterior un instante.
                const e = ESTRUCTURAS.find((x) => x.id === m.tipo && x.dim === dim);
                if (!e) return null;
                const p = aPantalla(m.x, m.z);
                return (
                  <span
                    key={`${m.tipo}-${m.x}-${m.z}-${i}`}
                    title={`${e.nombre} · ${m.x}, ${m.z}`}
                    className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-[10px] font-bold text-black shadow"
                    style={{ ...p, background: e.color }}
                  >
                    {e.letra}
                  </span>
                );
              })}
              {aparicion ? (
                <span className="absolute -translate-x-1/2 -translate-y-1/2 text-xl drop-shadow" style={aPantalla(aparicion.x, aparicion.z)} title="Punto de aparición">
                  ⭐
                </span>
              ) : null}
              <div className="absolute right-2 top-2 flex flex-col gap-1">
                <Boton tamano="icono" icono={Plus} aria-label="Acercar" onClick={() => setZoom(Math.max(0, zoom - 1))} />
                <Boton tamano="icono" icono={Minus} aria-label="Alejar" onClick={() => setZoom(Math.min(ZOOMS.length - 1, zoom + 1))} />
                <Boton tamano="icono" icono={LocateFixed} aria-label="Ir al centro" onClick={() => setCentro(aparicion ?? { x: 0, z: 0 })} />
              </div>
              <div className="absolute bottom-2 left-2 rounded-lg bg-black/70 px-2 py-1 text-[11px] text-white">
                {cursor ? `X ${cursor.x} · Z ${cursor.z} · ${cursor.bioma}` : `Centro ${Math.round(centro.x)}, ${Math.round(centro.z)} · 1 px = ${bpp} bloques`}
              </div>
            </div>
          </div>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const x = Number(irA.x);
              const z = Number(irA.z);
              if (Number.isFinite(x) && Number.isFinite(z)) setCentro({ x, z });
            }}
          >
            <span className="text-xs text-tenue">Ir a:</span>
            <Entrada className="h-8 w-24" inputMode="numeric" value={irA.x} onChange={(e) => setIrA({ ...irA, x: e.target.value })} placeholder="X" />
            <Entrada className="h-8 w-24" inputMode="numeric" value={irA.z} onChange={(e) => setIrA({ ...irA, z: e.target.value })} placeholder="Z" />
            <Boton type="submit" tamano="sm">
              Ir
            </Boton>
          </form>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tenue">Estructuras</p>
              <div className="flex flex-wrap gap-1">
                {ESTRUCTURAS.filter((e) => e.dim === dim).map((e) => (
                  <button
                    key={`${e.id}-${e.dim}`}
                    type="button"
                    onClick={() => setActivas((s) => (s.has(e.id) ? new Set([...s].filter((x) => x !== e.id)) : new Set([...s, e.id])))}
                    className={cx("flex items-center gap-1 rounded-full border px-2 py-1 text-xs", activas.has(e.id) ? "border-acento bg-acento/10" : "border-borde text-tenue")}
                  >
                    <span className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-black" style={{ background: e.color }}>
                      {e.letra}
                    </span>
                    {e.nombre}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tenue">Resaltar bioma</p>
              <Selector value={resaltar === null ? "" : String(resaltar)} onChange={(e) => setResaltar(e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">Todos</option>
                {biomasVisibles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre.replace(/_/g, " ")}
                  </option>
                ))}
              </Selector>
            </div>
          </div>
          <p className="mt-2 text-xs text-tenue">Calculado con Cubiomes (como los visores de semillas). Las estructuras se marcan donde el bioma las permite; en raras ocasiones el juego no las genera por el terreno.</p>
        </Tarjeta>
      ) : null}

      <Tarjeta titulo="Últimas 10 semillas" icono={History}>
        {!historial.length ? <p className="text-sm text-tenue">Aquí aparecerán las semillas que veas.</p> : null}
        <ul className="space-y-1">
          {historial.map((h) => (
            <li key={h.semilla} className="flex items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => (setVersion(h.version), abrir(BigInt(h.semilla), h.texto))}>
                {h.texto !== h.semilla ? `${h.texto} (${h.semilla})` : h.semilla}
              </button>
              <span className="text-xs text-tenue">{VERSIONES_SEMILLA.find((v) => v.id === h.version)?.nombre ?? ""}</span>
              <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Copiar" onClick={() => void navigator.clipboard.writeText(h.semilla).then(() => avisar("Copiada"))} />
            </li>
          ))}
        </ul>
        {historial.length ? (
          <Boton
            className="mt-2"
            tamano="sm"
            variante="fantasma"
            icono={Trash2}
            onClick={() => {
              setHistorial([]);
              guardarHistorial([]);
            }}
          >
            Borrar historial
          </Boton>
        ) : null}
      </Tarjeta>
    </div>
  );
}
