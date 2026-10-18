/** Streams: título y juego/categoría en Twitch, YouTube y Kick. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { EstadoCuenta, useCuentas, type CuentaRed } from "../components/CuentaRed";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Tarjeta, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";

interface Canal {
  titulo: string;
  categoria: { id: string; nombre: string } | null;
  nota?: string;
}

function Editor({ c }: { c: CuentaRed }) {
  const puede = usePuede("streams", "escritura");
  const canal = useQuery({ queryKey: ["redes", "canal", c.plataforma], queryFn: () => api<Canal>(`/api/streams/${c.plataforma}`), retry: false });
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<{ id: string; nombre: string } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    if (canal.data) {
      setTitulo(canal.data.titulo);
      setCategoria(canal.data.categoria);
    }
  }, [canal.data]);

  const resultados = useQuery({
    queryKey: ["redes", "categorias", c.plataforma, buscar],
    queryFn: () => api<{ id: string; nombre: string }[]>(`/api/streams/${c.plataforma}/categorias?q=${encodeURIComponent(buscar)}`),
    enabled: buscar.length >= 2,
  });

  const guardar = useMutation({
    mutationFn: () =>
      api<Canal>(`/api/streams/${c.plataforma}`, {
        metodo: "PATCH",
        cuerpo: { titulo, ...(categoria && categoria.id !== canal.data?.categoria?.id ? { categoriaId: categoria.id } : {}) },
      }),
    onSuccess: (r) => {
      queryClient.setQueryData(["redes", "canal", c.plataforma], r);
      avisar(`Stream de ${c.nombre} actualizado`);
    },
    onError: avisarError,
  });

  if (canal.isLoading) return <Cargando />;
  if (canal.error) return <ErrorCaja error={canal.error} />;
  const conCategoria = c.plataforma !== "youtube";
  return (
    <div className="mt-4 space-y-3">
      {canal.data?.nota ? <p className="text-xs text-tenue">{canal.data.nota}</p> : null}
      <Campo etiqueta="Título">
        <Entrada value={titulo} maxLength={140} onChange={(e) => setTitulo(e.target.value)} disabled={!puede} />
      </Campo>
      {conCategoria ? (
        <Campo etiqueta={`Juego o categoría${categoria ? `: ${categoria.nombre}` : ""}`}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setBuscar(busqueda.trim());
            }}
          >
            <Entrada value={busqueda} placeholder="Buscar juego…" onChange={(e) => setBusqueda(e.target.value)} disabled={!puede} />
            <Boton type="submit" tamano="icono" icono={Search} aria-label="Buscar" disabled={!puede} />
          </form>
          {resultados.data?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {resultados.data.map((r) => (
                <Boton key={r.id} tamano="sm" variante={categoria?.id === r.id ? "primario" : "secundario"} onClick={() => setCategoria(r)}>
                  {r.nombre}
                </Boton>
              ))}
            </div>
          ) : null}
        </Campo>
      ) : null}
      {puede ? (
        <Boton variante="primario" icono={Save} cargando={guardar.isPending} disabled={!titulo.trim()} onClick={() => guardar.mutate()}>
          Guardar en {c.nombre}
        </Boton>
      ) : null}
    </div>
  );
}

export default function Streams() {
  const cuentas = useCuentas();
  const lista = (cuentas.data ?? []).filter((c) => c.plataforma !== "x");
  return (
    <div className="space-y-4">
      <Encabezado titulo="Streams" descripcion="Cambia el título y el juego de tus transmisiones. La IA también puede proponerlo; tú apruebas." />
      {cuentas.isLoading ? <Cargando /> : null}
      <ErrorCaja error={cuentas.error} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {lista.map((c) => (
          <Tarjeta key={c.plataforma} titulo={c.nombre}>
            <EstadoCuenta c={c} />
            {c.cuenta ? <Editor c={c} /> : null}
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}
