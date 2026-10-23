/** Alertas de caída: estado de VPS y monitores (revisión cada 60 s, aviso push al cambiar). */
import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Radar, Siren, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Boton, Campo, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Selector, Tarjeta, Vacio, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { useServidores, type Servidor } from "../lib/vps";

interface Monitor {
  id: string;
  nombre: string;
  tipo: "tcp" | "http";
  destino: string;
  puerto: number | null;
  estado: string;
  latenciaMs: number | null;
  ultimaRevision: string | null;
}

const tono = (estado: string) => (estado === "arriba" ? "ok" : estado === "caido" ? "peligro" : "neutro") as "ok" | "peligro" | "neutro";
const texto = (estado: string) => (estado === "arriba" ? "En línea" : estado === "caido" ? "Caído" : "Sin revisar");

function FilaServidor({ s, editable }: { s: Servidor; editable: boolean }) {
  const guardar = (cuerpo: Record<string, unknown>) =>
    api(`/api/vps/servidores/${s.id}/alertas`, { metodo: "PATCH", cuerpo })
      .then(() => queryClient.invalidateQueries({ queryKey: ["vps", "servidores"] }))
      .catch(avisarError);
  const umbral = (v: string) => (v === "" ? null : Math.min(100, Math.max(1, Number(v))));
  return (
    <li className="grid items-center gap-3 rounded-xl bg-fondo p-3 text-sm sm:grid-cols-[1fr_auto_auto_auto]">
      <div className="min-w-0">
        <p className="font-medium">{s.nombre}</p>
        <p className="text-xs text-tenue">
          {s.host}:{s.puerto} · revisado {haceCuanto(s.ultimaRevision)}
        </p>
      </div>
      <Insignia tono={tono(s.estado)}>{texto(s.estado)}</Insignia>
      <Interruptor activo={s.alertas} alCambiar={(v) => editable && void guardar({ alertas: v })} etiqueta="Vigilar" />
      <div className="flex flex-wrap items-center gap-2 text-xs text-tenue">
        CPU %
        <input
          type="number"
          disabled={!editable}
          defaultValue={s.umbralCpu ?? ""}
          onBlur={(e) => void guardar({ umbralCpu: umbral(e.target.value) })}
          className="h-8 w-16 rounded-lg border border-borde bg-superficie px-2 text-texto"
        />
        RAM %
        <input
          type="number"
          disabled={!editable}
          defaultValue={s.umbralRam ?? ""}
          onBlur={(e) => void guardar({ umbralRam: umbral(e.target.value) })}
          className="h-8 w-16 rounded-lg border border-borde bg-superficie px-2 text-texto"
        />
        Disco %
        <input
          type="number"
          disabled={!editable}
          defaultValue={s.umbralDisco ?? ""}
          onBlur={(e) => void guardar({ umbralDisco: umbral(e.target.value) })}
          className="h-8 w-16 rounded-lg border border-borde bg-superficie px-2 text-texto"
        />
      </div>
    </li>
  );
}

function NuevoMonitor({ alTerminar }: { alTerminar: () => void }) {
  const [d, setD] = useState({ nombre: "", tipo: "http" as "tcp" | "http", destino: "", puerto: "" });
  const crear = useMutation({
    mutationFn: () =>
      api("/api/vps/monitores", { cuerpo: { nombre: d.nombre, tipo: d.tipo, destino: d.destino, puerto: d.tipo === "tcp" ? Number(d.puerto) : null } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vps", "monitores"] });
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
        <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required placeholder="Servidor de Minecraft" />
      </Campo>
      <Campo etiqueta="Tipo">
        <Selector value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as "tcp" | "http" })}>
          <option value="http">HTTP (página web)</option>
          <option value="tcp">TCP (host y puerto)</option>
        </Selector>
      </Campo>
      <Campo etiqueta={d.tipo === "http" ? "URL" : "Host o IP"}>
        <Entrada value={d.destino} onChange={(e) => setD({ ...d, destino: e.target.value })} required placeholder={d.tipo === "http" ? "https://panel.mexicanland.org" : "play.mexicanland.net"} />
      </Campo>
      {d.tipo === "tcp" ? (
        <Campo etiqueta="Puerto">
          <Entrada type="number" value={d.puerto} onChange={(e) => setD({ ...d, puerto: e.target.value })} required min={1} max={65535} />
        </Campo>
      ) : null}
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" cargando={crear.isPending}>Agregar</Boton>
    </form>
  );
}

export default function VpsAlertas() {
  const servidores = useServidores();
  const editable = usePuede("vps_alertas", "escritura");
  const [nuevo, setNuevo] = useState(false);
  const monitores = useQuery({ queryKey: ["vps", "monitores"], queryFn: () => api<Monitor[]>("/api/vps/monitores"), refetchInterval: 30_000 });

  const pgMon = usePaginado(monitores.data, 12);
  return (
    <>
      <Encabezado
        titulo="Alertas de caída"
        descripcion="Se revisa cada 60 s. Recibes un aviso push cuando algo cae o vuelve, o cuando RAM o disco pasan el umbral."
        acciones={editable ? <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>Monitor</Boton> : null}
      />
      <div className="space-y-4">
        <Tarjeta titulo="VPS" icono={Siren}>
          <ErrorCaja error={servidores.error} />
          {servidores.data?.length ? (
            <ul className="space-y-2">{servidores.data.map((s) => <FilaServidor key={s.id} s={s} editable={editable} />)}</ul>
          ) : (
            <Vacio icono={Siren} texto="Agrega un servidor en Terminal." />
          )}
        </Tarjeta>
        <Tarjeta titulo="Monitores (servidores de juego, webs…)" icono={Radar}>
          <ErrorCaja error={monitores.error} />
          {monitores.data?.length ? (
            <>
            <ul className="space-y-2">
              {pgMon.visibles.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl bg-fondo p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{m.nombre}</p>
                    <p className="truncate text-xs text-tenue">
                      {m.tipo.toUpperCase()} · {m.tipo === "http" ? m.destino : `${m.destino}:${m.puerto}`} · {m.latenciaMs ? `${m.latenciaMs} ms · ` : ""}
                      {haceCuanto(m.ultimaRevision)}
                    </p>
                  </div>
                  <Insignia tono={tono(m.estado)}>{texto(m.estado)}</Insignia>
                  {editable ? (
                    <Boton
                      tamano="icono"
                      variante="fantasma"
                      icono={Trash2}
                      aria-label="Quitar"
                      onClick={() => void api(`/api/vps/monitores/${m.id}`, { metodo: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: ["vps", "monitores"] }), avisarError)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            {pgMon.paginas}
            </>
          ) : (
            <Vacio icono={Radar} texto="Agrega monitores para tus servidores de juego o páginas." />
          )}
        </Tarjeta>
      </div>
      <Modal abierto={nuevo} titulo="Nuevo monitor" alCerrar={() => setNuevo(false)}>
        <NuevoMonitor alTerminar={() => setNuevo(false)} />
      </Modal>
    </>
  );
}
