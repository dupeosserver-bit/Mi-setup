/** Nota compartida con enlace: se ve sin cuenta (solo lectura, con fotos y notas de voz). */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { Cargando, ErrorCaja } from "../components/ui";
import { api } from "../lib/api";
import { aHtml } from "../lib/markdownNotas";
import { localeActual } from "../lib/idioma";

export default function NotaPublica() {
  const { token = "" } = useParams();
  const q = useQuery({
    queryKey: ["nota-publica", token],
    queryFn: () => api<{ titulo: string; icono: string | null; contenido: string; autor: string; actualizada: string }>(`/api/notas-publicas/${token}`),
    retry: false,
  });
  const html = useMemo(() => aHtml(q.data?.contenido ?? ""), [q.data?.contenido]);
  return (
    <div className="min-h-full bg-fondo p-4 text-texto">
      <div className="mx-auto max-w-3xl space-y-3">
        {q.isLoading ? <Cargando /> : null}
        {q.error ? (
          <div className="rounded-tarjeta border border-borde bg-superficie p-6 text-center">
            <ErrorCaja error={q.error} />
            <p className="mt-2 text-sm text-tenue">Pide a quien te la mandó un enlace nuevo.</p>
          </div>
        ) : null}
        {q.data ? (
          <article className="rounded-tarjeta border border-borde bg-superficie">
            <header className="flex items-center gap-2 border-b border-borde px-4 py-3">
              <span className="text-2xl">{q.data.icono ?? "📝"}</span>
              <div className="min-w-0">
                <h1 className="truncate font-titulo text-xl font-semibold">{q.data.titulo || "Nota"}</h1>
                <p className="text-xs text-tenue">
                  De {q.data.autor} · actualizada {new Date(q.data.actualizada).toLocaleString(localeActual(), { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            </header>
            {/* HTML limpiado con DOMPurify (sin scripts ni eventos). */}
            <div className="pagina-notion px-4 py-3" dangerouslySetInnerHTML={{ __html: html || "<p>Nota vacía.</p>" }} />
          </article>
        ) : null}
        <p className="text-center text-xs text-tenue">Compartida desde Mi Setup · solo lectura</p>
      </div>
    </div>
  );
}
