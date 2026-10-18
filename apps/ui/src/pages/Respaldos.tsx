/** Respaldos: base de datos de Mi Setup (cron del script del VPS) y servidores de juego (Pterodactyl). */
import { useQuery } from "@tanstack/react-query";
import { Archive, Database, Gamepad2 } from "lucide-react";
import { useState } from "react";
import { Cargando, Encabezado, ErrorCaja, Insignia, Selector, Tarjeta, Vacio } from "../components/ui";
import { api } from "../lib/api";
import { usePuede } from "../lib/consultas";
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
                <span className="shrink-0 text-tenue">{fmtFechaHora(a.fecha)} · {fmtBytes(a.bytes)}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
        {verPtero ? <ServidoresJuego /> : null}
      </div>
    </>
  );
}
