/** Discord: enviar mensajes con el bot a los canales elegidos. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, ErrorCaja, FaltaConfigurar, Selector, Tarjeta, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { usePuede } from "../lib/consultas";

interface CanalDiscord {
  id: string;
  nombre: string;
  servidor: string;
}

export default function Discord() {
  const puede = usePuede("discord", "escritura");
  const datos = useQuery({
    queryKey: ["redes", "discord"],
    queryFn: () => api<{ configurado: boolean; canales: CanalDiscord[] }>("/api/discord/canales"),
  });
  const [canal, setCanal] = useState("");
  const [texto, setTexto] = useState("");
  const elegido = datos.data?.canales.find((c) => c.id === canal);

  const enviar = useMutation({
    mutationFn: async () => {
      const ok = await confirmar({
        titulo: "Enviar a Discord",
        mensaje: `Se enviará a ${elegido?.servidor} #${elegido?.nombre}. Las menciones masivas (@everyone, roles) se desactivan.`,
        detalle: texto,
        boton: "Enviar",
      });
      if (!ok) return null;
      return api("/api/discord/enviar", { metodo: "POST", cuerpo: { canalId: canal, texto } });
    },
    onSuccess: (r) => {
      if (!r) return;
      setTexto("");
      avisar("Mensaje enviado");
    },
    onError: avisarError,
  });

  const servidores = [...new Set((datos.data?.canales ?? []).map((c) => c.servidor))];
  return (
    <div className="space-y-4">
      <Encabezado titulo="Discord" descripcion="Mensajes con tu bot. La IA puede redactarlos; se envían solo cuando apruebas." />
      {datos.isLoading ? <Cargando /> : null}
      <ErrorCaja error={datos.error} />
      {datos.data && !datos.data.configurado ? <FaltaConfigurar variable="DISCORD_BOT_TOKEN" /> : null}
      {datos.data?.configurado ? (
        <Tarjeta titulo="Nuevo mensaje">
          <div className="space-y-3">
            <Campo etiqueta="Canal">
              <Selector value={canal} onChange={(e) => setCanal(e.target.value)}>
                <option value="">Elige un canal…</option>
                {servidores.map((s) => (
                  <optgroup key={s} label={s}>
                    {datos.data.canales
                      .filter((c) => c.servidor === s)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.nombre}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Mensaje">
              <AreaTexto rows={5} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!puede} />
            </Campo>
            {puede ? (
              <Boton variante="primario" icono={Send} disabled={!canal || !texto.trim()} cargando={enviar.isPending} onClick={() => enviar.mutate()}>
                Enviar
              </Boton>
            ) : null}
          </div>
        </Tarjeta>
      ) : null}
    </div>
  );
}
