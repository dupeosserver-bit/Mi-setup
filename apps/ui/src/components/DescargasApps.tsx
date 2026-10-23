import { useQuery } from "@tanstack/react-query";
import { Apple, Copy, Download, MonitorDown, Smartphone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { API_BASE, api } from "../lib/api";
import { fmtBytes, fmtFechaHora } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";
import { Boton, Cargando, ErrorCaja, avisar } from "./ui";

interface Archivo {
  nombre: string;
  tamano: number;
  modificado: string;
  tipo: "android" | "windows";
  url: string;
}

const absoluta = (url: string) => `${API_BASE || window.location.origin}${url}`;

function copiar(texto: string, aviso: string) {
  void navigator.clipboard
    .writeText(texto)
    .then(() => avisar(aviso))
    .catch(() => avisar(texto, "info"));
}

function Plataforma({ icono: Icono, titulo, subtitulo, color, children }: { icono: LucideIcon; titulo: string; subtitulo: string; color: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-borde bg-tarjeta p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: color }}>
          <Icono className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">{titulo}</h3>
          <p className="text-xs text-tenue">{subtitulo}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 text-sm">{children}</div>
    </section>
  );
}

function ArchivoApp({ a }: { a: Archivo | undefined }) {
  if (!a) return <p className="text-tenue">Todavía no está en tu servidor. Súbela a /opt/mi-setup/descargas del VPS (ver USO.md).</p>;
  return (
    <>
      <p className="truncate text-xs text-tenue">
        {a.nombre} · {fmtBytes(a.tamano)} · {fmtFechaHora(a.modificado)}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        <Boton tamano="sm" variante="primario" icono={Download} onClick={() => abrirExterno(absoluta(a.url))}>
          Descargar
        </Boton>
        <Boton tamano="sm" icono={Copy} onClick={() => copiar(absoluta(a.url), "Enlace copiado")}>
          Copiar enlace
        </Boton>
      </div>
    </>
  );
}

export function DescargasApps() {
  const q = useQuery({ queryKey: ["descargas"], queryFn: () => api<{ archivos: Archivo[] }>("/api/descargas") });
  const ultima = (tipo: Archivo["tipo"]) => q.data?.archivos.find((a) => a.tipo === tipo);
  const direccion = API_BASE || window.location.origin;
  return (
    <div className="space-y-4">
      <p className="text-sm text-tenue">Baja la app para otro equipo o copia el enlace y mándaselo a alguien de confianza. Cada persona entra con su propia cuenta.</p>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      <div className="grid gap-3 lg:grid-cols-3">
        <Plataforma icono={MonitorDown} titulo="PC" subtitulo="Windows 10 y 11" color="#3a7bd5">
          <ArchivoApp a={ultima("windows")} />
        </Plataforma>
        <Plataforma icono={Smartphone} titulo="Android" subtitulo="Celulares y tablets Android" color="#2e9e6b">
          <ArchivoApp a={ultima("android")} />
          <details className="rounded-xl bg-fondo p-3 text-xs text-tenue">
            <summary className="cursor-pointer text-texto">¿Android dice que es peligrosa?</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Es normal con apps que no vienen de la Play Store.</li>
              <li>Si sale Play Protect: Más detalles → Instalar de todas formas.</li>
              <li>Si pide permiso: Ajustes → Instalar apps desconocidas → activa tu navegador o WhatsApp.</li>
              <li>La app siempre se firma con la misma llave: las actualizaciones se instalan encima sin perder nada.</li>
            </ol>
          </details>
        </Plataforma>
        <Plataforma icono={Apple} titulo="iPhone" subtitulo="iPhone y iPad, desde Safari" color="#475569">
          <ol className="list-decimal space-y-1 pl-5 text-tenue">
            <li>
              Abre <b className="text-texto">Safari</b> y entra a <b className="break-all text-texto">{direccion}</b>.
            </li>
            <li>
              Toca <b className="text-texto">Compartir</b> → <b className="text-texto">Agregar a inicio</b> → <b className="text-texto">Agregar</b>.
            </li>
            <li>Ábrela desde el ícono: se ve a pantalla completa, como una app.</li>
          </ol>
          <div className="mt-auto">
            <Boton tamano="sm" icono={Copy} onClick={() => copiar(direccion, "Dirección copiada: mándasela a quien tenga iPhone")}>
              Copiar la dirección
            </Boton>
          </div>
        </Plataforma>
      </div>
    </div>
  );
}
