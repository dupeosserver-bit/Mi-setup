/** Registro de actividad: todo lo que pasa en la app (incluida la IA), con filtros y exportación CSV. */
import { MODULES, MODULE_IDS } from "@mi-setup/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Bot, Download, Server, User } from "lucide-react";
import { useState } from "react";
import { Boton, Cargando, Encabezado, ErrorCaja, Insignia, Selector, Vacio, avisarError } from "../components/ui";
import { api, descargar } from "../lib/api";
import { fmtFechaHora } from "../lib/formato";

interface Fila {
  id: number;
  fecha: string;
  actor: "usuario" | "ia" | "sistema";
  usuario: string | null;
  accion: string;
  modulo: string | null;
  objetivo: string | null;
  resultado: "ok" | "denegado" | "error";
  ip: string | null;
  detalles: Record<string, unknown>;
}

const ICONO = { usuario: User, ia: Bot, sistema: Server } as const;
const TONO = { ok: "ok", denegado: "aviso", error: "peligro" } as const;

export default function Auditoria() {
  const [f, setF] = useState({ modulo: "", accion: "", actor: "", resultado: "" });
  const [abierta, setAbierta] = useState<number | null>(null);
  const acciones = useQuery({ queryKey: ["auditoria", "acciones"], queryFn: () => api<string[]>("/api/auditoria/acciones") });
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);

  const filas = useInfiniteQuery({
    queryKey: ["auditoria", "filas", params.toString()],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(params);
      p.set("limite", "100");
      if (pageParam) p.set("antesDe", String(pageParam));
      return api<Fila[]>(`/api/auditoria?${p}`);
    },
    getNextPageParam: (ultima) => (ultima.length === 100 ? ultima.at(-1)?.id : undefined),
  });
  const todas = filas.data?.pages.flat() ?? [];

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Registro de actividad"
        descripcion="Inmutable: nadie puede editarlo ni borrarlo. Incluye cada propuesta, aprobación y resultado de la IA."
        acciones={
          <Boton icono={Download} onClick={() => descargar(`/api/auditoria/exportar?${params}`, "actividad.csv").catch(avisarError)}>
            Exportar CSV
          </Boton>
        }
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <Selector value={f.modulo} onChange={(e) => setF({ ...f, modulo: e.target.value })}>
          <option value="">Todos los módulos</option>
          {MODULE_IDS.map((m) => (
            <option key={m} value={m}>
              {MODULES[m].label}
            </option>
          ))}
        </Selector>
        <Selector value={f.accion} onChange={(e) => setF({ ...f, accion: e.target.value })}>
          <option value="">Todas las acciones</option>
          {acciones.data?.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Selector>
        <Selector value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })}>
          <option value="">Usuarios, IA y sistema</option>
          <option value="usuario">Usuarios</option>
          <option value="ia">IA</option>
          <option value="sistema">Sistema</option>
        </Selector>
        <Selector value={f.resultado} onChange={(e) => setF({ ...f, resultado: e.target.value })}>
          <option value="">Cualquier resultado</option>
          <option value="ok">Correcto</option>
          <option value="denegado">Denegado</option>
          <option value="error">Error</option>
        </Selector>
      </div>
      {filas.isLoading ? <Cargando /> : null}
      <ErrorCaja error={filas.error} />
      {!filas.isLoading && todas.length === 0 ? <Vacio texto="No hay actividad con esos filtros." /> : null}
      <div className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
        {todas.map((r) => {
          const Icono = ICONO[r.actor];
          return (
            <button key={r.id} type="button" className="block w-full px-4 py-3 text-left text-sm hover:bg-tarjeta" onClick={() => setAbierta(abierta === r.id ? null : r.id)}>
              <div className="flex flex-wrap items-center gap-2">
                <Icono className="h-4 w-4 shrink-0 text-tenue" />
                <span className="font-medium">{r.accion}</span>
                <Insignia tono={TONO[r.resultado]}>{r.resultado}</Insignia>
                {r.modulo ? <span className="text-xs text-tenue">{MODULES[r.modulo as keyof typeof MODULES]?.label ?? r.modulo}</span> : null}
                <span className="ml-auto text-xs text-tenue">{fmtFechaHora(r.fecha)}</span>
              </div>
              <p className="mt-1 truncate text-xs text-tenue">
                {r.actor === "ia" ? "IA" : r.actor === "sistema" ? "Sistema" : (r.usuario ?? "—")}
                {r.objetivo ? ` · ${r.objetivo}` : ""}
                {r.ip ? ` · ${r.ip}` : ""}
              </p>
              {abierta === r.id && Object.keys(r.detalles).length ? (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-fondo p-2 text-xs text-tenue">{JSON.stringify(r.detalles, null, 2)}</pre>
              ) : null}
            </button>
          );
        })}
      </div>
      {filas.hasNextPage ? (
        <Boton className="w-full" cargando={filas.isFetchingNextPage} onClick={() => void filas.fetchNextPage()}>
          Ver más
        </Boton>
      ) : null}
    </div>
  );
}
