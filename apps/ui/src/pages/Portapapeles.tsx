import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, ClipboardPaste, Copy, Link2, Maximize2, Monitor, Send, Smartphone, Tablet, Terminal, Trash2, Type, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePaginado } from "../components/Paginas";
import { AreaTexto, Boton, Cargando, Encabezado, ErrorCaja, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { useForma, useModoPagina } from "../lib/marco";
import { tipoDispositivo } from "../lib/plataforma";

interface Elemento {
  id: string;
  contenido: string;
  equipo: string | null;
  fecha: string;
}

const NOMBRE_EQUIPO = { pc: "PC", tablet: "Tablet", celular: "Celular" } as const;
const DIA = 86_400_000;

function clase(texto: string): { icono: LucideIcon; nombre: string } {
  const t = texto.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return { icono: Link2, nombre: "Enlace" };
  if (/^(sudo |cd |ls|docker |git |npm |pnpm |ssh |curl |apt |systemctl )/m.test(t) || /[{};]\s*$/m.test(t)) return { icono: Terminal, nombre: "Comando o código" };
  return { icono: Type, nombre: "Texto" };
}

function iconoEquipo(equipo: string | null): LucideIcon {
  if (equipo === "Celular") return Smartphone;
  if (equipo === "Tablet") return Tablet;
  return Monitor;
}

function grupo(fecha: string): string {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const t = new Date(fecha).getTime();
  if (t >= inicioHoy.getTime()) return "Hoy";
  if (t >= inicioHoy.getTime() - DIA) return "Ayer";
  if (t >= inicioHoy.getTime() - 6 * DIA) return "Esta semana";
  return "Antes";
}

const copiar = (texto: string) => void navigator.clipboard.writeText(texto).then(() => avisar("Copiado: ya lo puedes pegar"), () => avisar("No se pudo copiar", "error"));

function Lector({ elemento, puede, completo, alAbrir, alVolver, alBorrar, alEnviar, enviando }: { elemento: Elemento; puede: boolean; completo: boolean; alAbrir: () => void; alVolver: () => void; alBorrar: () => void; alEnviar: (texto: string) => void; enviando: boolean }) {
  const [texto, setTexto] = useState(elemento.contenido);
  useEffect(() => setTexto(elemento.contenido), [elemento.id, elemento.contenido]);
  const c = clase(elemento.contenido);
  const Equipo = iconoEquipo(elemento.equipo);
  const cambiado = texto !== elemento.contenido;
  return (
    <section className={cx("flex min-h-0 min-w-0 flex-1 flex-col bg-superficie", !completo && "rounded-2xl border border-borde")}>
      <div className={cx("flex shrink-0 flex-wrap items-center gap-2 border-b border-borde px-3 py-2.5", completo && "pt-[max(0.625rem,env(safe-area-inset-top))]")}>
        {completo ? <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} aria-label="Volver" /> : null}
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tarjeta text-acento">
          <c.icono className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-sm">{c.nombre}</b>
          <small className="flex items-center gap-1 text-xs text-tenue">
            <Equipo className="h-3 w-3" />
            {elemento.equipo ?? "Equipo"} · {haceCuanto(elemento.fecha)} · {elemento.contenido.length} letras
          </small>
        </div>
        <Boton tamano="sm" variante="primario" icono={Copy} onClick={() => copiar(texto)}>
          Copiar
        </Boton>
        {puede ? (
          <Boton tamano="sm" variante="secundario" icono={Send} cargando={enviando} onClick={() => alEnviar(texto)}>
            <span className="hidden sm:inline">{cambiado ? "Enviar corregido" : "Enviar otra vez"}</span>
          </Boton>
        ) : null}
        {!completo ? <Boton tamano="icono" variante="fantasma" icono={Maximize2} onClick={alAbrir} aria-label="Abrir completo" title="Abrir completo" /> : null}
        {puede ? <Boton tamano="icono" variante="fantasma" icono={Trash2} onClick={alBorrar} aria-label="Borrar" /> : null}
      </div>
      {completo && puede ? (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={100_000}
          aria-label="Texto"
          className="min-h-0 flex-1 resize-none bg-transparent px-5 py-4 font-mono text-sm leading-relaxed outline-none sm:px-8 sm:text-[15px]"
        />
      ) : (
        <pre className={cx("min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-4 text-sm leading-relaxed [overflow-wrap:anywhere]", c.nombre !== "Texto" && "font-mono", completo && "sm:px-8")}>{elemento.contenido}</pre>
      )}
      {completo && puede ? <p className="shrink-0 border-t border-borde px-5 py-2 text-xs text-tenue">Puedes corregirlo antes de mandarlo otra vez a tus equipos.</p> : null}
    </section>
  );
}

