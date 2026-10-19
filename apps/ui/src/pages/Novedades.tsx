/** Novedades: clima (con ubicación en tiempo real), ofertas y juegos gratis, tiendas para buscar y vigilante de precios. */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cpu,
  Crosshair,
  ExternalLink,
  Gamepad2,
  Gift,
  Info,
  MapPin,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Compras } from "../components/Compras";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtFecha, fmtFechaHora, haceCuanto } from "../lib/formato";
import { abrirExterno, escritorio, leerSistema } from "../lib/plataforma";
import { useNavigate } from "react-router-dom";
import { ubicacionActual } from "../lib/ubicacion";

// ---------------------------------------------------------------- clima

interface Ubicacion {
  nombre: string;
  lat: number;
  lon: number;
  auto?: boolean;
}
interface Pronostico {
  current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number; is_day: number };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] };
}

/** Códigos WMO de Open-Meteo → texto e ícono. */
function tiempo(codigo: number, dia = true): { texto: string; icono: LucideIcon } {
  if (codigo === 0) return { texto: "Despejado", icono: dia ? Sun : Moon };
  if (codigo <= 2) return { texto: "Parcialmente nublado", icono: CloudSun };
  if (codigo === 3) return { texto: "Nublado", icono: Cloud };
  if (codigo <= 48) return { texto: "Niebla", icono: CloudFog };
  if (codigo <= 57) return { texto: "Llovizna", icono: CloudDrizzle };
  if (codigo <= 67 || (codigo >= 80 && codigo <= 82)) return { texto: "Lluvia", icono: CloudRain };
  if (codigo <= 77 || codigo === 85 || codigo === 86) return { texto: "Nieve", icono: CloudSnow };
  return { texto: "Tormenta", icono: CloudLightning };
}

