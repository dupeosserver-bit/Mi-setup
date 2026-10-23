/** Portapapeles compartido: copias en un equipo y lo pegas en otro. */
import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardList, ClipboardPaste, Copy, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { AreaTexto, Boton, Cargando, Encabezado, ErrorCaja, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { tipoDispositivo } from "../lib/plataforma";

interface Elemento {
  id: string;
  contenido: string;
  equipo: string | null;
  fecha: string;
}

const NOMBRE_EQUIPO = { pc: "PC", tablet: "Tablet", celular: "Celular" } as const;

export default function Portapapeles() {
  const puede = usePuede("portapapeles", "escritura");
  const lista = useQuery({ queryKey: ["portapapeles"], queryFn: () => api<Elemento[]>("/api/portapapeles") });
  const [texto, setTexto] = useState("");
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["portapapeles"] });
  const enviar = useMutation({
    mutationFn: (contenido: string) => api("/api/portapapeles", { cuerpo: { contenido, equipo: NOMBRE_EQUIPO[tipoDispositivo()] } }),
    onSuccess: () => {
      setTexto("");
      refrescar();
      avisar("Enviado a tus otros equipos");
    },
    onError: avisarError,
  });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/portapapeles/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  const vaciar = useMutation({ mutationFn: () => api("/api/portapapeles", { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });

  const enviarCopiado = async () => {
    try {
      const copiado = await navigator.clipboard.readText();
      if (!copiado.trim()) return avisar("No hay texto copiado", "info");
      enviar.mutate(copiado);
    } catch {
      avisar("Este equipo no dejó leer lo copiado: pégalo en el cuadro de abajo", "info");
    }
  };

  const pgPp = usePaginado(lista.data, 12);
  return (
    <div className="space-y-4">
      <Encabezado titulo="Portapapeles" descripcion="Copia en un equipo y pega en otro. Se guardan los últimos 50." />
      {puede ? (
        <Tarjeta titulo="Enviar" icono={Send}>
          <div className="space-y-3">
            <Boton variante="primario" icono={ClipboardPaste} cargando={enviar.isPending} onClick={() => void enviarCopiado()}>
              Enviar lo que copié
            </Boton>
            <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="…o escribe / pega aquí" maxLength={100_000} />
            <Boton icono={Send} disabled={!texto.trim()} cargando={enviar.isPending} onClick={() => enviar.mutate(texto)}>
              Enviar texto
            </Boton>
          </div>
        </Tarjeta>
      ) : null}
      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      {lista.data?.length === 0 ? <Vacio icono={ClipboardList} texto="Nada todavía. Lo que envíes aparece al momento en tus otros equipos." /> : null}
      <div className="space-y-2">
        {pgPp.visibles.map((c) => (
          <div key={c.id} className="flex items-start gap-2 rounded-tarjeta border border-borde bg-superficie p-3">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => void navigator.clipboard.writeText(c.contenido).then(() => avisar("Copiado: ya lo puedes pegar"), () => avisar("No se pudo copiar", "error"))}
            >
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{c.contenido}</p>
              <p className="mt-1 text-xs text-tenue">
                {c.equipo ?? "Equipo"} · {haceCuanto(c.fecha)} · toca para copiar
              </p>
            </button>
            <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Copiar" onClick={() => void navigator.clipboard.writeText(c.contenido).then(() => avisar("Copiado"))} />
            {puede ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => borrar.mutate(c.id)} /> : null}
          </div>
        ))}
      </div>
      {pgPp.paginas}
      {puede && lista.data?.length ? (
        <Boton variante="fantasma" icono={Trash2} cargando={vaciar.isPending} onClick={() => vaciar.mutate()}>
          Vaciar todo
        </Boton>
      ) : null}
    </div>
  );
}
