/**
 * Descargar las apps desde tu servidor (Ajustes → Descargar apps): el APK de
 * Android y el instalador de Windows, con enlace para compartir.
 */
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, MonitorDown, Smartphone } from "lucide-react";
import { API_BASE, api } from "../lib/api";
import { fmtBytes, fmtFechaHora } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";
import { SeccionActualizaciones } from "./Actualizaciones";
import { Boton, Cargando, ErrorCaja, Tarjeta, Vacio, avisar } from "./ui";

interface Archivo {
  nombre: string;
  tamano: number;
  modificado: string;
  tipo: "android" | "windows";
  url: string;
}

export function DescargasApps() {
  const q = useQuery({ queryKey: ["descargas"], queryFn: () => api<{ archivos: Archivo[] }>("/api/descargas") });
  const absoluta = (url: string) => `${API_BASE || window.location.origin}${url}`;

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Apps de Mi Setup">
        <p className="mb-3 text-sm text-tenue">
          Baja la app para otro celular o PC, o copia el enlace y mándaselo a alguien de confianza. Cada persona entra con su propia cuenta.
        </p>
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando /> : null}
        {q.data && !q.data.archivos.length ? (
          <Vacio texto="Todavía no hay apps en el servidor. Súbelas a /opt/mi-setup/descargas del VPS (ver USO.md)." />
        ) : null}
        <div className="space-y-2">
          {q.data?.archivos.map((a) => {
            const Icono = a.tipo === "android" ? Smartphone : MonitorDown;
            return (
              <div key={a.nombre} className="flex flex-wrap items-center gap-3 rounded-xl bg-fondo p-3">
                <Icono className="h-6 w-6 shrink-0 text-acento" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.tipo === "android" ? "Android (celular)" : "Windows (PC)"}</p>
                  <p className="truncate text-xs text-tenue">
                    {a.nombre} · {fmtBytes(a.tamano)} · {fmtFechaHora(a.modificado)}
                  </p>
                </div>
                <Boton tamano="sm" variante="primario" icono={Download} onClick={() => abrirExterno(absoluta(a.url))}>
                  Descargar
                </Boton>
                <Boton
                  tamano="sm"
                  icono={Copy}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(absoluta(a.url))
                      .then(() => avisar("Enlace copiado"))
                      .catch(() => avisar(absoluta(a.url), "info"))
                  }
                >
                  Copiar enlace
                </Boton>
              </div>
            );
          })}
        </div>
      </Tarjeta>
      <SeccionActualizaciones />
      <Tarjeta titulo="iPhone y iPad">
        <p className="mb-2 text-sm text-tenue">Mi Setup se instala como app desde Safari (no hace falta la App Store):</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-tenue">
          <li>
            En el iPhone abre <b className="text-texto">Safari</b> y entra a <b className="text-texto">{API_BASE || window.location.origin}</b>.
          </li>
          <li>
            Toca <b className="text-texto">Compartir</b> (el cuadro con la flecha) → <b className="text-texto">Agregar a inicio</b> → <b className="text-texto">Agregar</b>.
          </li>
          <li>Ábrela desde el ícono: se ve a pantalla completa, como una app. Entra con tu cuenta.</li>
        </ol>
        <Boton
          tamano="sm"
          className="mt-3"
          icono={Copy}
          onClick={() =>
            void navigator.clipboard
              .writeText(API_BASE || window.location.origin)
              .then(() => avisar("Dirección copiada: mándasela a quien tenga iPhone"))
              .catch(() => avisar(API_BASE || window.location.origin, "info"))
          }
        >
          Copiar la dirección para un iPhone
        </Boton>
      </Tarjeta>
      <Tarjeta titulo="¿Android dice que la app es peligrosa?">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-tenue">
          <li>Es normal con apps que no vienen de la Play Store: Android avisa con todas las apps instaladas "a mano".</li>
          <li>
            Si aparece <b className="text-texto">Play Protect</b>: toca <b className="text-texto">Más detalles → Instalar de todas formas</b>.
          </li>
          <li>
            Si pide permiso: <b className="text-texto">Ajustes → Instalar apps desconocidas</b> → activa tu navegador o WhatsApp.
          </li>
          <li>La app está firmada siempre con la misma llave de MexicanLand: las actualizaciones se instalan encima sin perder nada.</li>
        </ol>
      </Tarjeta>
    </div>
  );
}
