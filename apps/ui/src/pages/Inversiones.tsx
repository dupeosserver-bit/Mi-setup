/** Inversiones: precio de acciones, ETF e índices (Yahoo Finance, con retraso). Solo datos, no es asesoría financiera. */
import { Paginas } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { MiniGrafica, Cambio } from "../components/MiniGrafica";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Selector, Tarjeta, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { fmtFecha } from "../lib/formato";

interface Cotizacion {
  simbolo: string;
  nombre: string;
  precio: number | null;
  cambio: number | null;
  moneda: string | null;
  fecha: string | null;
  serie: number[];
  error?: string;
}

const EJEMPLOS: [string, string][] = [
  ["AAPL", "Apple"],
  ["NVDA", "NVIDIA"],
  ["AMZN", "Amazon"],
  ["GOOGL", "Google"],
  ["SPY", "ETF S&P 500"],
  ["^GSPC", "Índice S&P 500"],
  ["^MXX", "IPC México"],
  ["AMXB.MX", "América Móvil"],
  ["BTC-USD", "Bitcoin (USD)"],
];

interface Accion {
  simbolo: string;
  nombre: string;
  precio: number | null;
  cambio: number | null;
  moneda: string | null;
  capitalizacion: number | null;
  analistas: { valor: number; texto: string } | null;
  minimo52: number | null;
  maximo52: number | null;
}

const LISTAS_ACCIONES = [
  { id: "most_actives", texto: "Más negociadas" },
  { id: "day_gainers", texto: "Suben hoy" },
  { id: "day_losers", texto: "Bajan hoy" },
  { id: "undervalued_large_caps", texto: "Grandes y baratas" },
  { id: "growth_technology_stocks", texto: "Tecnología en crecimiento" },
  { id: "undervalued_growth_stocks", texto: "Crecimiento a buen precio" },
] as const;

/** Calificación promedio de analistas: 1 = compra fuerte … 5 = venta fuerte. */
function Analistas({ a }: { a: Accion["analistas"] }) {
  if (!a) return <span className="text-xs text-tenue">—</span>;
  const tono = a.valor <= 2 ? "ok" : a.valor <= 3 ? "neutro" : "peligro";
  const texto = a.valor <= 1.5 ? "Compra fuerte" : a.valor <= 2.5 ? "Compra" : a.valor <= 3.5 ? "Mantener" : a.valor <= 4.5 ? "Venta" : "Venta fuerte";
  return (
    <Insignia tono={tono}>
      {texto} ({a.valor.toFixed(1)})
    </Insignia>
  );
}

