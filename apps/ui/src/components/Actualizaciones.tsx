/**
 * Actualizaciones de las apps.
 * - Celular: compara su versión con la del servidor; si hay una más nueva
 *   muestra un aviso para bajar el APK (Android siempre pide tocar "Instalar").
 * - PC: la app de Windows se actualiza sola (electron-updater) y sus pantallas
 *   vienen del servidor, así que siempre están al día.
 */
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { API_BASE, api } from "../lib/api";
import { abrirExterno, escritorio, esMovil } from "../lib/plataforma";
import { Boton, Insignia, Tarjeta } from "./ui";

interface InfoActualizacion {
  version: string;
  apk: { nombre: string; url: string; fecha: string } | null;
}

/** Etapa al final de la versión: "b" (beta, en pruebas) va antes que "a" (pública) y sin letra cuenta como pública. */
const ETAPA: Record<string, number> = { b: 0, a: 1, "": 1 };

/** 1 si a > b, -1 si a < b, 0 si son iguales ("0.10.0" > "0.9.3", "0.9.0a" > "0.9.0b"). */
export function compararVersiones(a: string, b: string): number {
  const partes = (v: string) => {
    const m = /^([\d.]+)([a-z]?)/i.exec(v.trim());
    return { nums: (m?.[1] ?? v).split(".").map((n) => Number.parseInt(n, 10) || 0), etapa: ETAPA[(m?.[2] ?? "").toLowerCase()] ?? 1 };
  };
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return Math.sign(pa.etapa - pb.etapa);
}

function useActualizacion() {
  return useQuery({
    queryKey: ["actualizaciones"],
    queryFn: () => api<InfoActualizacion>("/api/actualizaciones"),
    staleTime: 60 * 60_000,
    retry: false,
  });
}

const absoluta = (url: string) => `${API_BASE || window.location.origin}${url}`;

/** Aviso arriba de la pantalla (solo en el celular) cuando hay una versión más nueva. */
export function AvisoActualizacion() {
  const q = useActualizacion();
  const [cerrado, setCerrado] = useState(false);
  const apk = q.data?.apk;
  const nueva = Boolean(apk) && q.data !== undefined && compararVersiones(q.data.version, __VERSION_APP__) > 0;
  if (!esMovil() || !nueva || cerrado || !apk || !q.data) return null;
  return (
    <div className="flex items-center gap-2 border-b border-acento/40 bg-acento/10 px-4 py-2 text-sm">
      <Download className="h-4 w-4 shrink-0 text-acento" />
      <p className="min-w-0 flex-1">
        Hay una versión nueva de la app ({q.data.version}). Tienes la {__VERSION_APP__}.
      </p>
      <Boton tamano="sm" variante="primario" onClick={() => abrirExterno(absoluta(apk.url))}>
        Actualizar
      </Boton>
      <button type="button" aria-label="Cerrar aviso" className="p-1 text-tenue" onClick={() => setCerrado(true)}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Sección "Actualizaciones" en Ajustes → Descargar apps. */
export function SeccionActualizaciones() {
  const q = useActualizacion();
  const pc = Boolean(escritorio());
  const nueva = q.data ? compararVersiones(q.data.version, __VERSION_APP__) > 0 : false;
  const apk = q.data?.apk;
  return (
    <Tarjeta titulo="Actualizaciones" icono={RefreshCw}>
      <div className="space-y-2 text-sm">
        <p>
          Esta app: <b>{__VERSION_APP__}</b> · Servidor: <b>{q.data?.version ?? "…"}</b>{" "}
          {q.data ? nueva && esMovil() ? <Insignia tono="aviso">Hay versión nueva</Insignia> : <Insignia tono="ok">Al día</Insignia> : null}
        </p>
        {pc ? (
          <p className="text-tenue">En la PC la app se actualiza sola: baja la versión nueva en segundo plano y te pregunta si quieres reiniciar.</p>
        ) : esMovil() ? (
          <p className="text-tenue">En el celular la app te avisa arriba cuando hay versión nueva. Android siempre pide que toques "Instalar".</p>
        ) : (
          <p className="text-tenue">En el navegador siempre ves la versión más nueva.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Boton tamano="sm" icono={RefreshCw} cargando={q.isFetching} onClick={() => void q.refetch()}>
            Buscar actualización
          </Boton>
          {esMovil() && apk && nueva ? (
            <Boton tamano="sm" variante="primario" icono={Download} onClick={() => abrirExterno(absoluta(apk.url))}>
              Descargar {q.data?.version}
            </Boton>
          ) : null}
        </div>
      </div>
    </Tarjeta>
  );
}
