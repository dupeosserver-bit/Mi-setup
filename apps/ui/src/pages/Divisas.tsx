/** Cambio de monedas: convertidor y tipos de cambio del día con gráfica de 30 días (Banco Central Europeo). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import { useState } from "react";
import { MiniGrafica, Cambio } from "../components/MiniGrafica";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Selector, Tarjeta, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { fmtFecha } from "../lib/formato";

interface Datos {
  base: string;
  destinos: string[];
  fecha: string | null;
  tasas: Record<string, number>;
  historial: Record<string, { fecha: string; valor: number }[]>;
}

function Convertidor({ monedas }: { monedas: Record<string, string> }) {
  const [cantidad, setCantidad] = useState("100");
  const [de, setDe] = useState("USD");
  const [a, setA] = useState("MXN");
  const n = Number(cantidad.replace(",", "."));
  const conv = useQuery({
    queryKey: ["divisas", "convertir", de, a, n],
    queryFn: () => api<{ resultado: number; tasa: number; fecha: string | null }>(`/api/divisas/convertir?de=${de}&a=${a}&cantidad=${n}`),
    enabled: n > 0,
  });
  const opciones = Object.entries(monedas).map(([c, nombre]) => (
    <option key={c} value={c}>
      {c} · {nombre}
    </option>
  ));
  return (
    <Tarjeta titulo="Convertidor" icono={ArrowLeftRight}>
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_1fr]">
        <Campo etiqueta="Cantidad">
          <Entrada type="number" min={0} step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </Campo>
        <Campo etiqueta="De">
          <Selector value={de} onChange={(e) => setDe(e.target.value)}>
            {opciones}
          </Selector>
        </Campo>
        <Boton
          tamano="icono"
          icono={ArrowLeftRight}
          aria-label="Invertir"
          onClick={() => {
            setDe(a);
            setA(de);
          }}
        />
        <Campo etiqueta="A">
          <Selector value={a} onChange={(e) => setA(e.target.value)}>
            {opciones}
          </Selector>
        </Campo>
      </div>
      {conv.data ? (
        <p className="mt-4 text-2xl font-bold">
          {n.toLocaleString("es-MX")} {de} = {conv.data.resultado.toLocaleString("es-MX", { maximumFractionDigits: 4 })} {a}
          <span className="ml-2 text-sm font-normal text-tenue">
            1 {de} = {conv.data.tasa.toLocaleString("es-MX", { maximumFractionDigits: 6 })} {a}
          </span>
        </p>
      ) : null}
      <ErrorCaja error={conv.error} />
    </Tarjeta>
  );
}

export default function Divisas() {
  const monedas = useQuery({ queryKey: ["divisas", "monedas"], queryFn: () => api<Record<string, string>>("/api/divisas/monedas"), staleTime: Infinity });
  const datos = useQuery({ queryKey: ["divisas", "lista"], queryFn: () => api<Datos>("/api/divisas") });
  const [agregar, setAgregar] = useState("EUR");
  const guardar = useMutation({
    mutationFn: (d: { base: string; destinos: string[] }) => api("/api/divisas/lista", { metodo: "PUT", cuerpo: d }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["divisas", "lista"] }),
    onError: avisarError,
  });
  const d = datos.data;
  return (
    <div className="space-y-4">
      <Encabezado titulo="Cambio de monedas" descripcion="Tipos de cambio oficiales del día (Banco Central Europeo); se actualizan cada día hábil." />
      {monedas.data ? <Convertidor monedas={monedas.data} /> : null}
      {datos.isLoading ? <Cargando /> : null}
      <ErrorCaja error={datos.error} />
      {d ? (
        <Tarjeta
          titulo={`1 ${d.base} equivale a…`}
          acciones={
            <div className="flex flex-wrap items-center gap-2">
              <Selector className="h-8 w-28" value={d.base} onChange={(e) => guardar.mutate({ base: e.target.value, destinos: d.destinos })}>
                {Object.keys(monedas.data ?? {}).map((c) => (
                  <option key={c} value={c}>
                    Base {c}
                  </option>
                ))}
              </Selector>
              <Selector className="h-8 w-24" value={agregar} onChange={(e) => setAgregar(e.target.value)}>
                {Object.keys(monedas.data ?? {}).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Selector>
              <Boton tamano="sm" icono={Plus} disabled={d.destinos.includes(agregar) || agregar === d.base} onClick={() => guardar.mutate({ base: d.base, destinos: [...d.destinos, agregar] })}>
                Agregar
              </Boton>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.destinos.map((m) => {
              const serie = (d.historial[m] ?? []).map((p) => p.valor);
              const inicio = serie[0];
              const hoy = d.tasas[m];
              return (
                <div key={m} className="rounded-xl bg-fondo p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {m} <span className="text-xs text-tenue">{monedas.data?.[m]}</span>
                    </span>
                    <button type="button" aria-label={`Quitar ${m}`} className="text-tenue hover:text-texto" onClick={() => guardar.mutate({ base: d.base, destinos: d.destinos.filter((x) => x !== m) })}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xl font-bold">{hoy?.toLocaleString("es-MX", { maximumFractionDigits: 4 }) ?? "—"}</p>
                  <Cambio valor={inicio && hoy ? ((hoy - inicio) / inicio) * 100 : null} etiqueta="en 30 días" />
                  <MiniGrafica serie={serie} />
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-tenue">Fecha del dato: {d.fecha ? fmtFecha(`${d.fecha}T12:00:00`) : "—"}. Las casas de cambio y bancos cobran un margen sobre este valor.</p>
        </Tarjeta>
      ) : null}
    </div>
  );
}
