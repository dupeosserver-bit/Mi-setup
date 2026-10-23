import { useMutation } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Check, Copy, FileImage, FileText, HandCoins, Paperclip, Plus, Scale, Send, Target, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { confirmar } from "../../lib/confirmar";
import { refrescarIa, tamano, urlArchivo, useCaso, useCasos, type AdjuntoCaso, type CasoDeuda, type DetalleCaso, type Paso } from "../../lib/iaProyectos";
import { useForma, useModoPagina } from "../../lib/marco";
import { aHtml } from "../../lib/markdownNotas";
import { useSesion } from "../../lib/sesion";
import { Negociar } from "../IaExtras";
import { usePaginado } from "../Paginas";
import { AreaTexto, Boton, Campo, Cargando, Entrada, ErrorCaja, Insignia, Modal, Selector, Vacio, avisar, avisarError, cx } from "../ui";
import { iniciales } from "./Conversacion";

const TIPOS = [
  ["debo", "Debo dinero"],
  ["me_deben", "Me deben"],
  ["negociar", "Quiero negociar"],
] as const;
const ESTADOS = { abierto: ["En seguimiento", "aviso"], en_acuerdo: ["Con acuerdo", "ok"], cerrado: ["Cerrado", "neutro"] } as const;
type Tono = "amable" | "firme" | "formal";
type Medio = "whatsapp" | "correo" | "llamada" | "carta";

function Probabilidad({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-xs text-tenue">Sin calcular</span>;
  return (
    <div className="flex items-center gap-2">
      <b className="text-lg">{valor}%</b>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fondo">
        <div className={cx("h-full rounded-full", valor >= 66 ? "bg-ok" : valor >= 40 ? "bg-aviso" : "bg-peligro")} style={{ width: `${valor}%` }} />
      </div>
    </div>
  );
}

function NuevoCaso({ alCerrar, alCreado }: { alCerrar: () => void; alCreado: (id: string) => void }) {
  const [f, setF] = useState({ titulo: "", tipo: "debo" as (typeof TIPOS)[number][0], con: "", monto: "", situacion: "", tono: "amable" as Tono, medio: "whatsapp" as Medio });
  const crear = useMutation({
    mutationFn: () => api<DetalleCaso>("/api/ia/deudas", { cuerpo: f }),
    onSuccess: (r) => {
      refrescarIa();
      alCreado(r.caso.id);
    },
    onError: avisarError,
  });
  return (
    <Modal abierto titulo="Nuevo caso" alCerrar={alCerrar} ancho="max-w-lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <div className="flex flex-wrap gap-1">
          {TIPOS.map(([id, texto]) => (
            <button key={id} type="button" onClick={() => setF({ ...f, tipo: id })} className={cx("min-h-9 rounded-full border px-3 text-xs", f.tipo === id ? "border-acento bg-acento text-black" : "border-borde text-tenue")}>
              {texto}
            </button>
          ))}
        </div>
        <Campo etiqueta="Nombre del caso">
          <Entrada value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ej. Tarjeta de la tienda" maxLength={120} required />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Con quién">
            <Entrada value={f.con} onChange={(e) => setF({ ...f, con: e.target.value })} placeholder="Banco, tienda, persona…" maxLength={120} />
          </Campo>
          <Campo etiqueta="Monto">
            <Entrada value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} placeholder="$8,000" maxLength={60} />
          </Campo>
        </div>
        <Campo etiqueta="¿Qué pasa?">
          <AreaTexto rows={5} value={f.situacion} onChange={(e) => setF({ ...f, situacion: e.target.value })} maxLength={4000} placeholder="Cuéntame cómo va: qué te dicen, qué te ofrecen, qué quieres lograr…" required />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Selector value={f.tono} onChange={(e) => setF({ ...f, tono: e.target.value as Tono })}>
            <option value="amable">Tono amable</option>
            <option value="firme">Tono firme</option>
            <option value="formal">Tono formal</option>
          </Selector>
          <Selector value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value as Medio })}>
            <option value="whatsapp">Por WhatsApp</option>
            <option value="correo">Por correo</option>
            <option value="llamada">Para decir por teléfono</option>
            <option value="carta">Carta formal</option>
          </Selector>
        </div>
        <Boton type="submit" variante="primario" icono={HandCoins} cargando={crear.isPending} disabled={f.titulo.trim().length < 2 || f.situacion.trim().length < 10}>
          Crear y pedir ayuda
        </Boton>
      </form>
    </Modal>
  );
}