function Clima() {
  const ubicacion = useQuery({ queryKey: ["novedades", "ubicacion"], queryFn: () => api<Ubicacion | null>("/api/novedades/clima/ubicacion") });
  const [buscar, setBuscar] = useState("");
  const [q, setQ] = useState("");
  const [detectando, setDetectando] = useState(false);
  const ciudades = useQuery({
    queryKey: ["novedades", "ciudades", q],
    queryFn: () => api<Ubicacion[]>(`/api/novedades/ciudades?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });
  const guardar = useMutation({
    mutationFn: (u: Ubicacion) => api<Ubicacion>("/api/novedades/clima/ubicacion", { metodo: "PUT", cuerpo: u }),
    onSuccess: () => {
      setQ("");
      setBuscar("");
      void queryClient.invalidateQueries({ queryKey: ["novedades", "ubicacion"] });
    },
    onError: avisarError,
  });
  const u = ubicacion.data;

  const detectar = async (auto: boolean, silencioso = false) => {
    setDetectando(true);
    try {
      const lugar = await ubicacionActual();
      guardar.mutate({ nombre: lugar.nombre, lat: lugar.lat, lon: lugar.lon, auto });
      if (!silencioso) avisar(lugar.metodo === "gps" ? `Ubicación detectada: ${lugar.nombre}` : `Ubicación aproximada por tu internet: ${lugar.nombre}`, "info");
    } catch (err) {
      if (!silencioso) avisarError(err);
    } finally {
      setDetectando(false);
    }
  };

  // Ubicación en tiempo real: si está activada, se vuelve a detectar cada vez que abres Clima.
  const yaDetectado = useRef(false);
  useEffect(() => {
    if (u?.auto && !yaDetectado.current) {
      yaDetectado.current = true;
      void detectar(true, true);
    }
  }, [u?.auto]);

  const clima = useQuery({
    queryKey: ["novedades", "clima", u?.lat, u?.lon],
    queryFn: () => api<Pronostico>(`/api/novedades/clima?lat=${u!.lat}&lon=${u!.lon}`),
    enabled: Boolean(u),
    refetchInterval: 15 * 60_000,
  });

  const actual = clima.data ? tiempo(clima.data.current.weather_code, clima.data.current.is_day === 1) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" icono={Crosshair} cargando={detectando} onClick={() => void detectar(Boolean(u?.auto))}>
          Usar mi ubicación
        </Boton>
        <form
          className="flex min-w-60 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(buscar.trim());
          }}
        >
          <Entrada value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={u ? `O busca otra ciudad (ahora: ${u.nombre})` : "O busca tu ciudad…"} />
          <Boton type="submit" icono={MapPin}>
            Buscar
          </Boton>
        </form>
      </div>
      <Interruptor
        activo={Boolean(u?.auto)}
        alCambiar={(v) => (u ? guardar.mutate({ ...u, auto: v }) : void detectar(v))}
        etiqueta="Ubicación en tiempo real (detectarla cada vez que abro Clima)"
      />
      {ciudades.data?.length ? (
        <div className="flex flex-wrap gap-2">
          {ciudades.data.map((c) => (
            <Boton key={`${c.lat},${c.lon}`} tamano="sm" onClick={() => guardar.mutate({ ...c, auto: false })}>
              {c.nombre}
            </Boton>
          ))}
        </div>
      ) : null}
      {!u && !ubicacion.isLoading ? <Vacio icono={MapPin} texto="Toca 'Usar mi ubicación' o busca tu ciudad." /> : null}
      <ErrorCaja error={clima.error} />
      {clima.data && actual && u ? (
        <>
          <Tarjeta titulo={u.nombre} acciones={u.auto ? <Insignia tono="ok">En tiempo real</Insignia> : null}>
            <div className="flex items-center gap-4">
              <actual.icono className="h-12 w-12 text-acento" />
              <div>
                <p className="text-4xl font-bold">{Math.round(clima.data.current.temperature_2m)}°</p>
                <p className="text-sm text-tenue">
                  {actual.texto} · Sensación {Math.round(clima.data.current.apparent_temperature)}° · Humedad {clima.data.current.relative_humidity_2m}% · Viento{" "}
                  {Math.round(clima.data.current.wind_speed_10m)} km/h
                </p>
              </div>
            </div>
          </Tarjeta>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {clima.data.daily.time.map((dia, i) => {
              const t = tiempo(clima.data.daily.weather_code[i] ?? 0);
              return (
                <div key={dia} className="rounded-tarjeta border border-borde bg-superficie p-3 text-center text-sm">
                  <p className="text-tenue">{new Date(`${dia}T12:00:00`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric" })}</p>
                  <t.icono className="mx-auto my-2 h-6 w-6" />
                  <p className="font-medium">
                    {Math.round(clima.data.daily.temperature_2m_max[i] ?? 0)}° / {Math.round(clima.data.daily.temperature_2m_min[i] ?? 0)}°
                  </p>
                  <p className="text-xs text-tenue">Lluvia {clima.data.daily.precipitation_probability_max[i] ?? 0}%</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-tenue">Datos de Open-Meteo. La ubicación usa el GPS del celular o la del sistema en la PC; si no hay, una aproximada por tu internet.</p>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- ofertas y tiendas

interface Oferta {
  id: string;
  titulo: string;
  tienda: string;
  precio: number;
  precioNormal: number;
  ahorro: number;
  imagen: string;
  metacritic: number | null;
  url: string;
}

interface TiendaJuegos {
  id: string;
  nombre: string;
  tipo: "oficial" | "autorizada" | "revendedor" | "mercado";
  url: string;
}

const TIPO_TIENDA: Record<TiendaJuegos["tipo"], { texto: string; tono: "ok" | "neutro" | "aviso" }> = {
  oficial: { texto: "Oficial", tono: "ok" },
  autorizada: { texto: "Autorizada", tono: "ok" },
  revendedor: { texto: "Revendedor", tono: "neutro" },
  mercado: { texto: "Mercado de claves", tono: "aviso" },
};

function BuscarEnTiendas() {
  const tiendas = useQuery({ queryKey: ["novedades", "tiendas-juegos"], queryFn: () => api<TiendaJuegos[]>("/api/novedades/tiendas-juegos"), staleTime: Infinity });
  const [juego, setJuego] = useState("");
  return (
    <Tarjeta titulo="Buscar un juego en tiendas confiables" icono={Search}>
      <Entrada value={juego} onChange={(e) => setJuego(e.target.value)} placeholder="Nombre del juego, ej. Minecraft" />
      <div className="mt-3 flex flex-wrap gap-2">
        {tiendas.data?.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={!juego.trim()}
            onClick={() => abrirExterno(`${t.url}${encodeURIComponent(juego.trim())}`)}
            className="flex items-center gap-2 rounded-xl border border-borde bg-fondo px-3 py-2 text-sm hover:bg-tarjeta disabled:opacity-40"
          >
            {t.nombre}
            <Insignia tono={TIPO_TIENDA[t.tipo].tono}>{TIPO_TIENDA[t.tipo].texto}</Insignia>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-tenue">
        Oficial/Autorizada: venden claves directo del desarrollador. Eneba, G2A y Kinguin son mercados donde venden otras personas: suelen ser más baratos, pero revisa la
        calificación del vendedor, que la clave sea para tu región (México o Global) y evita pagar la "protección" extra si no la necesitas.
      </p>
    </Tarjeta>
  );
}

/** Botones Anterior / Siguiente con el número de página. */
function Paginador({ pagina, total, hayMas, alCambiar }: { pagina: number; total?: number | undefined; hayMas?: boolean; alCambiar: (p: number) => void }) {
  const siguiente = total !== undefined ? pagina < total : Boolean(hayMas);
  if (pagina === 1 && !siguiente) return null;
  return (
    <div className="flex items-center justify-center gap-2">
      <Boton tamano="sm" icono={ChevronLeft} disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
        Anterior
      </Boton>
      <span className="text-sm text-tenue">
        Página {pagina}
        {total !== undefined ? ` de ${total}` : ""}
      </span>
      <Boton tamano="sm" disabled={!siguiente} onClick={() => alCambiar(pagina + 1)}>
        Siguiente <ChevronRight className="h-4 w-4" />
      </Boton>
    </div>
  );
}

function Ofertas() {
  const [tienda, setTienda] = useState("");
  const [precioMax, setPrecioMax] = useState("15");
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [tienda, precioMax]);
  const tiendas = useQuery({ queryKey: ["novedades", "tiendas"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/novedades/tiendas") });
  const ofertas = useQuery({
    queryKey: ["novedades", "ofertas", tienda, precioMax, pagina],
    queryFn: () => api<Oferta[]>(`/api/novedades/ofertas?precioMax=${precioMax}&pagina=${pagina}${tienda ? `&tienda=${tienda}` : ""}`),
  });
  const nombreTienda = new Map((tiendas.data ?? []).map((t) => [t.id, t.nombre]));
  return (
    <div className="space-y-4">
      <BuscarEnTiendas />
      <div className="flex flex-wrap gap-2">
        <Selector className="max-w-xs" value={tienda} onChange={(e) => setTienda(e.target.value)}>
          <option value="">Todas las tiendas</option>
          {tiendas.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </Selector>
        <Selector className="max-w-[10rem]" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)}>
          {["5", "10", "15", "30", "60"].map((p) => (
            <option key={p} value={p}>
              Hasta {p} USD
            </option>
          ))}
        </Selector>
      </div>
      {ofertas.isLoading ? <Cargando /> : null}
      <ErrorCaja error={ofertas.error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ofertas.data?.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => abrirExterno(o.url)}
            className="flex gap-3 rounded-tarjeta border border-borde bg-superficie p-3 text-left hover:bg-tarjeta"
          >
            <img src={o.imagen} alt={o.titulo} loading="lazy" referrerPolicy="no-referrer" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{o.titulo}</p>
              <p className="text-xs text-tenue">{nombreTienda.get(o.tienda) ?? "Tienda"}</p>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className="font-bold">{o.precio.toFixed(2)} USD</span>
                <span className="text-xs text-tenue line-through">{o.precioNormal.toFixed(2)}</span>
                <Insignia tono="ok">-{o.ahorro}%</Insignia>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-tenue" />
          </button>
        ))}
      </div>
      <Paginador pagina={pagina} hayMas={(ofertas.data?.length ?? 0) >= 30} alCambiar={setPagina} />
      <p className="text-xs text-tenue">Ofertas de tiendas oficiales vía CheapShark (precios en USD).</p>
    </div>
  );
}

interface Gratis {
  id: number;
  titulo: string;
  valor: string | null;
  imagen: string;
  descripcion: string;
  url: string;
  plataformas: string;
  termina: string | null;
}

function JuegosGratis() {
  const [plataforma, setPlataforma] = useState("todas");
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [plataforma]);
  const respuesta = useQuery({
    queryKey: ["novedades", "gratis", plataforma, pagina],
    queryFn: () => api<{ pagina: number; totalPaginas: number; juegos: Gratis[] }>(`/api/novedades/juegos-gratis?plataforma=${plataforma}&pagina=${pagina}`),
  });
  const lista = { ...respuesta, data: respuesta.data?.juegos };
  return (
    <div className="space-y-4">
      <Selector className="max-w-xs" value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>
        <option value="todas">Todas las plataformas</option>
        <option value="pc">PC</option>
        <option value="epic-games-store">Epic Games</option>
        <option value="steam">Steam</option>
        <option value="gog">GOG</option>
        <option value="ps5">PlayStation 5</option>
        <option value="xbox-series-xs">Xbox Series</option>
        <option value="switch">Nintendo Switch</option>
        <option value="android">Android</option>
      </Selector>
      {lista.isLoading ? <Cargando /> : null}
      <ErrorCaja error={lista.error} />
      {lista.data?.length === 0 ? <Vacio icono={Gift} texto="No hay juegos gratis activos para esa plataforma." /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lista.data?.map((g) => (
          <button key={g.id} type="button" onClick={() => abrirExterno(g.url)} className="overflow-hidden rounded-tarjeta border border-borde bg-superficie text-left hover:bg-tarjeta">
            <img src={g.imagen} alt={g.titulo} loading="lazy" referrerPolicy="no-referrer" className="h-32 w-full object-cover" />
            <div className="space-y-1 p-3">
              <p className="text-sm font-medium">{g.titulo}</p>
              <p className="text-xs text-tenue">{g.plataformas}</p>
              <div className="flex flex-wrap gap-1">
                <Insignia tono="ok">Gratis</Insignia>
                {g.valor ? <Insignia>Vale {g.valor}</Insignia> : null}
                {g.termina ? <Insignia tono="aviso">Hasta {fmtFecha(g.termina)}</Insignia> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
      <Paginador pagina={pagina} total={respuesta.data?.totalPaginas} alCambiar={setPagina} />
      <p className="text-xs text-tenue">Datos de GamerPower. Ábrelos para reclamarlos en su tienda.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Steam

interface ResultadoSteam {
  id: number;
  nombre: string;
  imagen: string;
  precio: number | null;
  moneda: string | null;
}

interface JuegoSteam {
  id: number;
  nombre: string;
  imagen: string;
  descripcion: string;
  precio: number | null;
  descuento: number;
  lanzamiento: string | null;
  generos: string[];
  desarrollador: string | null;
  metacritic: number | null;
  jugadoresAhora: number | null;
  picoAyer: number | null;
  resenas: { positivas: number; negativas: number; porcentaje: number } | null;
  duenos: string | null;
  horasPromedio: number | null;
  requisitos: { minimos: string | null; recomendados: string | null };
  url: string;
  steamdb: string;
}

/** Tu PC para "¿Me corre?": se detecta sola en la app de Windows; en el celular la escribes una vez. */
interface MiPc {
  procesador: string;
  graficos: string;
  ramGb: number;
}
const CLAVE_MI_PC = "mi-setup.mi-pc";

function leerMiPc(): MiPc | null {
  try {
    const v = localStorage.getItem(CLAVE_MI_PC);
    return v ? (JSON.parse(v) as MiPc) : null;
  } catch {
    return null;
  }
}

/** Busca "8 GB" de RAM o de espacio dentro del texto de requisitos. */
function gbEn(texto: string | null, palabras: RegExp): number | null {
  if (!texto) return null;
  for (const linea of texto.split(/\n|(?=Memoria|Almacenamiento|Gráficos|Procesador|Memory|Storage)/i)) {
    if (!palabras.test(linea)) continue;
    const m = /(\d+(?:[.,]\d+)?)\s*(GB|MB|TB)/i.exec(linea);
    if (!m) continue;
    const n = Number(m[1]!.replace(",", "."));
    return m[2]!.toUpperCase() === "MB" ? n / 1024 : m[2]!.toUpperCase() === "TB" ? n * 1024 : n;
  }
  return null;
}

function MeCorre({ juego }: { juego: JuegoSteam }) {
  const navegar = useNavigate();
  const [pc, setPc] = useState<MiPc | null>(leerMiPc);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<MiPc>(pc ?? { procesador: "", graficos: "", ramGb: 16 });

  // En la app de Windows se leen las piezas reales de la PC.
  useEffect(() => {
    if (!escritorio() || pc) return;
    void leerSistema().then((s) => {
      const detectada = { procesador: s.procesador, graficos: s.graficos.join(" / "), ramGb: Math.round(s.memoria / 1024 ** 3) };
      setPc(detectada);
      setBorrador(detectada);
      try {
        localStorage.setItem(CLAVE_MI_PC, JSON.stringify(detectada));
      } catch {
        // Sin almacenamiento local: se vuelve a detectar la próxima vez.
      }
    });
  }, [pc]);

  const ramMin = gbEn(juego.requisitos.minimos, /memoria|memory|ram/i);
  const ramRec = gbEn(juego.requisitos.recomendados, /memoria|memory|ram/i);
  const espacio = gbEn(juego.requisitos.minimos, /almacenamiento|espacio|storage|disco/i);
  const veredictoRam = !pc || ramMin === null ? null : pc.ramGb >= (ramRec ?? ramMin) ? "ok" : pc.ramGb >= ramMin ? "justo" : "no";

  const preguntar = () => {
    if (!pc) return;
    const pregunta =
      `¿Me corre "${juego.nombre}"? Mi PC: procesador ${pc.procesador}, gráficos ${pc.graficos}, ${pc.ramGb} GB de RAM.\n` +
      `Requisitos mínimos: ${juego.requisitos.minimos ?? "no publicados"}\nRecomendados: ${juego.requisitos.recomendados ?? "no publicados"}\n` +
      "Dime si me corre, en qué calidad (bajo, medio, alto o ultra), a cuántos FPS aproximados en 1080p y qué ajustes me recomiendas.";
    navegar(`/ia?pregunta=${encodeURIComponent(pregunta.slice(0, 1800))}`);
  };

  const guardar = () => {
    setPc(borrador);
    setEditando(false);
    try {
      localStorage.setItem(CLAVE_MI_PC, JSON.stringify(borrador));
    } catch {
      // Sin almacenamiento local: dura solo esta vez.
    }
  };

  return (
    <Tarjeta titulo="¿Me corre?" icono={Cpu}>
      {pc && !editando ? (
        <div className="space-y-2 text-sm">
          <p className="text-tenue">
            Tu PC: <span className="text-texto">{pc.procesador}</span> · <span className="text-texto">{pc.graficos}</span> · <span className="text-texto">{pc.ramGb} GB RAM</span>{" "}
            <button type="button" className="text-xs underline" onClick={() => setEditando(true)}>
              cambiar
            </button>
          </p>
          {veredictoRam ? (
            <p>
              RAM:{" "}
              <Insignia tono={veredictoRam === "ok" ? "ok" : veredictoRam === "justo" ? "aviso" : "peligro"}>
                {veredictoRam === "ok" ? "suficiente" : veredictoRam === "justo" ? "justa (cumple el mínimo)" : `insuficiente (pide ${ramMin} GB)`}
              </Insignia>
            </p>
          ) : null}
          {espacio ? <p className="text-tenue">Espacio necesario: {espacio} GB</p> : null}
          <p className="text-xs text-tenue">El procesador y la tarjeta de video son difíciles de comparar a mano: la IA te dice si te corre, en qué calidad y a cuántos FPS.</p>
          <Boton variante="primario" icono={Sparkles} onClick={preguntar}>
            Preguntarle a la IA
          </Boton>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-tenue">Escribe las piezas de tu PC una vez (en la app de Windows se detectan solas).</p>
          <Campo etiqueta="Procesador">
            <Entrada value={borrador.procesador} onChange={(e) => setBorrador({ ...borrador, procesador: e.target.value })} placeholder="Ej. Ryzen 5 5600" />
          </Campo>
          <Campo etiqueta="Tarjeta de video">
            <Entrada value={borrador.graficos} onChange={(e) => setBorrador({ ...borrador, graficos: e.target.value })} placeholder="Ej. RTX 3060 12 GB" />
          </Campo>
          <Campo etiqueta="RAM (GB)">
            <Entrada type="number" min={1} max={512} value={borrador.ramGb} onChange={(e) => setBorrador({ ...borrador, ramGb: Number(e.target.value) || 0 })} />
          </Campo>
          <Boton variante="primario" disabled={!borrador.procesador.trim() || !borrador.graficos.trim() || borrador.ramGb <= 0} onClick={guardar}>
            Guardar mi PC
          </Boton>
        </div>
      )}
    </Tarjeta>
  );
}

function FichaSteam({ id }: { id: number }) {
  const q = useQuery({ queryKey: ["novedades", "steam", id], queryFn: () => api<JuegoSteam>(`/api/novedades/steam/${id}`) });
  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCaja error={q.error} />;
  const j = q.data;
  if (!j) return null;
  const dato = (titulo: string, valor: string | null) =>
    valor ? (
      <div className="rounded-xl bg-fondo p-3">
        <p className="text-xs text-tenue">{titulo}</p>
        <p className="text-lg font-semibold">{valor}</p>
      </div>
    ) : null;
  return (
    <div className="space-y-4">
      <Tarjeta>
        <div className="flex flex-col gap-4 md:flex-row">
          <img src={j.imagen} alt={j.nombre} referrerPolicy="no-referrer" className="w-full rounded-xl object-cover md:w-80" />
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-xl font-semibold">{j.nombre}</h3>
            <p className="text-sm text-tenue">{j.descripcion}</p>
            <div className="flex flex-wrap gap-1">
              {j.generos.map((g) => (
                <Insignia key={g}>{g}</Insignia>
              ))}
              {j.lanzamiento ? <Insignia>{j.lanzamiento}</Insignia> : null}
              {j.desarrollador ? <Insignia>{j.desarrollador}</Insignia> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Boton tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(j.url)}>
                Steam
              </Boton>
              <Boton tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(j.steamdb)}>
                SteamDB (historial de precios)
              </Boton>
            </div>
          </div>
        </div>
      </Tarjeta>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {dato("Jugando ahora", j.jugadoresAhora !== null ? j.jugadoresAhora.toLocaleString("es-MX") : null)}
        {dato("Pico de ayer", j.picoAyer !== null ? j.picoAyer.toLocaleString("es-MX") : null)}
        {dato("Reseñas positivas", j.resenas ? `${j.resenas.porcentaje} %` : null)}
        {dato("Precio", j.precio === null ? null : j.precio === 0 ? "Gratis" : `$${j.precio.toLocaleString("es-MX")} MXN${j.descuento ? ` (-${j.descuento}%)` : ""}`)}
        {dato("Dueños (aprox.)", j.duenos)}
        {dato("Horas promedio", j.horasPromedio !== null ? `${j.horasPromedio} h` : null)}
        {dato("Metacritic", j.metacritic !== null ? String(j.metacritic) : null)}
      </div>
      <MeCorre juego={j} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Requisitos mínimos">
          <p className="whitespace-pre-line text-sm text-tenue">{j.requisitos.minimos ?? "Steam no los publica."}</p>
        </Tarjeta>
        <Tarjeta titulo="Requisitos recomendados">
          <p className="whitespace-pre-line text-sm text-tenue">{j.requisitos.recomendados ?? "Steam no los publica."}</p>
        </Tarjeta>
      </div>
    </div>
  );
}

function Steam() {
  const [texto, setTexto] = useState("");
  const [buscar, setBuscar] = useState("");
  const [elegido, setElegido] = useState<number | null>(null);
  const resultados = useQuery({
    queryKey: ["novedades", "steam-buscar", buscar],
    queryFn: () => api<ResultadoSteam[]>(`/api/novedades/steam/buscar?q=${encodeURIComponent(buscar)}`),
    enabled: buscar.length >= 2,
  });
  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBuscar(texto.trim());
          setElegido(null);
        }}
      >
        <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Busca un juego de Steam, ej. Cyberpunk" />
        <Boton type="submit" variante="primario" icono={Search} disabled={texto.trim().length < 2}>
          Buscar
        </Boton>
      </form>
      {resultados.isLoading ? <Cargando /> : null}
      <ErrorCaja error={resultados.error} />
      {elegido === null ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {resultados.data?.map((r) => (
            <button key={r.id} type="button" onClick={() => setElegido(r.id)} className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-2 text-left hover:bg-tarjeta">
              <img src={r.imagen} alt={r.nombre} referrerPolicy="no-referrer" className="h-12 w-24 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.nombre}</p>
                <p className="text-xs text-tenue">{r.precio === null ? "Gratis o sin precio" : `$${r.precio.toLocaleString("es-MX")} ${r.moneda ?? ""}`}</p>
              </div>
            </button>
          ))}
          {resultados.data?.length === 0 ? <Vacio icono={Gamepad2} texto="No encontré juegos con ese nombre." /> : null}
        </div>
      ) : (
        <>
          <Boton tamano="sm" variante="fantasma" icono={ChevronLeft} onClick={() => setElegido(null)}>
            Volver a los resultados
          </Boton>
          <FichaSteam id={elegido} />
        </>
      )}
      {!buscar ? <Vacio icono={Gamepad2} texto="Busca un juego para ver jugadores en línea, reseñas, requisitos y si te corre." /> : null}
      <p className="text-xs text-tenue">Datos de la tienda de Steam y SteamSpy. SteamDB no tiene API pública: se abre en el navegador.</p>
    </div>
  );
}

// ---------------------------------------------------------------- vigilante de precios

interface Vigilante {
  id: string;
  nombre: string;
  url: string;
  selector: string;
  activo: boolean;
  precio: number | null;
  objetivo: number | null;
  texto: string | null;
  revisado: string | null;
  error: string | null;
}

function Historial({ id, objetivo }: { id: string; objetivo: number | null }) {
  const h = useQuery({ queryKey: ["novedades", "historial", id], queryFn: () => api<{ precio: number; fecha: string }[]>(`/api/novedades/vigilante/${id}/historial`) });
  if (!h.data || h.data.length < 2) return null;
  return (
    <div className="mt-3 h-32">
      <ResponsiveContainer>
        <LineChart data={h.data.map((p) => ({ ...p, t: new Date(p.fecha).getTime() }))}>
          <CartesianGrid stroke="var(--borde)" strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => fmtFecha(v)} stroke="var(--texto-2)" fontSize={11} />
          <YAxis stroke="var(--texto-2)" fontSize={11} width={50} domain={["auto", "auto"]} />
          <Tooltip labelFormatter={(v) => fmtFechaHora(Number(v))} contentStyle={{ background: "var(--tarjeta)", border: "1px solid var(--borde)", borderRadius: 12 }} />
          {objetivo !== null ? <ReferenceLine y={objetivo} stroke="var(--aviso)" strokeDasharray="4 4" /> : null}
          <Line type="stepAfter" dataKey="precio" stroke="var(--ok)" dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComoFunciona() {
  return (
    <Tarjeta titulo="¿Cómo se usa? (3 pasos)" icono={Info}>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-tenue">
        <li>
          En tu celular o PC abre el producto en la tienda y <b className="text-texto">copia el enlace</b> (en el celular: Compartir → Copiar enlace).
        </li>
        <li>
          Toca <b className="text-texto">Vigilar URL</b>, pega el enlace y toca <b className="text-texto">Probar</b>: la app busca el precio sola y te dice cuánto encontró.
        </li>
        <li>
          Si el precio es correcto, pon tu <b className="text-texto">precio objetivo</b> (opcional) y guarda. Te llega un aviso cuando baje a esa cantidad o menos.
        </li>
      </ol>
      <p className="mt-2 text-xs text-tenue">
        Si "Probar" no encuentra el precio, la tienda bloquea a los robots o lo muestra con JavaScript: prueba el mismo producto en otra tienda. Solo si sabes hacerlo, abre "Opciones
        avanzadas" y escribe el selector CSS del precio nuevo (no el tachado).
      </p>
    </Tarjeta>
  );
}

interface Prueba {
  precio: number;
  texto: string;
  metodo: string;
}

const VACIO_VIGILANTE = { nombre: "", url: "", selector: "", objetivo: "" };

/** "https://www.tienda.com/memoria-ram-ddr5-32gb/p/123" → "Memoria ram ddr5 32gb" */
function nombreDesdeUrl(url: string): string {
  try {
    const u = new URL(url);
    const parte = u.pathname.split("/").filter((p) => /[a-z]{3,}/i.test(p) && p.length > 6).sort((a, b) => b.length - a.length)[0];
    const texto = (parte ?? u.hostname).replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim().slice(0, 60);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  } catch {
    return "";
  }
}

function Precios() {
  const puede = usePuede("novedades", "escritura");
  const lista = useQuery({ queryKey: ["novedades", "vigilante"], queryFn: () => api<Vigilante[]>("/api/novedades/vigilante") });
  const [nuevo, setNuevo] = useState(false);
  const [d, setD] = useState(VACIO_VIGILANTE);
  const [objetivoDe, setObjetivoDe] = useState<{ id: string; nombre: string; valor: string } | null>(null);
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["novedades"] });
  const crear = useMutation({
    mutationFn: () =>
      api<Vigilante>("/api/novedades/vigilante", {
        metodo: "POST",
        cuerpo: { nombre: d.nombre, url: d.url, selector: d.selector, objetivo: d.objetivo ? Number(d.objetivo) : null },
      }),
    onSuccess: () => {
      setNuevo(false);
      setD(VACIO_VIGILANTE);
      refrescar();
    },
    onError: avisarError,
  });
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const probar = useMutation({
    mutationFn: () => api<Prueba>("/api/novedades/vigilante/probar", { cuerpo: { url: d.url.trim(), selector: d.selector } }),
    onMutate: () => setPrueba(null),
    onSuccess: (r) => {
      setPrueba(r);
      // Si no puso nombre, se sugiere uno a partir del enlace.
      if (!d.nombre.trim()) setD((v) => ({ ...v, nombre: nombreDesdeUrl(v.url) }));
    },
  });
  const revisar = useMutation({
    mutationFn: (id: string) => api(`/api/novedades/vigilante/${id}/revisar`, { metodo: "POST" }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  const objetivo = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: number | null }) => api(`/api/novedades/vigilante/${id}`, { metodo: "PATCH", cuerpo: { objetivo: valor } }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/novedades/vigilante/${id}`, { metodo: "DELETE" }),
    onSuccess: refrescar,
    onError: avisarError,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-tenue">Se revisa cada 3 horas y avisa por push cuando cambia el precio o llega a tu objetivo.</p>
        {puede ? (
          <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>
            Vigilar URL
          </Boton>
        ) : null}
      </div>
      <ComoFunciona />
      {lista.isLoading ? <Cargando /> : null}
      {lista.data?.length === 0 ? <Vacio texto="Agrega la página de una tienda y el selector CSS del precio." /> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {lista.data?.map((w) => (
          <Tarjeta
            key={w.id}
            titulo={w.nombre}
            acciones={
              puede ? (
                <>
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Target}
                    aria-label="Precio objetivo"
                    onClick={() => setObjetivoDe({ id: w.id, nombre: w.nombre, valor: w.objetivo?.toString() ?? "" })}
                  />
                  <Boton tamano="icono" variante="fantasma" icono={RefreshCw} aria-label="Revisar ahora" cargando={revisar.isPending && revisar.variables === w.id} onClick={() => revisar.mutate(w.id)} />
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Borrar"
                    onClick={async () => {
                      if (await confirmar({ titulo: "Dejar de vigilar", mensaje: w.nombre })) borrar.mutate(w.id);
                    }}
                  />
                </>
              ) : null
            }
          >
            <div className="flex flex-wrap items-baseline gap-3">
              <p className={cx("text-2xl font-bold", w.precio === null && "text-tenue")}>{w.precio === null ? "—" : w.precio.toLocaleString("es-MX")}</p>
              {w.objetivo !== null ? (
                <Insignia tono={w.precio !== null && w.precio <= w.objetivo ? "ok" : "aviso"}>
                  Objetivo: {w.objetivo.toLocaleString("es-MX")}
                  {w.precio !== null && w.precio <= w.objetivo ? " ✓" : ""}
                </Insignia>
              ) : null}
            </div>
            <p className="truncate text-xs text-tenue">
              {w.texto ? `"${w.texto}" · ` : ""}revisado {haceCuanto(w.revisado)}
            </p>
            {w.error ? <p className="mt-1 text-xs text-peligro">{w.error}</p> : null}
            <button type="button" className="mt-1 block max-w-full truncate text-xs text-tenue underline" onClick={() => abrirExterno(w.url)}>
              {w.url}
            </button>
            <Historial id={w.id} objetivo={w.objetivo} />
          </Tarjeta>
        ))}
      </div>
      <Modal abierto={objetivoDe !== null} titulo={`Precio objetivo · ${objetivoDe?.nombre ?? ""}`} alCerrar={() => setObjetivoDe(null)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!objetivoDe) return;
            const valor = objetivoDe.valor.trim() ? Number(objetivoDe.valor.replace(",", ".")) : null;
            if (valor !== null && !(valor > 0)) return avisar("Escribe un número mayor que 0", "error");
            objetivo.mutate({ id: objetivoDe.id, valor });
            setObjetivoDe(null);
          }}
        >
          <Entrada type="number" min={0} step="0.01" value={objetivoDe?.valor ?? ""} onChange={(e) => objetivoDe && setObjetivoDe({ ...objetivoDe, valor: e.target.value })} placeholder="Vacío = sin objetivo" autoFocus />
          <Boton type="submit" variante="primario">
            Guardar
          </Boton>
        </form>
      </Modal>
      <Modal abierto={nuevo} titulo="Vigilar precio" alCerrar={() => setNuevo(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <Campo etiqueta="Nombre">
            <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="RAM DDR5 32 GB" required />
          </Campo>
          <Campo etiqueta="Enlace del producto">
            <div className="flex gap-2">
              <Entrada
                type="url"
                value={d.url}
                onChange={(e) => {
                  setD({ ...d, url: e.target.value });
                  setPrueba(null);
                }}
                placeholder="Pega aquí el enlace de la tienda"
                required
              />
              <Boton icono={Search} cargando={probar.isPending} disabled={!d.url.trim()} onClick={() => probar.mutate()}>
                Probar
              </Boton>
            </div>
          </Campo>
          {prueba ? (
            <div className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm">
              <p>
                Precio encontrado: <b className="text-lg">{prueba.precio.toLocaleString("es-MX")}</b>
              </p>
              <p className="text-xs text-tenue">
                Leído: "{prueba.texto}" · {prueba.metodo}. Si no es el precio correcto (por ejemplo, es el tachado), usa las opciones avanzadas.
              </p>
            </div>
          ) : null}
          <ErrorCaja error={probar.error} />
          <details>
            <summary className="cursor-pointer text-xs text-tenue">Opciones avanzadas (selector CSS)</summary>
            <Campo etiqueta="Selector CSS del precio" ayuda='Vacío = automático. Si hay descuento, usa el del precio NUEVO. Ej.: ".precio-final", "#price".'>
              <Entrada
                value={d.selector}
                onChange={(e) => {
                  setD({ ...d, selector: e.target.value });
                  setPrueba(null);
                }}
                placeholder="Automático"
              />
            </Campo>
          </details>
          <Campo etiqueta="Precio objetivo (opcional)" ayuda="Te avisa cuando baje a este precio o menos.">
            <Entrada type="number" min={0} step="0.01" value={d.objetivo} onChange={(e) => setD({ ...d, objetivo: e.target.value })} placeholder="Ej. 1500" />
          </Campo>
          <ErrorCaja error={crear.error} />
          <Boton type="submit" variante="primario" cargando={crear.isPending}>
            Guardar y revisar
          </Boton>
        </form>
      </Modal>
    </div>
  );
}

const Noticias = lazy(() => import("./Noticias"));
const Cripto = lazy(() => import("./Cripto"));
const Inversiones = lazy(() => import("./Inversiones"));
const Divisas = lazy(() => import("./Divisas"));

type PestanaNovedades = "clima" | "noticias" | "compras" | "ofertas" | "gratis" | "steam" | "precios" | "cripto" | "inversiones" | "monedas";
const PESTANAS: readonly PestanaNovedades[] = ["clima", "noticias", "compras", "ofertas", "gratis", "steam", "precios", "cripto", "inversiones", "monedas"];

export default function Novedades() {
  // ?pestana=… permite llegar directo (p. ej. desde el buscador o las rutas viejas).
  const [params, setParams] = useSearchParams();
  const pedida = params.get("pestana") as PestanaNovedades | null;
  const [pestana, setPestanaEstado] = useState<PestanaNovedades>(pedida && PESTANAS.includes(pedida) ? pedida : "clima");
  const setPestana = (p: PestanaNovedades) => {
    setPestanaEstado(p);
    setParams(p === "clima" ? {} : { pestana: p }, { replace: true });
  };
  const verNoticias = usePuede("noticias");
  const verCripto = usePuede("cripto");
  const verInversiones = usePuede("inversiones");
  const verDivisas = usePuede("divisas");
  const opciones: { id: PestanaNovedades; texto: string }[] = [
    { id: "clima", texto: "Clima" },
    ...(verNoticias ? [{ id: "noticias" as const, texto: "Noticias" }] : []),
    { id: "compras", texto: "Compras" },
    { id: "ofertas", texto: "Ofertas de juegos" },
    { id: "gratis", texto: "Juegos gratis" },
    { id: "steam", texto: "Steam" },
    { id: "precios", texto: "Vigilar precios" },
    ...(verCripto ? [{ id: "cripto" as const, texto: "Cripto" }] : []),
    ...(verInversiones ? [{ id: "inversiones" as const, texto: "Inversiones" }] : []),
    ...(verDivisas ? [{ id: "monedas" as const, texto: "Cambio de monedas" }] : []),
  ];
  return (
    <div className="space-y-4">
      <Encabezado titulo="Novedades" descripcion="Clima, noticias, compras, juegos, precios, cripto, inversiones y monedas en un solo lugar." />
      <Pestanas valor={pestana} alCambiar={setPestana} opciones={opciones} />
      <Suspense fallback={<Cargando />}>
        {pestana === "clima" ? <Clima /> : null}
        {pestana === "noticias" ? <Noticias /> : null}
        {pestana === "compras" ? <Compras /> : null}
        {pestana === "ofertas" ? <Ofertas /> : null}
        {pestana === "gratis" ? <JuegosGratis /> : null}
        {pestana === "steam" ? <Steam /> : null}
        {pestana === "precios" ? <Precios /> : null}
        {pestana === "cripto" ? <Cripto /> : null}
        {pestana === "inversiones" ? <Inversiones /> : null}
        {pestana === "monedas" ? <Divisas /> : null}
      </Suspense>
    </div>
  );
}
