/** Inversiones: precio de acciones, ETF e índices (Yahoo Finance, con retraso). Solo datos, no es asesoría financiera. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { MiniGrafica, Cambio } from "../components/MiniGrafica";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Tarjeta, Vacio, avisarError } from "../components/ui";
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
