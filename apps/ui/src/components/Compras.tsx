/** Compras: busca un producto en Mercado Libre (dentro de la app) y en las demás tiendas con un toque. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellPlus, ExternalLink, Search, ShoppingBag, Truck } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";
import { Boton, Cargando, Entrada, ErrorCaja, Insignia, Selector, Tarjeta, Vacio, avisar, avisarError } from "./ui";

interface Resultado {
  id: string;
  titulo: string;
  precio: number;
  precioAntes: number | null;
  moneda: string;
  imagen: string;
  url: string;
  envioGratis: boolean;
  usado: boolean;
}
interface Respuesta {
  tiendas: { id: string; nombre: string; url: string }[];
  mercadoLibre: { configurado: boolean; resultados: Resultado[] };
}

const dinero = (n: number, moneda: string) => n.toLocaleString("es-MX", { style: "currency", currency: moneda || "MXN", maximumFractionDigits: 0 });

export function Compras() {
  const puedeVigilar = usePuede("novedades", "escritura");
  const [texto, setTexto] = useState("");
  const [buscado, setBuscado] = useState("");
  const [orden, setOrden] = useState<"relevancia" | "menor" | "mayor">("relevancia");
  const q = useQuery({
    queryKey: ["compras", buscado, orden],
    queryFn: () => api<Respuesta>(`/api/compras/buscar?q=${encodeURIComponent(buscado)}&orden=${orden}`),
    enabled: buscado.length >= 2,
    staleTime: 5 * 60_000,
  });
  const vigilar = useMutation({
    mutationFn: (r: Resultado) => api("/api/novedades/vigilante", { cuerpo: { nombre: r.titulo.slice(0, 100), url: r.url, selector: "" } }),
    onSuccess: () => {
      avisar("Listo: te aviso cuando cambie el precio (pestaña Precios)");
      void queryClient.invalidateQueries({ queryKey: ["novedades", "vigilante"] });
    },
    onError: avisarError,
  });
  const d = q.data;

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Buscar en tiendas" icono={ShoppingBag}>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBuscado(texto.trim());
          }}
        >
          <Entrada className="min-w-0 flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué buscas? Ej. memoria RAM 32GB DDR5" />
          <Selector className="w-auto" value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
            <option value="relevancia">Más relevantes</option>
            <option value="menor">Menor precio</option>
            <option value="mayor">Mayor precio</option>
          </Selector>
          <Boton type="submit" variante="primario" icono={Search} disabled={texto.trim().length < 2}>
            Buscar
          </Boton>
        </form>
        {d ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {d.tiendas.map((t) => (
              <Boton key={t.id} tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(t.url)}>
                {t.nombre}
              </Boton>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-xs text-tenue">Mercado Libre se ve aquí mismo; las demás tiendas se abren con tu búsqueda (no tienen una forma pública de consultarlas).</p>
      </Tarjeta>

      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando texto="Buscando…" /> : null}
      {d && !d.mercadoLibre.configurado ? (
        <Vacio
          icono={ShoppingBag}
          texto="Para ver los productos de Mercado Libre aquí, crea una app gratis en developers.mercadolibre.com.mx y pon su App ID y clave en Ajustes → Servicios y claves. Mientras, usa los botones de arriba."
        />
      ) : null}
      {d?.mercadoLibre.configurado && !d.mercadoLibre.resultados.length ? <Vacio texto="Mercado Libre no encontró nada con eso." /> : null}
      {d?.mercadoLibre.resultados.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {d.mercadoLibre.resultados.map((r) => (
            <div key={r.id} className="flex min-w-0 flex-col rounded-tarjeta border border-borde bg-superficie p-2">
              <button type="button" onClick={() => abrirExterno(r.url)} className="text-left">
                <div className="aspect-square overflow-hidden rounded-xl bg-white">
                  <img src={r.imagen} alt="" loading="lazy" className="h-full w-full object-contain" />
                </div>
                <p className="mt-2 line-clamp-2 text-xs">{r.titulo}</p>
              </button>
              <div className="mt-auto pt-2">
                {r.precioAntes && r.precioAntes > r.precio ? <p className="text-[11px] text-tenue line-through">{dinero(r.precioAntes, r.moneda)}</p> : null}
                <p className="font-bold">{dinero(r.precio, r.moneda)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.envioGratis ? (
                    <Insignia tono="ok">
                      <Truck className="mr-1 inline h-3 w-3" />
                      Envío gratis
                    </Insignia>
                  ) : null}
                  {r.usado ? <Insignia tono="aviso">Usado</Insignia> : null}
                </div>
                {puedeVigilar ? (
                  <Boton tamano="sm" variante="fantasma" icono={BellPlus} className="mt-1 w-full" disabled={vigilar.isPending} onClick={() => vigilar.mutate(r)}>
                    Vigilar precio
                  </Boton>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
