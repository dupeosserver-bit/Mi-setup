/** Botón flotante de la IA: abre un panel de chat con el contexto del apartado actual. */
import type { ModuleId } from "@mi-setup/shared";
import { useMutation } from "@tanstack/react-query";
import { Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { TarjetaPropuesta, usePropuestas, useUsoIa, type Propuesta, type RespuestaChat } from "../lib/ia";
import { AreaTexto, Boton, ErrorCaja, FaltaConfigurar, cx } from "./ui";

interface Linea {
  rol: "user" | "assistant";
  texto: string;
  propuestas?: Propuesta[];
}

export function AsistenteFlotante({ modulo }: { modulo: ModuleId | null }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [conversacion, setConversacion] = useState<string | undefined>();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const fin = useRef<HTMLDivElement>(null);
  const propuestas = usePropuestas();
  const uso = useUsoIa();
  const cantidad = (propuestas.data ?? []).filter((p) => p.estado === "pendiente").length;

  const enviar = useMutation({
    mutationFn: (mensaje: string) =>
      api<RespuestaChat>("/api/ia/chat", { metodo: "POST", cuerpo: { mensaje, conversacionId: conversacion, modulo: modulo ?? undefined } }),
    onMutate: (mensaje) => setLineas((l) => [...l, { rol: "user", texto: mensaje }]),
    onSuccess: (r) => {
      setConversacion(r.conversacionId);
      setLineas((l) => [...l, { rol: "assistant", texto: r.respuesta || "(sin texto)", propuestas: r.propuestas }]);
      void queryClient.invalidateQueries({ queryKey: ["ia"] });
    },
  });

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [lineas, abierto]);

  // Estado actual de cada propuesta (puede decidirse desde otro dispositivo).
  const estado = new Map((propuestas.data ?? []).map((p) => [p.id, p]));

  const mandar = () => {
    const m = texto.trim();
    if (!m || enviar.isPending) return;
    setTexto("");
    enviar.mutate(m);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="IA asistente"
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-acento text-black shadow-lg md:bottom-6"
      >
        {abierto ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        {cantidad > 0 && !abierto ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-peligro px-1.5 text-xs font-bold text-white">{cantidad}</span>
        ) : null}
      </button>

      {abierto ? (
        <div className="fixed inset-x-2 bottom-36 z-40 flex max-h-[70vh] flex-col rounded-tarjeta border border-borde bg-superficie shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96 md:bottom-24">
          <header className="flex items-center justify-between border-b border-borde px-4 py-3">
            <div>
              <p className="text-sm font-semibold">IA asistente</p>
              <p className="text-xs text-tenue">Solo propone. Nada se ejecuta sin que toques Aprobar.</p>
            </div>
            <Boton tamano="sm" variante="fantasma" onClick={() => { setLineas([]); setConversacion(undefined); }}>
              Nueva
            </Boton>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {uso.data && !uso.data.configurada ? <FaltaConfigurar variable="ANTHROPIC_API_KEY" /> : null}
            {uso.data?.bloqueada ? (
              <p className="rounded-xl bg-aviso/10 p-2 text-xs text-aviso">Se alcanzó el tope mensual ({uso.data.presupuestoUsd} USD).</p>
            ) : null}
            {lineas.length === 0 ? <p className="text-sm text-tenue">Pídeme algo, por ejemplo: "recuérdame renovar el dominio el viernes a las 10".</p> : null}
            {lineas.map((l, i) => (
              <div key={i} className={cx("space-y-2", l.rol === "user" && "text-right")}>
                <p className={cx("inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm", l.rol === "user" ? "bg-acento/15" : "bg-tarjeta")}>
                  {l.texto}
                </p>
                {l.propuestas?.map((p) => <TarjetaPropuesta key={p.id} p={estado.get(p.id) ?? p} />)}
              </div>
            ))}
            {enviar.isPending ? <p className="text-sm text-tenue">Pensando…</p> : null}
            {enviar.error ? <ErrorCaja error={enviar.error} /> : null}
            <div ref={fin} />
          </div>
          <div className="flex items-end gap-2 border-t border-borde p-3">
            <AreaTexto
              rows={2}
              value={texto}
              placeholder="Escribe tu mensaje…"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  mandar();
                }
              }}
            />
            <Boton variante="primario" tamano="icono" icono={Send} aria-label="Enviar" cargando={enviar.isPending} onClick={mandar} />
          </div>
        </div>
      ) : null}
    </>
  );
}
