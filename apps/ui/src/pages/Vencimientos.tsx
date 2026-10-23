/** Vencimientos de dominios (RDAP), certificados SSL y VPS, con aviso anticipado. */
import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Globe, Lock, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Selector, Vacio, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtFecha, haceCuanto } from "../lib/formato";

interface Vencimiento {
  id: string;
  tipo: "dominio" | "ssl" | "vps";
  nombre: string;
  objetivo: string;
  fecha: string | null;
  dias: number | null;
  avisarDias: number;
  ultimaRevision: string | null;
  error: string | null;
}

const ICONOS = { dominio: Globe, ssl: Lock, vps: Server } as const;

function Nuevo({ alTerminar }: { alTerminar: () => void }) {
  const [d, setD] = useState({ tipo: "dominio" as Vencimiento["tipo"], nombre: "", objetivo: "", fecha: "", avisarDias: 14 });
  const crear = useMutation({
    mutationFn: () =>
      api("/api/vencimientos", {
        cuerpo: { tipo: d.tipo, nombre: d.nombre || d.objetivo, objetivo: d.objetivo, fecha: d.tipo === "vps" && d.fecha ? new Date(d.fecha).toISOString() : null, avisarDias: Number(d.avisarDias) },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vencimientos"] });
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
      <Campo etiqueta="Tipo">
        <Selector value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as Vencimiento["tipo"] })}>
          <option value="dominio">Dominio (consulta RDAP)</option>
          <option value="ssl">Certificado SSL (conexión TLS)</option>
          <option value="vps">VPS u otro servicio (fecha manual)</option>
        </Selector>
      </Campo>
      {d.tipo === "vps" ? (
        <>
          <Campo etiqueta="Nombre">
            <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required placeholder="VPS Contabo" />
          </Campo>
          <Campo etiqueta="Vence el">
            <Entrada type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} required />
          </Campo>
        </>
      ) : (
        <Campo etiqueta="Dominio">
          <Entrada value={d.objetivo} onChange={(e) => setD({ ...d, objetivo: e.target.value })} required placeholder={d.tipo === "ssl" ? "setup.tudominio.com" : "tudominio.com"} />
        </Campo>
      )}
      <Campo etiqueta="Avisar con (días de anticipación)">
        <Entrada type="number" min={1} max={365} value={d.avisarDias} onChange={(e) => setD({ ...d, avisarDias: Number(e.target.value) })} />
      </Campo>
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" cargando={crear.isPending}>Agregar y revisar</Boton>
    </form>
  );
}

export default function Vencimientos() {
  const puede = usePuede("vencimientos", "escritura");
  const [nuevo, setNuevo] = useState(false);
  const [revisando, setRevisando] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["vencimientos"], queryFn: () => api<Vencimiento[]>("/api/vencimientos") });

  const revisar = async (v: Vencimiento) => {
    setRevisando(v.id);
    await api(`/api/vencimientos/${v.id}/revisar`, { metodo: "POST" }).catch(avisarError);
    await queryClient.invalidateQueries({ queryKey: ["vencimientos"] });
    setRevisando(null);
  };

  const pgVen = usePaginado(data, 12);
  return (
    <>
      <Encabezado
        titulo="Vencimientos"
        descripcion="Se revisan cada 6 horas; recibes un aviso push dentro de los días de anticipación."
        acciones={puede ? <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>Agregar</Boton> : null}
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      {data?.length === 0 ? <Vacio icono={CalendarClock} texto="Agrega tus dominios, certificados y VPS." /> : null}
      <ul className="space-y-2">
        {pgVen.visibles.map((v) => {
          const Icono = ICONOS[v.tipo];
          const tono = v.dias === null ? "neutro" : v.dias < 0 ? "peligro" : v.dias <= v.avisarDias ? "aviso" : "ok";
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3 text-sm">
              <Icono className="h-5 w-5 text-tenue" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{v.nombre}</p>
                <p className="text-xs text-tenue">
                  {v.objetivo ? `${v.objetivo} · ` : ""}vence {fmtFecha(v.fecha)} · revisado {haceCuanto(v.ultimaRevision)}
                </p>
                {v.error ? <p className="text-xs text-peligro">{v.error}</p> : null}
              </div>
              <Insignia tono={tono}>{v.dias === null ? "sin fecha" : v.dias < 0 ? `venció hace ${-v.dias} d` : `${v.dias} días`}</Insignia>
              {puede ? (
                <>
                  {v.tipo !== "vps" ? <Boton tamano="icono" variante="fantasma" icono={RefreshCw} cargando={revisando === v.id} onClick={() => void revisar(v)} aria-label="Revisar ahora" /> : null}
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Quitar"
                    onClick={async () => {
                      if (await confirmar({ titulo: "Quitar", mensaje: `¿Dejar de vigilar ${v.nombre}?` })) {
                        await api(`/api/vencimientos/${v.id}`, { metodo: "DELETE" }).catch(avisarError);
                        await queryClient.invalidateQueries({ queryKey: ["vencimientos"] });
                      }
                    }}
                  />
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      {pgVen.paginas}
      <Modal abierto={nuevo} titulo="Nuevo vencimiento" alCerrar={() => setNuevo(false)}>
        <Nuevo alTerminar={() => setNuevo(false)} />
      </Modal>
    </>
  );
}
