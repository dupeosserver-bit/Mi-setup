/** Correos temporales: direcciones alias@dominio, bandeja y "Guardar" para que no expiren (24 h). */
import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, BookmarkCheck, Copy, Inbox, Mail, Plus, Shuffle, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtFechaHora, haceCuanto } from "../lib/formato";

interface Alias {
  id: string;
  alias: string;
  direccion: string;
  etiqueta: string;
  activo: boolean;
}

interface Resumen {
  id: string;
  aliasId: string;
  de: string;
  para: string;
  asunto: string;
  vistaPrevia: string;
  recibido: string;
  guardado: boolean;
  expiraEn: string | null;
}

interface Completo {
  id: string;
  de: string;
  para: string;
  asunto: string;
  texto: string;
  html: string | null;
  recibido: string;
  guardado: boolean;
}

function NuevoAlias({ dominio, alTerminar }: { dominio: string; alTerminar: () => void }) {
  const [alias, setAlias] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const crear = useMutation({
    mutationFn: () => api<{ direccion: string }>("/api/correos/alias", { cuerpo: { alias: alias || undefined, etiqueta } }),
    onSuccess: (r) => {
      avisar(`Creado ${r.direccion}`);
      void queryClient.invalidateQueries({ queryKey: ["correos"] });
      alTerminar();
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => (e.preventDefault(), crear.mutate())}>
      <Campo etiqueta="Dirección" ayuda="Déjala vacía para una aleatoria.">
        <div className="flex items-center gap-2">
          <Entrada value={alias} onChange={(e) => setAlias(e.target.value.toLowerCase())} placeholder="tienda-juegos" />
          <span className="shrink-0 text-sm text-tenue">@{dominio}</span>
        </div>
      </Campo>
      <Campo etiqueta="Para qué es (opcional)">
        <Entrada value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Registro en una tienda" />
      </Campo>
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" icono={alias ? Plus : Shuffle} cargando={crear.isPending}>
        {alias ? "Crear dirección" : "Crear dirección aleatoria"}
      </Boton>
    </form>
  );
}

function Lector({ id, alVolver }: { id: string; alVolver: () => void }) {
  const puede = usePuede("correos_temporales", "escritura");
  const [vista, setVista] = useState<"texto" | "html">("texto");
  const { data, isLoading, error } = useQuery({ queryKey: ["correos", "mensaje", id], queryFn: () => api<Completo>(`/api/correos/mensajes/${id}`) });
  const guardar = async (guardado: boolean) => {
    await api(`/api/correos/mensajes/${id}/guardar`, { cuerpo: { guardado } }).catch(avisarError);
    await queryClient.invalidateQueries({ queryKey: ["correos"] });
    avisar(guardado ? "Guardado: ya no expira" : "Volverá a expirar a las 24 h");
  };
  if (isLoading) return <Cargando />;
  if (error || !data) return <ErrorCaja error={error} />;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} aria-label="Volver" className="md:hidden" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{data.asunto || "(sin asunto)"}</h2>
          <p className="text-xs text-tenue">
            De {data.de} · para {data.para} · {fmtFechaHora(data.recibido)}
          </p>
        </div>
        {puede ? <Boton tamano="sm" icono={data.guardado ? BookmarkCheck : Bookmark} onClick={() => void guardar(!data.guardado)}>{data.guardado ? "Guardado" : "Guardar"}</Boton> : null}
      </div>
      {data.html ? (
        <Pestanas
          opciones={[
            { id: "texto", texto: "Texto" },
            { id: "html", texto: "Original (HTML)" },
          ]}
          valor={vista}
          alCambiar={setVista}
        />
      ) : null}
      {vista === "html" && data.html ? (
        // Sin scripts, formularios ni navegación: el HTML del correo es contenido no confiable.
        <iframe title="Contenido del correo" sandbox="" srcDoc={data.html} className="h-[60vh] w-full rounded-xl border border-borde bg-white" referrerPolicy="no-referrer" />
      ) : (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-fondo p-4 font-sans text-sm">{data.texto || "(sin texto)"}</pre>
      )}
    </div>
  );
}

