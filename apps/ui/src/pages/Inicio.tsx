import { MODULES, temas, type ModuleId } from "@mi-setup/shared";
import { useQuery } from "@tanstack/react-query";
import { MonitorSmartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { Encabezado, Punto, Tarjeta, Vacio } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, useMe, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { useTema } from "../lib/tiempo-real";
import { CATEGORIAS, MODULOS_UI } from "../modulos";
import { ResumenInicio } from "./inicio-widgets";
import { EsteEquipo } from "../components/EsteEquipo";

interface Equipo {
  id: string;
  nombre: string;
  tipo: string;
  conectado: boolean;
  ultimaVez: string | null;
}

export default function Inicio() {
  const { data: me } = useMe();
  const verEquipos = usePuede("equipos");
  useTema(verEquipos ? temas.dispositivos : null, () => void queryClient.invalidateQueries({ queryKey: ["equipos"] }));
  const equipos = useQuery({ queryKey: ["equipos"], queryFn: () => api<Equipo[]>("/api/equipos"), enabled: verEquipos });

  const visibles = Object.entries(me?.permisos ?? {})
    .filter(([, nivel]) => nivel !== "ninguno")
    .map(([id]) => id as ModuleId);

  return (
    <>
      <Encabezado titulo={`Hola, ${me?.usuario.displayName ?? ""}`} descripcion="Todo tu setup en un solo lugar." />
      <div className="mb-6">
        <EsteEquipo />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {verEquipos ? (
          <Tarjeta titulo="Equipos" icono={MonitorSmartphone} acciones={<Link to="/equipos" className="text-xs text-tenue hover:text-texto">Ver</Link>}>
            {equipos.data?.length ? (
              <ul className="space-y-2">
                {equipos.data.map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-sm">
                    <Link to={`/equipos?id=${e.id}`} className="hover:underline">
                      {e.nombre}
                    </Link>
                    <span className="flex items-center gap-3 text-xs text-tenue">
                      {!e.conectado ? haceCuanto(e.ultimaVez) : null}
                      <Punto conectado={e.conectado} texto />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Vacio icono={MonitorSmartphone} texto="Aún no hay equipos registrados." />
            )}
          </Tarjeta>
        ) : null}
        <ResumenInicio />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-tenue">Apartados</h2>
      {CATEGORIAS.map((c) => {
        const mods = visibles.filter((id) => MODULES[id].category === c.id);
        if (mods.length === 0) return null;
        return (
          <section key={c.id} className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-tenue">{c.titulo}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {mods.map((id) => {
                const mod = MODULOS_UI[id];
                return (
                  <Link
                    key={id}
                    to={mod.ruta}
                    className="flex items-center gap-2 rounded-xl border border-borde bg-superficie px-3 py-3 text-sm hover:bg-tarjeta"
                  >
                    <mod.icono className="h-4 w-4 shrink-0 text-tenue" />
                    <span className="truncate">{MODULES[id].label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
