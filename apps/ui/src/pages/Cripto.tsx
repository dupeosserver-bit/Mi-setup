/** Cripto: precios en vivo (CoinGecko) de tu lista de monedas. Solo datos, no es asesoría financiera. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { useState } from "react";
import { MiniGrafica, Cambio } from "../components/MiniGrafica";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Selector, Tarjeta, Vacio, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";

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

export default function Cripto() {
  const [moneda, setMoneda] = useState<"mxn" | "usd" | "eur">("mxn");
  const [buscar, setBuscar] = useState("");
  const [q, setQ] = useState("");
  const lista = useQuery({ queryKey: ["cripto", moneda], queryFn: () => api<Moneda[]>(`/api/cripto?moneda=${moneda}`), refetchInterval: 2 * 60_000 });
  const resultados = useQuery({ queryKey: ["cripto", "buscar", q], queryFn: () => api<Resultado[]>(`/api/cripto/buscar?q=${encodeURIComponent(q)}`), enabled: q.length > 0 });
  const guardar = useMutation({
    mutationFn: (ids: string[]) => api("/api/cripto/lista", { metodo: "PUT", cuerpo: { ids } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cripto"] }),
    onError: avisarError,
  });
  const ids = (lista.data ?? []).map((m) => m.id);
  const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda.toUpperCase(), maximumFractionDigits: 6 });
  const fmtCorto = new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda.toUpperCase(), notation: "compact" });

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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lista.data?.map((m) => (
          <div key={m.id} className="rounded-tarjeta border border-borde bg-superficie p-4">
            <div className="flex items-center gap-3">
              <img src={m.imagen} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.nombre}</p>
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
      <p className="text-xs text-tenue">Datos de CoinGecko (gráfica de 7 días).</p>
    </div>
  );
}
