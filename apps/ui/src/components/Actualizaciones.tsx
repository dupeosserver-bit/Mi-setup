import { compararVersiones, type ModoActualizacion } from "@mi-setup/shared";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { marcarDescargada, useModoActualizacion, yaSeDescargo } from "../lib/actualizaciones";
import { abrirExterno, escritorio, esMovil } from "../lib/plataforma";
import { Boton, Insignia, cx } from "./ui";

interface InfoActualizacion {
  /** Versión del APK que se puede bajar (o la del servidor si no hay APK). */
  version: string;
  /** Versión del servidor (0.11.5b o más nuevo). */
  servidor?: string;
  apk: { nombre: string; version?: string; url: string; fecha: string } | null;
}

export { compararVersiones };

function useActualizacion() {
  return useQuery({
    queryKey: ["actualizaciones"],
    queryFn: () => api<InfoActualizacion>("/api/actualizaciones"),
    staleTime: 60 * 60_000,
    retry: false,
  });
}

const absoluta = (url: string) => `${API_BASE || window.location.origin}${url}`;

export function useHayVersionNueva(): boolean {
  const q = useActualizacion();
  return Boolean(q.data && esMovil() && q.data.apk && compararVersiones(q.data.version, __VERSION_APP__) > 0);
}

export function AvisoActualizacion() {
  const q = useActualizacion();
  const { efectivo } = useModoActualizacion();
  const [cerrado, setCerrado] = useState(false);
  const apk = q.data?.apk;
  const version = q.data?.version ?? "";
  const nueva = Boolean(apk) && q.data !== undefined && compararVersiones(version, __VERSION_APP__) > 0;
  useEffect(() => {
    if (!esMovil() || !nueva || !apk || efectivo !== "auto" || yaSeDescargo(version)) return;
    marcarDescargada(version);
    abrirExterno(absoluta(apk.url));
  }, [nueva, apk, efectivo, version]);
  if (!esMovil() || !nueva || cerrado || !apk || !q.data || efectivo === "no") return null;
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2 text-sm" style={{ borderColor: "color-mix(in srgb, var(--acento) 40%, transparent)", background: "color-mix(in srgb, var(--acento) 10%, transparent)" }}>
      <Download className="h-4 w-4 shrink-0 text-acento" />
      <p className="min-w-0 flex-1">
        {efectivo === "auto" && yaSeDescargo(version) ? `Se está bajando la versión ${version}. Toca «Instalar» cuando Android te pregunte.` : `Hay una versión nueva de la app (${version}). Tienes la ${__VERSION_APP__}.`}
      </p>
      <Boton
        tamano="sm"
        variante="primario"
        onClick={() => {
          marcarDescargada(version);
          abrirExterno(absoluta(apk.url));
        }}
      >
        Actualizar
      </Boton>
      <button type="button" aria-label="Cerrar aviso" className="p-1 text-tenue" onClick={() => setCerrado(true)}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

const OPCIONES: { id: ModoActualizacion; titulo: string; texto: string }[] = [
  { id: "auto", titulo: "Descargar solas", texto: "Se bajan en segundo plano y al abrir verás qué hay de nuevo." },
  { id: "preguntar", titulo: "Preguntarme", texto: "Te aviso cuando haya una versión nueva y tú decides." },
  { id: "no", titulo: "No actualizar", texto: "Te quedas con esta versión hasta que la cambies aquí." },
];

export function SeccionActualizaciones() {
  const q = useActualizacion();
  const { elegido, efectivo, vinculado, puedeRechazar, poner } = useModoActualizacion();
  const pc = Boolean(escritorio());
  const servidor = q.data?.servidor ?? q.data?.version;
  // En la PC manda la versión del servidor (el EXE se actualiza con latest.yml); en el celular, la del APK.
  const nueva = q.data ? compararVersiones((pc ? servidor : q.data.version) ?? "", __VERSION_APP__) > 0 : false;
  const apk = q.data?.apk;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-fondo p-4">
        <RefreshCw className="h-6 w-6 shrink-0 text-acento" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            Esta app: {__VERSION_APP__} · Servidor: {servidor ?? "…"}
          </p>
          <p className="text-tenue">{pc ? "En la PC se instala al cerrar la app." : esMovil() ? "En Android siempre se toca «Instalar» al final." : "En el navegador siempre ves la versión más nueva."}</p>
        </div>
        {q.data ? nueva && (esMovil() || pc) ? <Insignia tono="aviso">Hay versión nueva</Insignia> : <Insignia tono="ok">Al día</Insignia> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPCIONES.map((o) => {
          const bloqueada = !puedeRechazar && o.id !== "auto";
          const activa = (vinculado ? efectivo : elegido) === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={bloqueada}
              onClick={() => poner(o.id)}
              className={cx("rounded-2xl border p-3 text-left transition", activa ? "border-acento" : "border-borde", bloqueada ? "cursor-not-allowed opacity-50" : "hover:border-acento")}
              style={activa ? { background: "color-mix(in srgb, var(--acento) 12%, transparent)" } : undefined}
            >
              <p className="font-semibold">{o.titulo}</p>
              <p className="mt-1 text-xs text-tenue">{o.texto}</p>
            </button>
          );
        })}
      </div>
      {vinculado ? <p className="text-xs text-tenue">Tu app está vinculada a tu VPS: se actualiza siempre sola para que la app y el servidor vayan a la par.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Boton
          tamano="sm"
          icono={RefreshCw}
          cargando={q.isFetching}
          onClick={() => {
            escritorio()?.actualizaciones?.buscar();
            void q.refetch();
          }}
        >
          Buscar actualización
        </Boton>
        {esMovil() && apk && nueva ? (
          <Boton
            tamano="sm"
            variante="primario"
            icono={Download}
            onClick={() => {
              marcarDescargada(q.data?.version ?? "");
              abrirExterno(absoluta(apk.url));
            }}
          >
            Descargar {q.data?.version}
          </Boton>
        ) : null}
      </div>
    </div>
  );
}
