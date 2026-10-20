/** Botón flotante de la IA: chat con el contexto del apartado actual, adjuntos, dictado y lectura en voz alta. */
import type { ModuleId } from "@mi-setup/shared";
import { useMutation } from "@tanstack/react-query";
import { Paperclip, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { HERRAMIENTAS_DIAGNOSTICO, mensajeAnalizar, TarjetaPropuesta, usePropuestas, useUsoIa, type Propuesta, type RespuestaChat } from "../lib/ia";
import { useBotonFlotante, usePreferencias } from "../lib/preferencias";
import { hablar } from "../lib/voz";
import { EntradaIa, type AdjuntoIa } from "./EntradaIa";
import { Boton, ErrorCaja, FaltaConfigurar, avisar, avisarError, cx } from "./ui";

interface Linea {
  rol: "user" | "assistant";
  texto: string;
  adjuntos?: number;
  propuestas?: Propuesta[];
}

export function AsistenteFlotante({ modulo }: { modulo: ModuleId | null }) {
  const [abierto, setAbierto] = useState(false);
  const [conversacion, setConversacion] = useState<string | undefined>();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const fin = useRef<HTMLDivElement>(null);
  const propuestas = usePropuestas();
  const uso = useUsoIa();
  const prefs = usePreferencias();
  const cantidad = (propuestas.data ?? []).filter((p) => p.estado === "pendiente").length;
  const flotante = useBotonFlotante();

  const enviar = useMutation({
    mutationFn: ({ mensaje, adjuntos }: { mensaje: string; adjuntos: AdjuntoIa[] }) =>
      api<RespuestaChat>("/api/ia/chat", {
        metodo: "POST",
        cuerpo: { mensaje, conversacionId: conversacion, modulo: modulo ?? undefined, adjuntos: adjuntos.map(({ nombre, tipo, datos }) => ({ nombre, tipo, datos })) },
      }),
    onMutate: ({ mensaje, adjuntos }) => setLineas((l) => [...l, { rol: "user", texto: mensaje, adjuntos: adjuntos.length }]),
    onSuccess: (r) => {
      setConversacion(r.conversacionId);
      if (r.aviso) avisar(r.aviso, "info");
      setLineas((l) => [...l, { rol: "assistant", texto: r.respuesta || "(sin texto)", propuestas: r.propuestas }]);
      if (prefs.voz.leerRespuestas && r.respuesta) void hablar(r.respuesta, prefs.voz).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ["ia"] });
    },
  });

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [lineas, abierto]);

  // Estado actual de cada propuesta (puede decidirse desde otro dispositivo).
  const estado = new Map((propuestas.data ?? []).map((p) => [p.id, p]));

  return (
    <>
      {flotante.oculto && !abierto ? null : (
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="IA asistente"
        style={flotante.estilo}
        {...flotante.eventos}
        className={cx("fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-acento text-black shadow-lg md:bottom-6", flotante.moviendo && "scale-110 ring-4 ring-acento/40")}
      >
        {abierto ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        {cantidad > 0 && !abierto ? <span className="absolute -right-1 -top-1 rounded-full bg-peligro px-1.5 text-xs font-bold text-white">{cantidad}</span> : null}
      </button>
      )}

      {abierto ? (
        <div className="fixed inset-x-2 bottom-36 z-40 flex max-h-[75vh] flex-col rounded-tarjeta border border-borde bg-superficie shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[26rem] md:bottom-24">
          <header className="flex items-center justify-between border-b border-borde px-4 py-3">
            <div>
              <p className="text-sm font-semibold">IA asistente</p>
              <p className="text-xs text-tenue">Solo propone. Nada se ejecuta sin que toques Aprobar.</p>
            </div>
            <Boton
              tamano="sm"
              variante="fantasma"
              onClick={() => {
                setLineas([]);
                setConversacion(undefined);
              }}
            >
              Nueva
            </Boton>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {uso.data && !uso.data.configurada ? <FaltaConfigurar variable="ANTHROPIC_API_KEY" detalle="La cuenta maestra la pone en Ajustes → Servicios y claves." /> : null}
            {uso.data?.bloqueada ? <p className="rounded-xl bg-aviso/10 p-2 text-xs text-aviso">Se alcanzó el tope mensual ({uso.data.presupuestoUsd} USD).</p> : null}
            {lineas.length === 0 ? (
              <p className="text-sm text-tenue">
                Pídeme algo, por ejemplo: "recuérdame renovar el dominio el viernes a las 10". También puedes adjuntar una captura o un archivo, o dictar con el micrófono.
              </p>
            ) : null}
            {lineas.map((l, i) => (
              <div key={i} className={cx("space-y-2", l.rol === "user" && "text-right")}>
                <div
                  className={cx(
                    "inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm",
                    l.rol === "user" ? "border border-borde bg-fondo" : "bg-tarjeta",
                  )}
                >
                  {l.texto}
                  {l.adjuntos ? (
                    <span className="mt-1 flex items-center gap-1 text-xs text-tenue">
                      <Paperclip className="h-3 w-3" /> {l.adjuntos} archivo(s)
                    </span>
                  ) : null}
                </div>
                {l.rol === "assistant" ? (
                  <button type="button" className="ml-1 text-tenue hover:text-texto" aria-label="Leer en voz alta" onClick={() => void hablar(l.texto, prefs.voz).catch(avisarError)}>
                    <Volume2 className="inline h-3.5 w-3.5" />
                  </button>
                ) : null}
                {l.propuestas?.map((p) => (
                  <TarjetaPropuesta
                    key={p.id}
                    p={estado.get(p.id) ?? p}
                    alAnalizar={HERRAMIENTAS_DIAGNOSTICO.has(p.herramienta) && !enviar.isPending ? () => enviar.mutate({ mensaje: mensajeAnalizar(p), adjuntos: [] }) : undefined}
                  />
                ))}
              </div>
            ))}
            {enviar.isPending ? <p className="text-sm text-tenue">Pensando…</p> : null}
            {enviar.error ? <ErrorCaja error={enviar.error} /> : null}
            <div ref={fin} />
          </div>
          <div className="border-t border-borde p-3">
            <EntradaIa compacta cargando={enviar.isPending} alEnviar={(mensaje, adjuntos) => enviar.mutate({ mensaje, adjuntos })} />
          </div>
        </div>
      ) : null}
    </>
  );
}
