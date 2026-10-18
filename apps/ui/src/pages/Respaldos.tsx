/** Respaldos: base de datos de Mi Setup (cron del script del VPS) y servidores de juego (Pterodactyl). */
import { useQuery } from "@tanstack/react-query";
import { Archive, Database, Download, FileJson, Gamepad2 } from "lucide-react";
import { useState } from "react";
import { Boton, Cargando, Encabezado, ErrorCaja, Insignia, Selector, Tarjeta, Vacio, avisarError } from "../components/ui";
import { api, descargar } from "../lib/api";
import { useMe, usePuede } from "../lib/consultas";
import { fmtBytes, fmtFechaHora, haceCuanto } from "../lib/formato";
import { RespaldosServidor } from "./Pterodactyl";

interface EstadoBase {
  archivos: { nombre: string; bytes: number; fecha: string }[];
  ultimo: { nombre: string; bytes: number; fecha: string } | null;
  alDia: boolean;
}

function ServidoresJuego() {
  const [id, setId] = useState<string>("");
  const servidores = useQuery({ queryKey: ["ptero", "servidores"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/ptero/servidores"), retry: false });
  const actual = id || servidores.data?.[0]?.id || "";
  return (
    <Tarjeta
      titulo="Servidores de juego"
      icono={Gamepad2}
      acciones={
        servidores.data?.length ? (
          <Selector value={actual} onChange={(e) => setId(e.target.value)} className="h-8 w-56 text-xs">
            {servidores.data.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </Selector>
        ) : null
      }
    >
      <ErrorCaja error={servidores.error} />
      {servidores.data?.length === 0 ? <Vacio icono={Gamepad2} texto="No hay servidores en el panel." /> : null}
      {actual ? <RespaldosServidor key={actual} id={actual} /> : null}
    </Tarjeta>
  );
}

export default function Respaldos() {
  const verPtero = usePuede("pterodactyl");
  const maestra = useMe().data?.usuario.role === "maestra";
  const base = useQuery({ queryKey: ["respaldos", "base"], queryFn: () => api<EstadoBase>("/api/respaldos/base"), retry: false });
  return (
    <>
      <Encabezado titulo="Respaldos" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta
          titulo="Base de datos de Mi Setup"
          icono={Database}
          acciones={base.data ? <Insignia tono={base.data.alDia ? "ok" : "peligro"}>{base.data.alDia ? "Al día" : "Atrasado"}</Insignia> : null}
        >
          <ErrorCaja error={base.error} />
          {base.isLoading ? <Cargando /> : null}
          {base.data?.ultimo ? (
            <p className="mb-3 text-sm">
              Último: <span className="font-medium">{base.data.ultimo.nombre}</span> · {haceCuanto(base.data.ultimo.fecha)} · {fmtBytes(base.data.ultimo.bytes)}
            </p>
          ) : base.data ? (
            <Vacio icono={Archive} texto="Aún no hay respaldos en la carpeta." />
          ) : null}
          <ul className="max-h-80 space-y-1 overflow-auto">
            {base.data?.archivos.map((a) => (
              <li key={a.nombre} className="flex justify-between gap-2 rounded-lg bg-fondo px-3 py-1.5 text-xs">
                <span className="truncate">{a.nombre}</span>
                <span className="flex shrink-0 items-center gap-2 text-tenue">
                  {fmtFechaHora(a.fecha)} · {fmtBytes(a.bytes)}
                  {maestra ? (
                    <button type="button" aria-label={`Descargar ${a.nombre}`} className="hover:text-texto" onClick={() => void descargar(`/api/respaldos/base/descargar/${encodeURIComponent(a.nombre)}`, a.nombre).catch(avisarError)}>
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
        {verPtero ? <ServidoresJuego /> : null}
        <Tarjeta titulo="Mis datos" icono={FileJson}>
          <p className="text-sm text-tenue">Descarga todo lo tuyo (notas, tareas, finanzas, suscripciones, calendario, enlaces, prompts y tu lista por ver) en un archivo. Guárdalo en tu PC o en la nube.</p>
          <Boton className="mt-3" icono={Download} onClick={() => void descargar("/api/respaldos/mis-datos", `mis-datos-${new Date().toISOString().slice(0, 10)}.json`).catch(avisarError)}>
            Descargar mis datos
          </Boton>
          <p className="mt-3 text-xs text-tenue">Tus archivos subidos (música, videos, compartidos) viven en el volumen misetup_archivos del VPS; el script de respaldo también los copia (ver USO.md).</p>
        </Tarjeta>
      </div>
    </>
  );
}