/** Explorar acciones por listas y páginas, con la opinión promedio de los analistas. */
function ExplorarAcciones({ mios, alAgregar }: { mios: string[]; alAgregar: (s: string) => void }) {
  const [lista, setLista] = useState<(typeof LISTAS_ACCIONES)[number]["id"]>("most_actives");
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<"lista" | "analistas">("lista");
  const q = useQuery({
    queryKey: ["inversiones", "explorar", lista, pagina],
    queryFn: () => api<{ total: number; acciones: Accion[] }>(`/api/inversiones/explorar?lista=${lista}&pagina=${pagina}`),
  });
  const acciones = [...(q.data?.acciones ?? [])].sort((a, b) => (orden === "analistas" ? (a.analistas?.valor ?? 9) - (b.analistas?.valor ?? 9) : 0));
  const paginas = Math.max(1, Math.ceil((q.data?.total ?? 0) / 25));
  return (
    <Tarjeta titulo="Explorar acciones">
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {LISTAS_ACCIONES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => (setLista(l.id), setPagina(1))}
            className={cx("whitespace-nowrap rounded-full border px-3 py-1 text-xs", lista === l.id ? "border-acento bg-acento text-black" : "border-borde hover:bg-tarjeta")}
          >
            {l.texto}
          </button>
        ))}
        <Selector className="ml-auto h-8 w-auto text-xs" value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
          <option value="lista">Orden de la lista</option>
          <option value="analistas">Mejor calificadas por analistas</option>
        </Selector>
      </div>
      {q.isLoading ? <Cargando /> : null}
      <ErrorCaja error={q.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-tenue">
            <tr>
              <th className="py-1">Empresa</th>
              <th className="text-right">Precio</th>
              <th className="text-right">Hoy</th>
              <th className="text-right">Rango 52 sem.</th>
              <th>Analistas</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {acciones.map((a) => (
              <tr key={a.simbolo} className="border-t border-borde">
                <td className="py-1.5">
                  <span className="block truncate">{a.nombre}</span>
                  <span className="text-xs text-tenue">{a.simbolo}</span>
                </td>
                <td className="text-right">{a.precio !== null ? `${a.precio.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${a.moneda ?? ""}` : "—"}</td>
                <td className="text-right">
                  <Cambio valor={a.cambio} />
                </td>
                <td className="text-right text-xs text-tenue">{a.minimo52 !== null && a.maximo52 !== null ? `${a.minimo52.toFixed(0)}–${a.maximo52.toFixed(0)}` : "—"}</td>
                <td>
                  <Analistas a={a.analistas} />
                </td>
                <td className="text-right">
                  {mios.includes(a.simbolo) ? (
                    <span className="text-xs text-tenue">En tu lista</span>
                  ) : (
                    <Boton tamano="icono" variante="fantasma" icono={Plus} aria-label={`Agregar ${a.simbolo}`} onClick={() => alAgregar(a.simbolo)} />
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
        «Analistas» es el promedio de lo que opinan analistas de bancos y casas de bolsa (Yahoo Finanzas): es una opinión, no una garantía, y no es asesoría financiera. Antes de invertir, infórmate y no metas dinero que necesites.
      </p>
    </Tarjeta>
  );
}

export default function Inversiones() {
  const [nuevo, setNuevo] = useState("");
  const lista = useQuery({ queryKey: ["inversiones"], queryFn: () => api<Cotizacion[]>("/api/inversiones") });
  const guardar = useMutation({
    mutationFn: (simbolos: string[]) => api("/api/inversiones/lista", { metodo: "PUT", cuerpo: { simbolos } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["inversiones"] }),
    onError: avisarError,
  });
  const simbolos = (lista.data ?? []).map((c) => c.simbolo);
  const agregar = (s: string) => {
    const limpio = s.trim().toUpperCase();
    if (limpio && !simbolos.includes(limpio)) guardar.mutate([...simbolos, limpio]);
    setNuevo("");
  };
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Inversiones"
        descripcion="Precio y cambio contra el cierre anterior de lo que sigues (con unos minutos de retraso). Solo informativo: no es asesoría financiera."
        acciones={
          <Boton icono={RefreshCw} cargando={lista.isFetching} onClick={() => void lista.refetch()}>
            Actualizar
          </Boton>
        }
      />
      <ExplorarAcciones mios={simbolos} alAgregar={agregar} />
      <Tarjeta titulo="Agregar acción, ETF o índice">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            agregar(nuevo);
          }}
        >
          <Entrada value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Símbolo, ej. MSFT" />
          <Boton type="submit" icono={Plus}>
            Agregar
          </Boton>
        </form>
        <div className="mt-2 flex flex-wrap gap-1">
          {EJEMPLOS.map(([s, n]) => (
            <Boton key={s} tamano="sm" variante="fantasma" disabled={simbolos.includes(s)} onClick={() => agregar(s)}>
              {n}
            </Boton>
          ))}
        </div>
        <p className="mt-2 text-xs text-tenue">Usa el símbolo de Yahoo Finance: acciones de EE. UU. tal cual (AAPL), México con ".MX" (WALMEX.MX), índices con "^" (^GSPC, ^MXX).</p>
      </Tarjeta>
      {lista.isLoading ? <Cargando /> : null}
      <ErrorCaja error={lista.error} />
      {lista.data?.length === 0 ? <Vacio texto="Agrega símbolos para seguirlos." /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lista.data?.map((c) => (
          <div key={c.simbolo} className="rounded-tarjeta border border-borde bg-superficie p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{c.nombre}</p>
              <button type="button" aria-label={`Quitar ${c.nombre}`} className="text-tenue hover:text-texto" onClick={() => guardar.mutate(simbolos.filter((x) => x !== c.simbolo))}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {c.error ? (
              <p className="mt-2 text-xs text-peligro">{c.error}</p>
            ) : (
              <>
                <p className="mt-2 text-xl font-bold">
                  {c.precio?.toLocaleString("es-MX", { maximumFractionDigits: 2 }) ?? "—"} <span className="text-sm font-normal text-tenue">{c.moneda}</span>
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <Cambio valor={c.cambio} etiqueta="vs. día anterior" />
                </div>
                <MiniGrafica serie={c.serie} />
                <p className="text-xs text-tenue">Dato del {c.fecha ? fmtFecha(c.fecha) : "—"} · último mes</p>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-tenue">Datos de Yahoo Finance (con retraso).</p>
    </div>
  );
}
