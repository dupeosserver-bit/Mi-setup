/** IA del día a día: deudas y negociaciones, detector de texto de IA y «hacer más natural». */
import { useMutation } from "@tanstack/react-query";
import { Copy, HandCoins, Scale, ScanSearch, Share2, Wand2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { compartirConApps } from "../lib/compartir";
import { AreaTexto, Boton, Campo, Entrada, Interruptor, Selector, Tarjeta, avisar, avisarError, cx } from "./ui";

interface Negociacion {
  resumen: string;
  derechos: { texto: string; fuente: string }[];
  plan: string[];
  mensaje: string;
  siResponde: { si: string; dile: string }[];
  cuidado: string[];
  aviso: string;
}

async function copiarOCompartir(texto: string, compartir = false): Promise<void> {
  if (compartir) {
    const r = await compartirConApps({ titulo: "Mensaje", texto }).catch(() => "error" as const);
    if (r === "compartido") return;
    if (r === "copiado") return avisar("Copiado");
  }
  await navigator.clipboard.writeText(texto);
  avisar("Copiado");
}

export function ResultadoNegociacion({ r }: { r: Negociacion }) {
  return (
    <div className="space-y-3">
      <Tarjeta titulo="Mensaje listo para mandar" icono={HandCoins}>
        <p className="whitespace-pre-wrap rounded-xl bg-fondo p-3 text-sm">{r.mensaje}</p>
        <div className="mt-2 flex gap-2">
          <Boton tamano="sm" icono={Copy} onClick={() => void copiarOCompartir(r.mensaje)}>
            Copiar
          </Boton>
          <Boton tamano="sm" icono={Share2} onClick={() => void copiarOCompartir(r.mensaje, true)}>
            Compartir
          </Boton>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Lo que pasa y qué hacer" icono={Scale}>
        <p className="text-sm">{r.resumen}</p>
        {r.plan.length ? (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {r.plan.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        ) : null}
        {r.derechos.length ? (
          <>
            <p className="mt-3 text-sm font-medium">Tus derechos</p>
            <ul className="mt-1 space-y-1 text-sm">
              {r.derechos.map((d) => (
                <li key={d.texto}>
                  {d.texto} <span className="text-xs text-tenue">({d.fuente})</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {r.siResponde.length ? (
          <>
            <p className="mt-3 text-sm font-medium">Si te contestan…</p>
            <ul className="mt-1 space-y-1 text-sm">
              {r.siResponde.map((s) => (
                <li key={s.si}>
                  <b>{s.si}:</b> {s.dile}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {r.cuidado.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-aviso">
            {r.cuidado.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 rounded-xl bg-fondo p-2 text-xs text-tenue">{r.aviso}</p>
      </Tarjeta>
    </div>
  );
}

/** Deudas, cobros y negociaciones: derechos, plan y el mensaje escrito como persona. */
export function Negociar() {
  const [f, setF] = useState({ tipo: "debo" as "debo" | "me_deben" | "negociar", situacion: "", con: "", monto: "", objetivo: "", tono: "amable" as "amable" | "firme" | "formal", medio: "whatsapp" as "whatsapp" | "correo" | "llamada" | "carta" });
  const pedir = useMutation({ mutationFn: () => api<Negociacion>("/api/ia/negociar", { cuerpo: f }), onError: avisarError });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Tarjeta titulo="Cuéntame qué pasa" icono={Scale}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            pedir.mutate();
          }}
        >
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["debo", "Debo dinero"],
                ["me_deben", "Me deben"],
                ["negociar", "Quiero negociar"],
              ] as const
            ).map(([id, texto]) => (
              <button key={id} type="button" onClick={() => setF({ ...f, tipo: id })} className={cx("rounded-full border px-3 py-1 text-xs", f.tipo === id ? "border-acento bg-acento text-black" : "border-borde")}>
                {texto}
              </button>
            ))}
          </div>
          <Campo etiqueta="¿Qué pasa?">
            <AreaTexto
              rows={5}
              value={f.situacion}
              onChange={(e) => setF({ ...f, situacion: e.target.value })}
              maxLength={4000}
              placeholder={f.tipo === "debo" ? "Ej. Debo 8,000 de una tarjeta Coppel, me llaman diario y me ofrecen un descuento…" : f.tipo === "me_deben" ? "Ej. Le presté 3,000 a un amigo hace 4 meses y no me paga…" : "Ej. Quiero que me bajen la renta o pagar a plazos…"}
              required
            />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Con quién">
              <Entrada value={f.con} onChange={(e) => setF({ ...f, con: e.target.value })} placeholder="Banco, tienda, persona…" maxLength={120} />
            </Campo>
            <Campo etiqueta="Monto">
              <Entrada value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} placeholder="$8,000" maxLength={60} />
            </Campo>
          </div>
          <Campo etiqueta="Qué quieres lograr">
            <Entrada value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} placeholder="Pagar en 6 meses sin intereses, que dejen de llamar…" maxLength={500} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Selector value={f.tono} onChange={(e) => setF({ ...f, tono: e.target.value as typeof f.tono })}>
              <option value="amable">Tono amable</option>
              <option value="firme">Tono firme</option>
              <option value="formal">Tono formal</option>
            </Selector>
            <Selector value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value as typeof f.medio })}>
              <option value="whatsapp">Por WhatsApp</option>
              <option value="correo">Por correo</option>
              <option value="llamada">Para decir por teléfono</option>
              <option value="carta">Carta formal</option>
            </Selector>
          </div>
          <Boton type="submit" variante="primario" icono={Wand2} cargando={pedir.isPending} disabled={f.situacion.trim().length < 10}>
            Ayúdame
          </Boton>
          <p className="text-xs text-tenue">La IA se basa en leyes de México (PROFECO, CONDUSEF, reglas de cobranza) pero puede equivocarse: confírmalo antes de firmar o pagar.</p>
        </form>
      </Tarjeta>
      <div>{pedir.data ? <ResultadoNegociacion r={pedir.data} /> : null}</div>
    </div>
  );
}

/** ¿Lo escribió una IA? (estimación) */
export function DetectorIa() {
  const [texto, setTexto] = useState("");
  const [conIa, setConIa] = useState(true);
  const detectar = useMutation({
    mutationFn: () => api<{ probabilidad: number; senales: string[]; frases: string[]; explicacion: string | null; soloSenales: boolean }>("/api/ia/detectar", { cuerpo: { texto, conIa } }),
    onError: avisarError,
  });
  const r = detectar.data;
  return (
    <Tarjeta titulo="¿Lo escribió una IA?" icono={ScanSearch}>
      <AreaTexto rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pega aquí el texto (al menos un párrafo)…" maxLength={12000} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Boton variante="primario" icono={ScanSearch} cargando={detectar.isPending} disabled={texto.trim().length < 80} onClick={() => detectar.mutate()}>
          Revisar
        </Boton>
        <Interruptor activo={conIa} alCambiar={setConIa} etiqueta="Usar también la IA (más preciso)" />
      </div>
      {r ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-fondo">
              <div className={cx("h-full", r.probabilidad >= 70 ? "bg-peligro" : r.probabilidad >= 40 ? "bg-aviso" : "bg-ok")} style={{ width: `${r.probabilidad}%` }} />
            </div>
            <span className="text-sm font-semibold">{r.probabilidad} % IA</span>
          </div>
          {r.explicacion ? <p className="text-sm">{r.explicacion}</p> : null}
          {r.senales.length ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-tenue">
              {r.senales.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
          {r.frases.length ? (
            <div className="rounded-xl bg-fondo p-2 text-xs">
              <p className="mb-1 font-medium">Frases que suenan a IA:</p>
              {r.frases.map((f) => (
                <p key={f} className="italic">
                  «{f}»
                </p>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-tenue">Ningún detector es seguro (tampoco los de las escuelas): úsalo como pista, no como prueba.</p>
        </div>
      ) : null}
    </Tarjeta>
  );
}

/** Reescribe un texto tuyo para que suene natural, como lo dirías tú. */
export function HacerNatural() {
  const [texto, setTexto] = useState("");
  const [tono, setTono] = useState<"casual" | "neutro" | "formal">("neutro");
  const [regional, setRegional] = useState(true);
  const pedir = useMutation({ mutationFn: () => api<{ texto: string; antes: number; despues: number }>("/api/ia/humanizar", { cuerpo: { texto, tono, regional } }), onError: avisarError });
  return (
    <Tarjeta titulo="Hacer más natural" icono={Wand2}>
      <AreaTexto rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pega tu texto (un mensaje, un correo, una publicación)…" maxLength={12000} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Selector className="w-auto" value={tono} onChange={(e) => setTono(e.target.value as typeof tono)}>
          <option value="casual">Casual</option>
          <option value="neutro">Normal</option>
          <option value="formal">Formal</option>
        </Selector>
        <Interruptor activo={regional} alCambiar={setRegional} etiqueta="Español de México" />
        <Boton variante="primario" icono={Wand2} cargando={pedir.isPending} disabled={texto.trim().length < 20} onClick={() => pedir.mutate()}>
          Reescribir
        </Boton>
      </div>
      {pedir.data ? (
        <div className="mt-3 space-y-2">
          <p className="whitespace-pre-wrap rounded-xl bg-fondo p-3 text-sm">{pedir.data.texto}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Boton tamano="sm" icono={Copy} onClick={() => void copiarOCompartir(pedir.data.texto)}>
              Copiar
            </Boton>
            <span className="text-xs text-tenue">
              Señales de IA: {pedir.data.antes} % antes → {pedir.data.despues} % ahora
            </span>
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-tenue">Para tus propios textos: mantiene lo que dices y cambia cómo suena. No inventa datos.</p>
    </Tarjeta>
  );
}