function TarjetaCaso({ c, alAbrir }: { c: CasoDeuda; alAbrir: () => void }) {
  const siguiente = c.pasos.find((p) => !p.hecho);
  const [texto, tono] = ESTADOS[c.estado];
  return (
    <button type="button" onClick={alAbrir} className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4 text-left hover:border-acento">
      <div className="flex items-start gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--aviso)_16%,transparent)] text-aviso">
          <HandCoins className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate">{c.titulo}</b>
          <small className="block truncate text-xs text-tenue">
            {[c.con, c.monto].filter(Boolean).join(" · ") || TIPOS.find((t) => t[0] === c.tipo)?.[1]}
          </small>
        </span>
        <Insignia tono={tono}>{texto}</Insignia>
      </div>
      <Probabilidad valor={c.probabilidad} />
      <p className="line-clamp-2 text-sm text-tenue">{siguiente ? `Siguiente: ${siguiente.texto}` : c.pasos.length ? "Todos los pasos hechos" : "Aún sin pasos"}</p>
      <small className="text-xs text-tenue">{`${c.pasos.filter((p) => p.hecho).length} de ${c.pasos.length} pasos · ${c.mensajes} mensajes`}</small>
    </button>
  );
}

function MensajeCaso({ m }: { m: DetalleCaso["mensajes"][number] }) {
  const usuario = useSesion((s) => s.usuario);
  const esIa = m.rol === "assistant";
  const html = useMemo(() => (esIa ? aHtml(m.texto) : ""), [esIa, m.texto]);
  return (
    <div className="flex gap-3">
      <span className={cx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold", esIa ? "bg-[color-mix(in_srgb,var(--acento)_18%,transparent)] text-acento" : "bg-tarjeta")}>
        {esIa ? <Scale className="h-4 w-4" /> : iniciales(usuario?.displayName)}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-semibold text-tenue">
          {esIa ? "IA asistente" : "Tú"} · {new Date(m.fecha).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        </p>
        {esIa ? <div className="pagina-notion text-[0.95rem]" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-tarjeta px-4 py-2.5 text-sm [overflow-wrap:anywhere]">{m.texto}</div>}
        {m.adjuntos.length ? (
          <div className="flex flex-wrap gap-2">
            {m.adjuntos.map((a) => (
              <Adjunto key={a.id} a={a} />
            ))}
          </div>
        ) : null}
        {m.listo ? (
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--acento)_40%,transparent)] bg-[color-mix(in_srgb,var(--acento)_7%,var(--superficie))] p-3">
            <p className="mb-1 text-xs font-semibold text-acento">Mensaje listo para mandar</p>
            <p className="whitespace-pre-wrap text-sm">{m.listo}</p>
            <div className="mt-2 flex justify-end">
              <Boton tamano="sm" variante="secundario" icono={Copy} onClick={() => void navigator.clipboard.writeText(m.listo ?? "").then(() => avisar("Copiado"))}>
                Copiar
              </Boton>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Adjunto({ a }: { a: AdjuntoCaso }) {
  return (
    <a href={urlArchivo(a.url)} target="_blank" rel="noreferrer" className="flex max-w-full items-center gap-2 rounded-xl border border-borde bg-tarjeta py-1 pl-1 pr-3 text-xs hover:border-acento">
      {a.imagen ? <img src={urlArchivo(a.url)} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-lg bg-fondo">{a.tipo === "application/pdf" ? <FileText className="h-4 w-4 text-peligro" /> : <FileImage className="h-4 w-4" />}</span>}
      <span className="min-w-0">
        <b className="block max-w-40 truncate">{a.nombre}</b>
        <small className="text-tenue">{tamano(a.tamano)}</small>
      </span>
    </a>
  );
}

function PanelCaso({ d }: { d: DetalleCaso }) {
  const pasos = useMutation({
    mutationFn: (lista: Paso[]) => api(`/api/ia/deudas/${d.caso.id}`, { metodo: "PATCH", cuerpo: { pasos: lista } }),
    onSuccess: refrescarIa,
    onError: avisarError,
  });
  const estado = useMutation({
    mutationFn: (e: CasoDeuda["estado"]) => api(`/api/ia/deudas/${d.caso.id}`, { metodo: "PATCH", cuerpo: { estado: e } }),
    onSuccess: refrescarIa,
    onError: avisarError,
  });
  const adjuntos = d.mensajes.flatMap((m) => m.adjuntos);
  return (
    <div className="space-y-5 p-4">
      <Campo etiqueta="Estado del caso">
        <Selector value={d.caso.estado} onChange={(e) => estado.mutate(e.target.value as CasoDeuda["estado"])}>
          <option value="abierto">En seguimiento</option>
          <option value="en_acuerdo">Con acuerdo</option>
          <option value="cerrado">Cerrado</option>
        </Selector>
      </Campo>
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-acento" /> Qué tan probable es lograrlo
        </h4>
        <Probabilidad valor={d.caso.probabilidad} />
        <p className="mt-1 text-xs text-tenue">Según lo que contaste y lo que te ofrecieron.</p>
      </section>
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Scale className="h-4 w-4 text-acento" /> Siguientes pasos
        </h4>
        {!d.caso.pasos.length ? <p className="text-sm text-tenue">La IA te dejará pasos cuando le cuentes cómo va.</p> : null}
        <div className="space-y-1.5">
          {d.caso.pasos.map((p, i) => (
            <button
              key={`${p.texto}-${i}`}
              type="button"
              onClick={() => pasos.mutate(d.caso.pasos.map((x, j) => (j === i ? { ...x, hecho: !x.hecho } : x)))}
              className={cx("flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left text-sm hover:bg-tarjeta", p.hecho && "text-tenue line-through")}
            >
              <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[10px] font-bold", p.hecho ? "border-ok bg-ok text-black" : "border-borde")}>{p.hecho ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
              <span className="min-w-0 flex-1 break-words">{p.texto}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="flex gap-2 rounded-xl border border-[color-mix(in_srgb,var(--aviso)_40%,transparent)] bg-[color-mix(in_srgb,var(--aviso)_8%,transparent)] p-3 text-xs">
        <AlertCircle className="h-4 w-4 shrink-0 text-aviso" />
        <span>{d.aviso}</span>
      </div>
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4 text-acento" /> Adjuntos del caso
        </h4>
        {!adjuntos.length ? <p className="text-sm text-tenue">Sin adjuntos todavía.</p> : null}
        <div className="flex flex-wrap gap-2">
          {adjuntos.map((a) => (
            <Adjunto key={a.id} a={a} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CasoAbierto({ id, alSalir }: { id: string; alSalir: () => void }) {
  useModoPagina("completa");
  const forma = useForma();
  const caso = useCaso(id);
  const [vista, setVista] = useState<"conversacion" | "pasos">("conversacion");
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [tono, setTono] = useState<Tono>("amable");
  const [medio, setMedio] = useState<Medio>("whatsapp");
  const entrada = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const enviar = useMutation({
    mutationFn: () => {
      const datos = new FormData();
      datos.append("texto", texto.trim());
      datos.append("tono", tono);
      datos.append("medio", medio);
      for (const f of archivos) datos.append("archivo", f, f.name);
      return api<DetalleCaso>(`/api/ia/deudas/${id}/mensajes`, { formulario: datos });
    },
    onSuccess: (r) => {
      setTexto("");
      setArchivos([]);
      if (r.sinIa) avisar("Se guardó en el caso. La IA no está configurada para responder.", "info");
      refrescarIa();
    },
    onError: avisarError,
  });
  const borrar = async () => {
    if (!(await confirmar({ titulo: "Borrar caso", mensaje: "Se borran la conversación y sus adjuntos.", peligroso: true, boton: "Borrar" }))) return;
    await api(`/api/ia/deudas/${id}`, { metodo: "DELETE" }).catch(avisarError);
    refrescarIa();
    alSalir();
  };
  useEffect(() => {
    const el = caja.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [caso.data, vista]);
  const d = caso.data;
  const ancho = forma === "pc";
  const conversacion = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={caja} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-5 sm:px-6">
          {d?.mensajes.map((m) => <MensajeCaso key={m.id} m={m} />)}
          {enviar.isPending ? <p className="pl-11 text-sm text-tenue">Revisando cómo va tu caso…</p> : null}
          <ErrorCaja error={enviar.error} />
        </div>
      </div>
      <div className="safe-bottom shrink-0 border-t border-borde bg-superficie p-2 sm:p-3">
        <div className="mx-auto max-w-3xl space-y-2">
          {archivos.length ? (
            <div className="flex flex-wrap gap-2">
              {archivos.map((f, i) => (
                <span key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl border border-borde bg-tarjeta py-1 pl-2 pr-1 text-xs">
                  <span className="max-w-36 truncate">{f.name}</span>
                  <button type="button" aria-label={`Quitar ${f.name}`} className="grid h-7 w-7 place-items-center text-tenue" onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <AreaTexto rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} placeholder="Cuéntame qué te contestaron o qué pasó…" />
            <div className="flex flex-col gap-1">
              <Boton variante="primario" tamano="icono" icono={Send} aria-label="Enviar" cargando={enviar.isPending} disabled={!texto.trim() && !archivos.length} onClick={() => enviar.mutate()} />
              <Boton variante="fantasma" tamano="icono" icono={Paperclip} aria-label="Adjuntar" disabled={archivos.length >= 3} onClick={() => entrada.current?.click()} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-28 shrink-0">
              <Selector value={tono} onChange={(e) => setTono(e.target.value as Tono)} className="h-8 rounded-lg px-2 text-xs" aria-label="Tono">
                <option value="amable">Amable</option>
                <option value="firme">Firme</option>
                <option value="formal">Formal</option>
              </Selector>
            </div>
            <div className="w-32 shrink-0">
              <Selector value={medio} onChange={(e) => setMedio(e.target.value as Medio)} className="h-8 rounded-lg px-2 text-xs" aria-label="Medio">
                <option value="whatsapp">WhatsApp</option>
                <option value="correo">Correo</option>
                <option value="llamada">Llamada</option>
                <option value="carta">Carta formal</option>
              </Selector>
            </div>
            <small className="hidden min-w-0 truncate text-[11px] text-tenue sm:block">Fotos, PDF o capturas · hasta 3, 10 MB c/u</small>
          </div>
          <input
            ref={entrada}
            type="file"
            multiple
            accept="image/*,application/pdf,text/plain,.txt"
            className="hidden"
            onChange={(e) => {
              setArchivos((a) => [...a, ...Array.from(e.target.files ?? [])].slice(0, 3));
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </section>
  );
  return (
    <div className="flex h-full min-h-0 flex-col bg-fondo">
      <header className="safe-top flex shrink-0 items-center gap-2 border-b border-borde bg-superficie px-2 py-2 sm:px-3">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Volver" onClick={alSalir} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{d?.caso.titulo ?? "…"}</p>
          <p className="truncate text-xs text-tenue">{[d?.caso.con, d?.caso.monto].filter(Boolean).join(" · ") || "Deudas y pagos"}</p>
        </div>
        <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar caso" onClick={() => void borrar()} />
      </header>
      {!d ? (
        <Cargando />
      ) : ancho ? (
        <div className="flex min-h-0 flex-1">
          {conversacion}
          <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-borde bg-superficie">
            <PanelCaso d={d} />
          </aside>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 gap-1 border-b border-borde bg-superficie p-1">
            {(
              [
                ["conversacion", "Conversación"],
                ["pasos", `Pasos y adjuntos`],
              ] as const
            ).map(([v, t]) => (
              <button key={v} type="button" onClick={() => setVista(v)} className={cx("min-h-10 flex-1 rounded-lg text-sm", vista === v ? "bg-tarjeta text-texto" : "text-tenue")}>
                {t}
              </button>
            ))}
          </div>
          {vista === "conversacion" ? conversacion : <div className="min-h-0 flex-1 overflow-y-auto">{<PanelCaso d={d} />}</div>}
        </>
      )}
    </div>
  );
}

export function Deudas({ abierto, alAbrir, alSalir }: { abierto: string | null; alAbrir: (id: string) => void; alSalir: () => void }) {
  const casos = useCasos();
  const [nuevo, setNuevo] = useState(false);
  const [rapida, setRapida] = useState(false);
  const pagina = usePaginado(casos.data, 6);
  if (abierto) return <CasoAbierto id={abierto} alSalir={alSalir} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-titulo text-lg font-semibold">Tus casos de deudas</h2>
          <p className="text-sm text-tenue">Cuéntale a la IA cómo va cada caso, comparte capturas o PDF y te dice cómo seguir y qué responder.</p>
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={() => setRapida(true)}>
            Consulta rápida
          </Boton>
          <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>
            Nuevo caso
          </Boton>
        </div>
      </div>
      {casos.isLoading ? <Cargando /> : null}
      {!casos.isLoading && !casos.data?.length ? (
        <Vacio icono={HandCoins} texto="Aún no tienes casos. Crea uno para darle seguimiento con la IA." accion={<Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>Nuevo caso</Boton>} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pagina.visibles.map((c) => (
          <TarjetaCaso key={c.id} c={c} alAbrir={() => alAbrir(c.id)} />
        ))}
      </div>
      {pagina.paginas}
      <p className="flex items-start gap-2 text-xs text-tenue">
        <AlertCircle className="h-4 w-4 shrink-0" /> Es orientación general hecha por IA, no es asesoría legal. Confirma con CONDUSEF, PROFECO o un abogado antes de firmar o pagar.
      </p>
      {nuevo ? (
        <NuevoCaso
          alCerrar={() => setNuevo(false)}
          alCreado={(id) => {
            setNuevo(false);
            alAbrir(id);
          }}
        />
      ) : null}
      <Modal abierto={rapida} titulo="Consulta rápida (no se guarda)" alCerrar={() => setRapida(false)} ancho="max-w-5xl">
        <Negociar />
      </Modal>
    </div>
  );
}
