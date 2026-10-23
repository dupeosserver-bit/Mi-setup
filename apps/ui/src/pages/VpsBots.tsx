/** Bots de Discord en el VPS: estado y reinicio. */
import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Plus, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Selector, Vacio, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { useServidores } from "../lib/vps";

interface BotVps {
  id: string;
  nombre: string;
  servidorId: string;
  tipo: "systemd" | "pm2" | "docker";
  objetivo: string;
}

function Estado({ bot }: { bot: BotVps }) {
  const q = useQuery({
    queryKey: ["vps", "bots", bot.id, "estado"],
    queryFn: () => api<{ estado: string; activo: boolean }>(`/api/vps/bots/${bot.id}/estado`),
    refetchInterval: 60_000,
    retry: false,
  });
  if (q.isLoading) return <Insignia>revisando…</Insignia>;
  if (q.error) return <Insignia tono="aviso">sin respuesta</Insignia>;
  return <Insignia tono={q.data?.activo ? "ok" : "peligro"}>{q.data?.estado}</Insignia>;
}

function NuevoBot({ alTerminar }: { alTerminar: () => void }) {
  const servidores = useServidores();
  const [d, setD] = useState({ nombre: "", servidorId: "", tipo: "systemd" as BotVps["tipo"], objetivo: "" });
  const crear = useMutation({
    mutationFn: () => api("/api/vps/bots", { cuerpo: { ...d, servidorId: d.servidorId || servidores.data?.[0]?.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vps", "bots"] });
      alTerminar();
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        crear.mutate();
      }}
    >
      <Campo etiqueta="Nombre">
        <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required placeholder="Bot de tickets" />
      </Campo>
      <Campo etiqueta="Servidor">
        <Selector value={d.servidorId} onChange={(e) => setD({ ...d, servidorId: e.target.value })}>
          {servidores.data?.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Se ejecuta como">
        <Selector value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as BotVps["tipo"] })}>
          <option value="systemd">Servicio systemd</option>
          <option value="pm2">Proceso pm2</option>
          <option value="docker">Contenedor Docker</option>
        </Selector>
      </Campo>
      <Campo etiqueta="Nombre del servicio, proceso o contenedor">
        <Entrada value={d.objetivo} onChange={(e) => setD({ ...d, objetivo: e.target.value })} required placeholder="bot-tickets" />
      </Campo>
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" cargando={crear.isPending}>Agregar</Boton>
    </form>
  );
}

export default function VpsBots() {
  const esAdmin = usePuede("vps_bots", "administrar");
  const puedeReiniciar = usePuede("vps_bots", "escritura");
  const servidores = useServidores();
  const [nuevo, setNuevo] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["vps", "bots"], queryFn: () => api<BotVps[]>("/api/vps/bots") });

  const reiniciar = async (b: BotVps) => {
    if (!(await confirmar({ titulo: "Reiniciar bot", mensaje: `¿Reiniciar ${b.nombre} (${b.tipo}: ${b.objetivo})?`, boton: "Reiniciar" }))) return;
    try {
      await api(`/api/vps/bots/${b.id}/reiniciar`, { metodo: "POST" });
      avisar(`${b.nombre} reiniciado`);
      await queryClient.invalidateQueries({ queryKey: ["vps", "bots", b.id] });
    } catch (err) {
      avisarError(err);
    }
  };

  const pgBots = usePaginado(data, 12);
  return (
    <>
      <Encabezado
        titulo="Bots de Discord"
        acciones={
          <>
            <Boton icono={RefreshCw} onClick={() => void queryClient.invalidateQueries({ queryKey: ["vps", "bots"] })}>Actualizar</Boton>
            {esAdmin ? <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)} disabled={!servidores.data?.length}>Bot</Boton> : null}
          </>
        }
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      {data?.length === 0 ? <Vacio icono={Bot} texto="Agrega tus bots (servicio, pm2 o contenedor) para verlos y reiniciarlos." /> : null}
      <ul className="space-y-2">
        {pgBots.visibles.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3 text-sm">
            <Bot className="h-5 w-5 text-tenue" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{b.nombre}</p>
              <p className="text-xs text-tenue">
                {b.tipo} · {b.objetivo} · {servidores.data?.find((s) => s.id === b.servidorId)?.nombre ?? "servidor"}
              </p>
            </div>
            <Estado bot={b} />
            {puedeReiniciar ? <Boton tamano="sm" icono={RotateCw} onClick={() => void reiniciar(b)}>Reiniciar</Boton> : null}
            {esAdmin ? (
              <Boton
                tamano="icono"
                variante="fantasma"
                icono={Trash2}
                aria-label="Quitar"
                onClick={() => void api(`/api/vps/bots/${b.id}`, { metodo: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: ["vps", "bots"] }), avisarError)}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {pgBots.paginas}
      <Modal abierto={nuevo} titulo="Nuevo bot" alCerrar={() => setNuevo(false)}>
        <NuevoBot alTerminar={() => setNuevo(false)} />
      </Modal>
    </>
  );
}
