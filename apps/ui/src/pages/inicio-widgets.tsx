/** Tarjetas del inicio: próximos recordatorios y clima (si el usuario tiene acceso). */
import { useQuery } from "@tanstack/react-query";
import { Bell, CloudSun } from "lucide-react";
import { Link } from "react-router-dom";
import { Tarjeta, Vacio } from "../components/ui";
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
        <Tarjeta titulo="Próximos recordatorios" icono={Bell} acciones={<Link to="/recordatorios" className="text-xs text-tenue hover:text-texto">Ver</Link>}>
          {rec.data?.length ? (
            <ul className="space-y-2 text-sm">
              {rec.data.slice(0, 5).map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span className="truncate">{r.titulo}</span>
                  <span className="shrink-0 text-xs text-tenue">{fmtFechaHora(r.fecha)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Vacio icono={Bell} texto="Sin recordatorios pendientes." />
          )}
        </Tarjeta>
      ) : null}
      {verNov && clima.data ? (
        <Tarjeta titulo={`Clima en ${clima.data.ciudad}`} icono={CloudSun} acciones={<Link to="/novedades" className="text-xs text-tenue hover:text-texto">Ver</Link>}>
          <p className="text-3xl font-semibold">{Math.round(clima.data.actual.temperatura)}°</p>
          <p className="text-sm text-tenue">{clima.data.actual.descripcion}</p>
        </Tarjeta>
      ) : null}
    </>
  );
}
