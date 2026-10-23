import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Globe, Plug, Plus, Radar, Server, Siren, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { usePaginado } from "../components/Paginas";
import { Boton, Campo, Encabezado, Entrada, ErrorCaja, Interruptor, Modal, Selector, Tarjeta, Vacio, avisarError, cx } from "../components/ui";
import { BotonTerminal, SUAVE } from "../components/vps/piezas";
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

const texto = (estado: string) => (estado === "arriba" ? "En línea" : estado === "caido" ? "Caído" : "Sin revisar");

function Estado({ estado }: { estado: string }) {
  const tono = estado === "arriba" ? "ok" : estado === "caido" ? "peligro" : "neutro";
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", SUAVE[tono])}>
      <span className={cx("h-1.5 w-1.5 rounded-full", estado === "arriba" ? "bg-ok" : estado === "caido" ? "bg-peligro" : "bg-tenue")} />
      {texto(estado)}
    </span>
  );
}

function Limite({ etiqueta, valor, editable, alGuardar }: { etiqueta: string; valor: number | null | undefined; editable: boolean; alGuardar: (v: number | null) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-tenue">
      {etiqueta}
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        disabled={!editable}
        defaultValue={valor ?? ""}
        placeholder="—"
        onBlur={(e) => alGuardar(e.target.value === "" ? null : Math.min(100, Math.max(1, Number(e.target.value))))}
        className="h-8 w-14 rounded-lg border border-borde bg-superficie px-2 text-center text-texto focus:border-acento focus:outline-none"
      />
      %
    </label>
  );
}

function FilaServidor({ s, editable }: { s: Servidor; editable: boolean }) {
  const guardar = (cuerpo: Record<string, unknown>) =>
    api(`/api/vps/servidores/${s.id}/alertas`, { metodo: "PATCH", cuerpo })
      .then(() => queryClient.invalidateQueries({ queryKey: ["vps", "servidores"] }))
      .catch(avisarError);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-borde bg-fondo p-3 text-sm">
      <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", SUAVE.acento)}>
        <Server className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-[10rem] flex-1">
        <p className="font-semibold">{s.nombre}</p>
        <p className="truncate text-xs text-tenue">
          {s.host}:{s.puerto} · revisado {haceCuanto(s.ultimaRevision)}
        </p>
      </div>
      <Estado estado={s.estado} />
      <div className="flex flex-wrap items-center gap-3">
        <Limite etiqueta="Procesador" valor={s.umbralCpu} editable={editable} alGuardar={(v) => void guardar({ umbralCpu: v })} />
        <Limite etiqueta="Memoria" valor={s.umbralRam} editable={editable} alGuardar={(v) => void guardar({ umbralRam: v })} />
        <Limite etiqueta="Disco" valor={s.umbralDisco} editable={editable} alGuardar={(v) => void guardar({ umbralDisco: v })} />
      </div>
      <Interruptor activo={s.alertas} alCambiar={(v) => editable && void guardar({ alertas: v })} etiqueta="Vigilar" />
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
      <Campo etiqueta="Qué vigilar">
        <Selector value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as "tcp" | "http" })}>
          <option value="http">Una página web</option>
          <option value="tcp">Un servidor y su puerto</option>
        </Selector>
      </Campo>
      <Campo etiqueta={d.tipo === "http" ? "Dirección de la página" : "Servidor (nombre o IP)"}>
        <Entrada value={d.destino} onChange={(e) => setD({ ...d, destino: e.target.value })} required placeholder={d.tipo === "http" ? "https://panel.ejemplo.net" : "play.ejemplo.net"} />
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

