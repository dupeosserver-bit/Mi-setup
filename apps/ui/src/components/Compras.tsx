/** Compras: escribe lo que buscas (o tómale foto) y ves dónde comprarlo: Mercado Libre aquí mismo y muchas tiendas con un toque. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellPlus, Camera, ExternalLink, Search, ShoppingBag, Truck } from "lucide-react";
import { useRef, useState } from "react";
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
  tiendas: { id: string; nombre: string; url: string; grupo: "comparar" | "tiendas" | "tecnologia" | "importado" }[];
  mercadoLibre: { configurado: boolean; resultados: Resultado[] };
}

const GRUPOS = { comparar: "Comparar en todas", tiendas: "Tiendas en México", tecnologia: "Tecnología", importado: "Importado (tarda más)" } as const;

const dinero = (n: number, moneda: string) => n.toLocaleString("es-MX", { style: "currency", currency: moneda || "MXN", maximumFractionDigits: 0 });

export function Compras() {
  const puedeVigilar = usePuede("novedades", "escritura");
  const [texto, setTexto] = useState("");
  const [buscado, setBuscado] = useState("");
  const [orden, setOrden] = useState<"relevancia" | "menor" | "mayor">("relevancia");
  const camara = useRef<HTMLInputElement>(null);
  const foto = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append("archivo", f);
      return api<{ producto: string; consulta: string; alternativas: string[]; detalles: string }>("/api/compras/foto", { formulario: fd });
    },
    onSuccess: (r) => {
      setTexto(r.consulta);
      setBuscado(r.consulta);
    },
    onError: avisarError,
  });
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
      <Tarjeta titulo="¿Qué quieres comprar?" icono={ShoppingBag}>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBuscado(texto.trim());
          }}
        >
          <Entrada className="min-w-0 flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe lo que buscas, ej. audífonos inalámbricos" />
          <Boton tamano="icono" icono={Camera} cargando={foto.isPending} onClick={() => camara.current?.click()} aria-label="Buscar con una foto" title="Buscar con una foto" />
          <input
            ref={camara}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) foto.mutate(f);
            }}
          />
          <Selector className="w-auto" value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
            <option value="relevancia">Más relevantes</option>
            <option value="menor">Menor precio</option>
            <option value="mayor">Mayor precio</option>
          </Selector>
          <Boton type="submit" variante="primario" icono={Search} disabled={texto.trim().length < 2}>
            Buscar
          </Boton>
        </form>
        {foto.data ? (
          <div className="mt-3 rounded-xl bg-fondo p-3 text-sm">
            <p>
              Parece: <b>{foto.data.producto}</b>
              {foto.data.detalles ? <span className="text-tenue"> · {foto.data.detalles}</span> : null}
            </p>
            {foto.data.alternativas.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {foto.data.alternativas.map((a) => (
                  <button key={a} type="button" className="rounded-full border border-borde px-2 py-0.5 text-xs hover:bg-tarjeta" onClick={() => (setTexto(a), setBuscado(a))}>
                    {a}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {d ? (
          <div className="mt-3 space-y-2">
            {(Object.keys(GRUPOS) as (keyof typeof GRUPOS)[]).map((g) => {
              const lista = d.tiendas.filter((t) => t.grupo === g);
              return lista.length ? (
                <div key={g}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tenue">{GRUPOS[g]}</p>
                  <div className="flex flex-wrap gap-2">
                    {lista.map((t) => (
                      <Boton key={t.id} tamano="sm" variante={g === "comparar" ? "primario" : "secundario"} icono={ExternalLink} onClick={() => abrirExterno(t.url)}>
                        {t.nombre}
                      </Boton>
                    ))}
                  </div>
                </div>
              ) : null;
            })}
          </div>
        ) : null}
        <p className="mt-2 text-xs text-tenue">Mercado Libre se ve aquí mismo; las demás tiendas se abren con tu búsqueda. Con la cámara, la IA reconoce el objeto y lo busca.</p>
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
