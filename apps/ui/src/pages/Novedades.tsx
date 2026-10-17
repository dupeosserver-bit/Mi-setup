/** Novedades: clima (Open-Meteo), ofertas de juegos (CheapShark) y vigilante de precios de RAM. */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  ExternalLink,
  MapPin,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Pestanas, Selector, Tarjeta, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtFecha, fmtFechaHora, haceCuanto } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";

// ---------------------------------------------------------------- clima

interface Ubicacion {
  nombre: string;
  lat: number;
  lon: number;
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
  const clima = useQuery({
    queryKey: ["novedades", "clima", u?.lat, u?.lon],
    queryFn: () => api<Pronostico>(`/api/novedades/clima?lat=${u!.lat}&lon=${u!.lon}`),
    enabled: Boolean(u),
    refetchInterval: 15 * 60_000,
  });

  const actual = clima.data ? tiempo(clima.data.current.weather_code, clima.data.current.is_day === 1) : null;
  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(buscar.trim());
        }}
      >
        <Entrada value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={u ? `Cambiar ciudad (${u.nombre})` : "Busca tu ciudad…"} />
        <Boton type="submit" icono={MapPin}>
          Buscar
        </Boton>
      </form>
      {ciudades.data?.length ? (
        <div className="flex flex-wrap gap-2">
          {ciudades.data.map((c) => (
            <Boton key={`${c.lat},${c.lon}`} tamano="sm" onClick={() => guardar.mutate(c)}>
              {c.nombre}
            </Boton>
          ))}
        </div>
      ) : null}
      {!u && !ubicacion.isLoading ? <Vacio icono={MapPin} texto="Elige tu ciudad para ver el clima." /> : null}
      <ErrorCaja error={clima.error} />
      {clima.data && actual && u ? (
        <>
          <Tarjeta titulo={u.nombre}>
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
          <p className="text-xs text-tenue">Datos de Open-Meteo.</p>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- ofertas

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

function Ofertas() {
  const [tienda, setTienda] = useState("");
  const [precioMax, setPrecioMax] = useState("15");
  const tiendas = useQuery({ queryKey: ["novedades", "tiendas"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/novedades/tiendas") });
  const ofertas = useQuery({
    queryKey: ["novedades", "ofertas", tienda, precioMax],
    queryFn: () => api<Oferta[]>(`/api/novedades/ofertas?precioMax=${precioMax}${tienda ? `&tienda=${tienda}` : ""}`),
  });
  const nombreTienda = new Map((tiendas.data ?? []).map((t) => [t.id, t.nombre]));
  return (
    <div className="space-y-4">
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
      <p className="text-xs text-tenue">Ofertas de CheapShark (precios en USD).</p>
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
  texto: string | null;
  revisado: string | null;
  error: string | null;
}

function Historial({ id }: { id: string }) {
  const h = useQuery({ queryKey: ["novedades", "historial", id], queryFn: () => api<{ precio: number; fecha: string }[]>(`/api/novedades/vigilante/${id}/historial`) });
  if (!h.data || h.data.length < 2) return null;
  return (
    <div className="mt-3 h-32">
      <ResponsiveContainer>
        <LineChart data={h.data.map((p) => ({ ...p, t: new Date(p.fecha).getTime() }))}>
          <CartesianGrid stroke="#3a3a3c" strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => fmtFecha(v)} stroke="#8e8e93" fontSize={11} />
          <YAxis stroke="#8e8e93" fontSize={11} width={50} domain={["auto", "auto"]} />
          <Tooltip labelFormatter={(v) => fmtFechaHora(Number(v))} contentStyle={{ background: "#2c2c2e", border: "1px solid #3a3a3c", borderRadius: 12 }} />
          <Line type="stepAfter" dataKey="precio" stroke="#30D158" dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Precios() {
  const puede = usePuede("novedades", "escritura");
  const lista = useQuery({ queryKey: ["novedades", "vigilante"], queryFn: () => api<Vigilante[]>("/api/novedades/vigilante") });
  const [nuevo, setNuevo] = useState(false);
  const [d, setD] = useState({ nombre: "", url: "", selector: "" });
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["novedades"] });
  const crear = useMutation({
    mutationFn: () => api<Vigilante>("/api/novedades/vigilante", { metodo: "POST", cuerpo: d }),
    onSuccess: () => {
      setNuevo(false);
      setD({ nombre: "", url: "", selector: "" });
      refrescar();
    },
    onError: avisarError,
  });
  const revisar = useMutation({
    mutationFn: (id: string) => api(`/api/novedades/vigilante/${id}/revisar`, { metodo: "POST" }),
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
        <p className="text-sm text-tenue">Se revisa cada 3 horas y avisa por push cuando cambia el precio.</p>
        {puede ? (
          <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>
            Vigilar URL
          </Boton>
        ) : null}
      </div>
      {lista.isLoading ? <Cargando /> : null}
      {lista.data?.length === 0 ? <Vacio texto="Agrega la página de una tienda y el selector CSS del precio." /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {lista.data?.map((w) => (
          <Tarjeta
            key={w.id}
            titulo={w.nombre}
            acciones={
              puede ? (
                <>
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
            <p className={cx("text-2xl font-bold", w.precio === null && "text-tenue")}>{w.precio === null ? "—" : w.precio.toLocaleString("es-MX")}</p>
            <p className="truncate text-xs text-tenue">
              {w.texto ? `"${w.texto}" · ` : ""}revisado {haceCuanto(w.revisado)}
            </p>
            {w.error ? <p className="mt-1 text-xs text-peligro">{w.error}</p> : null}
            <button type="button" className="mt-1 block max-w-full truncate text-xs text-tenue underline" onClick={() => abrirExterno(w.url)}>
              {w.url}
            </button>
            <Historial id={w.id} />
          </Tarjeta>
        ))}
      </div>
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
          <Campo etiqueta="URL de la tienda">
            <Entrada type="url" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://…" required />
          </Campo>
          <Campo etiqueta="Selector CSS del precio" ayuda='En la página, clic derecho en el precio → Inspeccionar → copia su clase, p. ej. ".price" o meta[itemprop="price"].'>
            <Entrada value={d.selector} onChange={(e) => setD({ ...d, selector: e.target.value })} placeholder=".product-price" required />
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

export default function Novedades() {
  const [pestana, setPestana] = useState<"clima" | "ofertas" | "precios">("clima");
  return (
    <div className="space-y-4">
      <Encabezado titulo="Novedades" descripcion="Clima, ofertas de videojuegos y vigilante de precios." />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "clima", texto: "Clima" },
          { id: "ofertas", texto: "Ofertas de juegos" },
          { id: "precios", texto: "Precios (RAM)" },
        ]}
      />
      {pestana === "clima" ? <Clima /> : pestana === "ofertas" ? <Ofertas /> : <Precios />}
    </div>
  );
}
