/** Cripto: precios en vivo (CoinGecko) de tu lista de monedas. Solo datos, no es asesoría financiera. */
import { FichaCripto } from "../components/FichaMercado";
import { Paginas } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { useState } from "react";
import { MiniGrafica, Cambio } from "../components/MiniGrafica";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Selector, Tarjeta, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { localeActual } from "../lib/idioma";

interface Moneda {
  id: string;
  simbolo: string;
  nombre: string;
  imagen: string;
  precio: number;
  capitalizacion: number;
  cambio24h: number | null;
  cambio7d: number | null;
  serie: number[];
}
interface Resultado {
  id: string;
  nombre: string;
  simbolo: string;
  imagen: string;
  rango: number | null;
}

interface MonedaMercado {
  id: string;
  simbolo: string;
  nombre: string;
  imagen: string;
  rango: number | null;
  precio: number;
  capitalizacion: number;
  volumen: number;
  cambio24h: number | null;
  cambio7d: number | null;
  desdeMaximo: number | null;
}

const ORDENES_CRIPTO = [
  { id: "capitalizacion", texto: "Más grandes" },
  { id: "volumen", texto: "Más movidas" },
  { id: "suben", texto: "Suben hoy" },
  { id: "bajan", texto: "Bajan hoy" },
  { id: "tendencia", texto: "En tendencia" },
] as const;