function Resumen({ servidores, monitores }: { servidores: Servidor[]; monitores: Monitor[] }) {
  const todos = [...servidores.map((s) => ({ nombre: s.nombre, estado: s.estado, revision: s.ultimaRevision, id: s.id, esServidor: true })), ...monitores.map((m) => ({ nombre: m.nombre, estado: m.estado, revision: m.ultimaRevision, id: m.id, esServidor: false }))];
  if (todos.length === 0) return null;
  const caidos = todos.filter((x) => x.estado === "caido");
  const arriba = todos.filter((x) => x.estado === "arriba").length;
  const primero = caidos[0];
  const malo = caidos.length > 0;
  return (
    <section
      className={cx(
        "mb-4 flex flex-wrap items-center gap-4 rounded-tarjeta border p-4",
        malo
          ? "border-[color-mix(in_srgb,var(--error)_45%,transparent)] bg-[color-mix(in_srgb,var(--error)_9%,var(--superficie))]"
          : "border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color-mix(in_srgb,var(--ok)_7%,var(--superficie))]",
      )}
    >
      <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", malo ? SUAVE.peligro : SUAVE.ok)}>
        {malo ? <CircleAlert className="h-5 w-5" /> : <CircleCheck className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold">{malo ? (caidos.length === 1 ? "1 cosa caída" : `${caidos.length} cosas caídas`) : "Todo en orden"}</p>
        <p className="text-sm text-tenue">
          {`${arriba} de ${todos.length} en línea${primero ? ` · ${primero.nombre} no responde desde ${haceCuanto(primero.revision)}` : ""}`}
        </p>
      </div>
      {primero?.esServidor ? <BotonTerminal servidor={primero.id} texto="Revisar en la terminal" /> : null}
    </section>
  );
}

export default function VpsAlertas() {
  const servidores = useServidores();
  const editable = usePuede("vps_alertas", "escritura");
  const [nuevo, setNuevo] = useState(false);
  const monitores = useQuery({ queryKey: ["vps", "monitores"], queryFn: () => api<Monitor[]>("/api/vps/monitores"), refetchInterval: 30_000 });
  const pgMon = usePaginado(monitores.data, 12);

  const quitar = (m: Monitor) =>
    void api(`/api/vps/monitores/${m.id}`, { metodo: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: ["vps", "monitores"] }), avisarError);

  return (
    <>
      <Encabezado
        titulo="Alertas de caída"
        descripcion="Se revisa cada 60 s. Te avisamos cuando algo se cae o vuelve, o cuando la memoria o el disco pasan tu límite."
        acciones={editable ? <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>Monitor</Boton> : null}
      />
      <Resumen servidores={servidores.data ?? []} monitores={monitores.data ?? []} />
      <div className="space-y-4">
        <Tarjeta titulo="Tus servidores" icono={Siren} acciones={<span className="text-xs text-tenue">Avisa si pasa del límite que pongas</span>}>
          <ErrorCaja error={servidores.error} />
          {servidores.data?.length ? (
            <ul className="space-y-2">{servidores.data.map((s) => <FilaServidor key={s.id} s={s} editable={editable} />)}</ul>
          ) : (
            <Vacio icono={Siren} texto="Agrega un servidor en Terminal." />
          )}
        </Tarjeta>
        <Tarjeta
          titulo={
            <>
              Monitores
              {monitores.data?.length ? <span className="rounded-md bg-tarjeta px-1.5 py-0.5 text-xs text-tenue">{monitores.data.length}</span> : null}
            </>
          }
          icono={Radar}
        >
          <ErrorCaja error={monitores.error} />
          {monitores.data?.length ? (
            <>
              <ul className="space-y-2">
                {pgMon.visibles.map((m) => {
                  const Icono = m.tipo === "http" ? Globe : Plug;
                  return (
                    <li key={m.id} className="flex items-center gap-3 rounded-xl border border-borde bg-fondo p-3 text-sm">
                      <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", SUAVE.acento)}>
                        <Icono className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{m.nombre}</p>
                        <p className="truncate text-xs text-tenue">
                          {m.tipo === "http" ? "Página web" : "Servidor"} · {m.tipo === "http" ? m.destino : `${m.destino}:${m.puerto}`}
                          {m.latenciaMs ? ` · ${m.latenciaMs} ms` : ""} · {haceCuanto(m.ultimaRevision)}
                        </p>
                      </div>
                      <Estado estado={m.estado} />
                      {editable ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar" onClick={() => quitar(m)} /> : null}
                    </li>
                  );
                })}
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
