import { useQuery } from "@tanstack/react-query";
import { Bell, CloudSun, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Vacio } from "../components/ui";
import { api } from "../lib/api";
import { usePuede } from "../lib/consultas";
import { fmtFechaHora } from "../lib/formato";

interface Recordatorio {
  id: string;
  titulo: string;
  fecha: string;
}

interface Clima {
  ciudad: string;
  actual: { temperatura: number; descripcion: string };
}

const COLORES = ["var(--aviso)", "#7cb7ff", "var(--error)", "var(--ok)", "var(--acento)"];

export function Widget({ titulo, icono: Icono, accion, children }: { titulo: string; icono: LucideIcon; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[18px] border border-borde bg-[color-mix(in_srgb,var(--superficie)_78%,transparent)] p-4 backdrop-blur-md">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icono className="h-4 w-4 text-tenue" />
        {titulo}
        {accion ? <span className="ml-auto text-xs font-semibold text-acento">{accion}</span> : null}
      </h3>
      {children}
    </section>
  );
}

export function ResumenInicio() {
  const verRec = usePuede("recordatorios");
  const verNov = usePuede("novedades");
  const rec = useQuery({
    queryKey: ["recordatorios", "proximos"],
    queryFn: () => api<Recordatorio[]>("/api/recordatorios?proximos=1"),
    enabled: verRec,
  });
  const clima = useQuery({
    queryKey: ["novedades", "clima"],
    queryFn: () => api<Clima | null>("/api/novedades/clima"),
    enabled: verNov,
    retry: false,
  });

  return (
    <>
      {verRec ? (
        <Widget titulo="Próximos recordatorios" icono={Bell} accion={<Link to="/recordatorios">Ver</Link>}>
          {rec.data?.length ? (
            <ul>
              {rec.data.slice(0, 5).map((r, i) => (
                <li key={r.id} className="flex min-w-0 items-center gap-2.5 border-b border-borde py-2.5 text-sm last:border-0">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
                  <span className="min-w-0 flex-1 truncate">{r.titulo}</span>
                  <small className="shrink-0 text-xs text-tenue">{fmtFechaHora(r.fecha)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <Vacio icono={Bell} texto="Sin recordatorios pendientes." />
          )}
        </Widget>
      ) : null}
      {verNov && clima.data ? (
        <Widget titulo={`Clima en ${clima.data.ciudad}`} icono={CloudSun} accion={<Link to="/novedades">Ver</Link>}>
          <p className="text-3xl font-semibold">{Math.round(clima.data.actual.temperatura)}°</p>
          <p className="text-sm text-tenue">{clima.data.actual.descripcion}</p>
        </Widget>
      ) : null}
    </>
  );
}