/** Explorar todo el mercado por páginas, con datos para comparar (no son recomendaciones). */
function ExplorarCripto({ moneda, misIds, alAgregar, alAbrir }: { moneda: "mxn" | "usd" | "eur"; misIds: string[]; alAgregar: (id: string) => void; alAbrir: (id: string) => void }) {
  const [orden, setOrden] = useState<(typeof ORDENES_CRIPTO)[number]["id"]>("capitalizacion");
  const [pagina, setPagina] = useState(1);
  const q = useQuery({
    queryKey: ["cripto", "mercado", moneda, orden, pagina],
    queryFn: () => api<{ total: number; monedas: MonedaMercado[] }>(`/api/cripto/mercado?moneda=${moneda}&orden=${orden}&pagina=${pagina}`),
  });
  const fmt = new Intl.NumberFormat(localeActual(), { style: "currency", currency: moneda.toUpperCase(), maximumFractionDigits: 6 });
  const fmtCorto = new Intl.NumberFormat(localeActual(), { style: "currency", currency: moneda.toUpperCase(), notation: "compact" });
  const paginas = Math.max(1, Math.ceil((q.data?.total ?? 0) / 25));
  return (
    <Tarjeta titulo="Explorar el mercado">
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {ORDENES_CRIPTO.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => (setOrden(o.id), setPagina(1))}
            className={cx("whitespace-nowrap rounded-full border px-3 py-1 text-xs", orden === o.id ? "border-acento bg-acento text-black" : "border-borde hover:bg-tarjeta")}
          >
            {o.texto}
          </button>
        ))}
      </div>
      {q.isLoading ? <Cargando /> : null}
      <ErrorCaja error={q.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-tenue">
            <tr>
              <th className="py-1">#</th>
              <th>Moneda</th>
              <th className="text-right">Precio</th>
              <th className="text-right">24 h</th>
              <th className="text-right">7 días</th>
              <th className="text-right">Capitalización</th>
              <th className="text-right" title="Qué tan lejos está de su precio más alto">Desde su máximo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data?.monedas.map((m) => (
              <tr key={m.id} className="border-t border-borde">
                <td className="py-1.5 text-xs text-tenue">{m.rango ?? "—"}</td>
                <td>
                  <button type="button" className="flex items-center gap-2 text-left hover:underline" onClick={() => alAbrir(m.id)} title="Ver estadísticas y gráficas">
                    <img src={m.imagen} alt="" className="h-5 w-5 rounded-full" loading="lazy" />
                    <span className="truncate">{m.nombre}</span> <span className="text-xs text-tenue">{m.simbolo}</span>
                  </button>
                </td>
                <td className="text-right">{fmt.format(m.precio)}</td>
                <td className="text-right">
                  <Cambio valor={m.cambio24h} />
                </td>
                <td className="text-right">
                  <Cambio valor={m.cambio7d} />
                </td>
                <td className="text-right text-xs">{fmtCorto.format(m.capitalizacion)}</td>
                <td className="text-right text-xs">{m.desdeMaximo !== null ? `${Math.round(m.desdeMaximo)} %` : "—"}</td>
                <td className="text-right">
                  {misIds.includes(m.id) ? (
                    <span className="text-xs text-tenue">En tu lista</span>
                  ) : (
                    <Boton tamano="icono" variante="fantasma" icono={Plus} aria-label={`Agregar ${m.nombre}`} onClick={() => alAgregar(m.id)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Paginas pagina={pagina} total={paginas} alCambiar={setPagina} />
      </div>
      <p className="mt-2 text-xs text-tenue">
        Para comparar: las más grandes suelen ser menos arriesgadas y las que más suben también pueden caer igual de rápido. Esto son datos, no una recomendación: nadie sabe qué subirá. Invierte solo lo que puedas perder.
      </p>
    </Tarjeta>
  );
}

export default function Cripto() {
  const [moneda, setMoneda] = useState<"mxn" | "usd" | "eur">("mxn");
  const [buscar, setBuscar] = useState("");
  const [q, setQ] = useState("");
  const [ficha, setFicha] = useState<string | null>(null);
  const lista = useQuery({ queryKey: ["cripto", moneda], queryFn: () => api<Moneda[]>(`/api/cripto?moneda=${moneda}`), refetchInterval: 2 * 60_000 });
  const resultados = useQuery({ queryKey: ["cripto", "buscar", q], queryFn: () => api<Resultado[]>(`/api/cripto/buscar?q=${encodeURIComponent(q)}`), enabled: q.length > 0 });
  const guardar = useMutation({
    mutationFn: (ids: string[]) => api("/api/cripto/lista", { metodo: "PUT", cuerpo: { ids } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cripto"] }),
    onError: avisarError,
  });
  const ids = (lista.data ?? []).map((m) => m.id);
  const fmt = new Intl.NumberFormat(localeActual(), { style: "currency", currency: moneda.toUpperCase(), maximumFractionDigits: 6 });
  const fmtCorto = new Intl.NumberFormat(localeActual(), { style: "currency", currency: moneda.toUpperCase(), notation: "compact" });

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Cripto"
        descripcion="Precios de tus criptomonedas (se actualizan cada 2 minutos). Solo informativo: no es asesoría financiera."
        acciones={
          <>
            <Selector value={moneda} onChange={(e) => setMoneda(e.target.value as typeof moneda)} className="w-28">
              <option value="mxn">MXN</option>
              <option value="usd">USD</option>
              <option value="eur">EUR</option>
            </Selector>
            <Boton icono={RefreshCw} cargando={lista.isFetching} onClick={() => void lista.refetch()}>
              Actualizar
            </Boton>
          </>
        }
      />
      <ExplorarCripto moneda={moneda} misIds={ids} alAgregar={(id) => guardar.mutate([...ids, id])} alAbrir={setFicha} />
      <Tarjeta titulo="Agregar moneda" icono={Search}>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(buscar.trim());
          }}
        >
          <Entrada value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Ej. cardano, pepe, bnb" />
          <Boton type="submit" icono={Search}>
            Buscar
          </Boton>
        </form>
        {resultados.data?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {resultados.data.map((r) => (
              <Boton
                key={r.id}
                tamano="sm"
                icono={Plus}
                disabled={ids.includes(r.id)}
                onClick={() => {
                  guardar.mutate([...ids, r.id]);
                  setQ("");
                  setBuscar("");
                }}
              >
                {r.nombre} ({r.simbolo})
              </Boton>
            ))}
          </div>
        ) : null}
      </Tarjeta>
      {lista.isLoading ? <Cargando /> : null}
      <ErrorCaja error={lista.error} />
      {lista.data?.length === 0 ? <Vacio texto="Agrega monedas para seguirlas." /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lista.data?.map((m) => (
          <div key={m.id} className="rounded-tarjeta border border-borde bg-superficie p-4">
            <div className="flex items-center gap-3">
              <img src={m.imagen} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
              <div className="min-w-0 flex-1">
                <button type="button" className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => setFicha(m.id)}>
                  {m.nombre}
                </button>
                <p className="text-xs text-tenue">
                  {m.simbolo} · Cap. {fmtCorto.format(m.capitalizacion)}
                </p>
              </div>
              <button type="button" aria-label={`Quitar ${m.nombre}`} className="text-tenue hover:text-texto" onClick={() => guardar.mutate(ids.filter((x) => x !== m.id))}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-xl font-bold">{fmt.format(m.precio)}</p>
            <div className="flex gap-3 text-sm">
              <Cambio valor={m.cambio24h} etiqueta="24 h" />
              <Cambio valor={m.cambio7d} etiqueta="7 días" />
            </div>
            <MiniGrafica serie={m.serie} />
          </div>
        ))}
      </div>
      <p className="text-xs text-tenue">Datos de CoinGecko (gráfica de 7 días). Toca una moneda para ver sus estadísticas y gráficas.</p>
      {ficha ? <FichaCripto id={ficha} moneda={moneda} alCerrar={() => setFicha(null)} /> : null}
    </div>
  );
}