export default function Correos() {
  const puede = usePuede("correos_temporales", "escritura");
  const [nuevo, setNuevo] = useState(false);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const alias = useQuery({ queryKey: ["correos", "alias"], queryFn: () => api<{ dominio: string; alias: Alias[] }>("/api/correos/alias") });
  const mensajes = useQuery({
    queryKey: ["correos", "mensajes", filtro],
    queryFn: () => api<Resumen[]>(`/api/correos/mensajes${filtro ? `?alias=${filtro}` : ""}`),
    refetchInterval: 30_000,
  });

  const pag136 = usePaginado(mensajes.data, 25);
  return (
    <>
    <>
      <Encabezado
        titulo="Correos temporales"
        descripcion="Llegan por Cloudflare Email Routing. Se borran a las 24 h salvo los que guardes."
        acciones={puede ? <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)} disabled={!alias.data}>Dirección</Boton> : null}
      />
      <ErrorCaja error={alias.error ?? mensajes.error} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_340px_1fr]">
        <Tarjeta titulo="Direcciones" icono={Mail}>
          {alias.data?.alias.length === 0 ? <Vacio icono={Mail} texto="Crea una dirección para empezar." /> : null}
          <button type="button" onClick={() => setFiltro(null)} className={cx("mb-1 w-full rounded-lg px-2 py-1.5 text-left text-sm", filtro === null ? "bg-tarjeta" : "hover:bg-tarjeta")}>
            Todas
          </button>
          <ul className="space-y-1">
            {alias.data?.alias.map((a) => (
              <li key={a.id} className={cx("rounded-lg px-2 py-1.5", filtro === a.id ? "bg-tarjeta" : "hover:bg-tarjeta")}>
                <button type="button" onClick={() => setFiltro(a.id)} className="w-full text-left">
                  <p className={cx("truncate text-sm", !a.activo && "text-tenue line-through")}>{a.direccion}</p>
                  {a.etiqueta ? <p className="truncate text-xs text-tenue">{a.etiqueta}</p> : null}
                </button>
                <div className="mt-1 flex items-center gap-1">
                  <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Copiar dirección" onClick={() => void navigator.clipboard.writeText(a.direccion).then(() => avisar("Dirección copiada"))} />
                  {puede ? (
                    <>
                      <Interruptor
                        activo={a.activo}
                        alCambiar={(v) => void api(`/api/correos/alias/${a.id}`, { metodo: "PATCH", cuerpo: { activo: v } }).then(() => queryClient.invalidateQueries({ queryKey: ["correos"] }), avisarError)}
                      />
                      <Boton
                        tamano="icono"
                        variante="fantasma"
                        icono={Trash2}
                        aria-label="Borrar dirección"
                        onClick={async () => {
                          if (!(await confirmar({ titulo: "Borrar dirección", mensaje: `¿Borrar ${a.direccion} y todos sus correos?`, boton: "Borrar" }))) return;
                          await api(`/api/correos/alias/${a.id}`, { metodo: "DELETE" }).catch(avisarError);
                          await queryClient.invalidateQueries({ queryKey: ["correos"] });
                        }}
                      />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <div className={cx("space-y-2", abierto && "hidden lg:block")}>
          {mensajes.isLoading ? <Cargando /> : null}
          {mensajes.data?.length === 0 ? <Vacio icono={Inbox} texto="La bandeja está vacía." /> : null}
          {pag136.visibles.map((m) => (
            <div key={m.id} className={cx("rounded-xl border p-3", abierto === m.id ? "border-acento/60 bg-tarjeta" : "border-borde bg-superficie hover:bg-tarjeta")}>
              <button type="button" onClick={() => setAbierto(m.id)} className="w-full text-left">
                <p className="truncate text-sm font-medium">{m.asunto || "(sin asunto)"}</p>
                <p className="truncate text-xs text-tenue">{m.de}</p>
                <p className="mt-1 line-clamp-2 text-xs text-tenue">{m.vistaPrevia}</p>
              </button>
              <div className="mt-2 flex items-center justify-between text-[11px] text-tenue">
                <span>{haceCuanto(m.recibido)}</span>
                {m.guardado ? <Insignia tono="ok">guardado</Insignia> : <span>expira {fmtFechaHora(m.expiraEn)}</span>}
                {puede ? (
                  <button
                    type="button"
                    className="hover:text-peligro"
                    onClick={() => void api(`/api/correos/mensajes/${m.id}`, { metodo: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: ["correos"] }), avisarError)}
                  >
                    borrar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className={cx("rounded-tarjeta border border-borde bg-superficie p-4", !abierto && "hidden lg:block")}>
          {abierto ? <Lector key={abierto} id={abierto} alVolver={() => setAbierto(null)} /> : <Vacio icono={Mail} texto="Elige un correo." />}
        </div>
      </div>
      <Modal abierto={nuevo} titulo="Nueva dirección" alCerrar={() => setNuevo(false)}>
        {alias.data ? <NuevoAlias dominio={alias.data.dominio} alTerminar={() => setNuevo(false)} /> : null}
      </Modal>
    </>
    {pag136.paginas}
    </>
  );
}