export default function Portapapeles() {
  const puede = usePuede("portapapeles", "escritura");
  const forma = useForma();
  const [params, setParams] = useSearchParams();
  const lista = useQuery({ queryKey: ["portapapeles"], queryFn: () => api<Elemento[]>("/api/portapapeles") });
  const [texto, setTexto] = useState("");
  const idSel = params.get("id");
  const ancho = forma === "pc";
  const actual = lista.data?.find((e) => e.id === idSel) ?? (ancho && !idSel ? (lista.data?.[0] ?? null) : null);
  const completo = Boolean(actual) && (params.get("completo") === "1" || (!ancho && Boolean(idSel)));
  useModoPagina("completa", completo);

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
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/portapapeles/${id}`, { metodo: "DELETE" }),
    onSuccess: () => {
      setParams({}, { replace: true });
      refrescar();
    },
    onError: avisarError,
  });
  const vaciar = useMutation({ mutationFn: () => api("/api/portapapeles", { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });

  const enviarCopiado = async () => {
    try {
      const copiado = await navigator.clipboard.readText();
      if (!copiado.trim()) return avisar("No hay texto copiado", "info");
      enviar.mutate(copiado);
    } catch {
      avisar("Este equipo no dejó leer lo copiado: pégalo en el cuadro", "info");
    }
  };

  const pg = usePaginado(lista.data, 12);
  const grupos = useMemo(() => {
    const m = new Map<string, Elemento[]>();
    for (const e of pg.visibles) m.set(grupo(e.fecha), [...(m.get(grupo(e.fecha)) ?? []), e]);
    return [...m.entries()];
  }, [pg.visibles]);

  if (completo && actual) {
    return (
      <Lector
        key={actual.id}
        elemento={actual}
        puede={puede}
        completo
        alAbrir={() => undefined}
        alVolver={() => setParams(ancho ? { id: actual.id } : {})}
        alBorrar={() => borrar.mutate(actual.id)}
        alEnviar={(t) => enviar.mutate(t)}
        enviando={enviar.isPending}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Encabezado titulo="Portapapeles" descripcion="Copia en un equipo y pega en otro. Se guardan los últimos 50." />
      {puede ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-borde bg-superficie p-3 sm:flex-row sm:items-end">
          <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escribe o pega aquí lo que quieres mandar…" maxLength={100_000} className="min-w-0 flex-1" />
          <div className="flex shrink-0 gap-2">
            <Boton variante="secundario" icono={ClipboardPaste} cargando={enviar.isPending && !texto} onClick={() => void enviarCopiado()}>
              Lo que copié
            </Boton>
            <Boton variante="primario" icono={Send} disabled={!texto.trim()} cargando={enviar.isPending && Boolean(texto)} onClick={() => enviar.mutate(texto)}>
              Enviar
            </Boton>
          </div>
        </div>
      ) : null}
      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      {lista.data?.length === 0 ? <Vacio icono={ClipboardList} texto="Nada todavía. Lo que envíes aparece al momento en tus otros equipos." /> : null}
      {lista.data?.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <section className="min-w-0 rounded-2xl border border-borde bg-superficie p-2">
            {grupos.map(([nombre, elementos]) => (
              <div key={nombre} className="mb-1">
                <h3 className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-tenue">{nombre}</h3>
                {elementos.map((e) => {
                  const c = clase(e.contenido);
                  const Equipo = iconoEquipo(e.equipo);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setParams({ id: e.id })}
                      className={cx("flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left", actual?.id === e.id ? "bg-tarjeta" : "hover:bg-tarjeta")}
                    >
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fondo text-acento">
                        <c.icono className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("line-clamp-2 break-words text-sm [overflow-wrap:anywhere]", c.nombre !== "Texto" && "font-mono text-xs")}>{e.contenido}</span>
                        <small className="mt-0.5 flex items-center gap-1 text-[11px] text-tenue">
                          <Equipo className="h-3 w-3" />
                          {e.equipo ?? "Equipo"} · {haceCuanto(e.fecha)}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {pg.paginas}
            {puede ? (
              <div className="mt-2 border-t border-borde px-2 pt-2">
                <Boton variante="fantasma" tamano="sm" icono={Trash2} cargando={vaciar.isPending} onClick={() => vaciar.mutate()}>
                  Vaciar todo
                </Boton>
              </div>
            ) : null}
          </section>
          {actual ? (
            <div className="hidden min-h-[420px] flex-col lg:flex">
              <Lector
                key={actual.id}
                elemento={actual}
                puede={puede}
                completo={false}
                alAbrir={() => setParams({ id: actual.id, completo: "1" })}
                alVolver={() => setParams({})}
                alBorrar={() => borrar.mutate(actual.id)}
                alEnviar={(t) => enviar.mutate(t)}
                enviando={enviar.isPending}
              />
            </div>
          ) : (
            <div className="hidden min-h-[420px] place-items-center rounded-2xl border border-dashed border-borde lg:grid">
              <Vacio icono={ClipboardList} texto="Toca algo de la lista para leerlo completo." />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
