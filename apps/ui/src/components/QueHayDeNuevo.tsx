import type { ModuleId } from "@mi-setup/shared";
import {
  Check,
  Gift,
  Server,
  Terminal,
  ToggleRight,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Boton } from "./ui";

export const VERSION_NOVEDADES = "0.11.6b";

export const NOVEDADES: readonly { modulo: ModuleId; icono: LucideIcon; titulo: string; texto: string }[] = [
  { modulo: "musica", icono: Volume2, titulo: "Volumen en Música", texto: "Barra de volumen con silencio en Spotify y en Tu música (también en el celular)." },
  { modulo: "vps_terminal", icono: Terminal, titulo: "Terminal empieza en Hosts", texto: "Al entrar eliges el host; ya no se abre sola una terminal. Tus sesiones abiertas siguen como pestañas." },
  { modulo: "ajustes", icono: Server, titulo: "Agregar otro servidor", texto: "En Ajustes → Servidor ya no dice «No se pudo conectar» cuando el otro Mi Setup sí está encendido." },
  { modulo: "ajustes", icono: ToggleRight, titulo: "Ajustes más ordenados", texto: "Los interruptores ya no se aplastan y las imágenes se acomodan bien en PC, tablet y celular." },
];

export function QueHayDeNuevo({ puede, alTerminar }: { puede: (m: ModuleId) => boolean; alTerminar: () => void }) {
  const lista = NOVEDADES.filter((n) => puede(n.modulo));
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") alTerminar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alTerminar]);
  if (!lista.length) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Qué hay de nuevo en ${VERSION_NOVEDADES}`} className="fixed inset-0 z-[90] flex flex-col bg-fondo" style={{ height: "var(--alto-app, 100dvh)" }}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-acento" style={{ background: "color-mix(in srgb, var(--acento) 16%, transparent)" }}>
              <Gift className="h-8 w-8" />
            </span>
            <p className="text-sm text-tenue">Qué hay de nuevo</p>
            <h1 className="text-4xl font-bold tracking-tight">{VERSION_NOVEDADES}</h1>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {lista.map((n) => {
              const Icono = n.icono;
              return (
                <li key={n.titulo} className="flex gap-3 rounded-2xl border border-borde bg-tarjeta p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-acento" style={{ background: "color-mix(in srgb, var(--acento) 14%, transparent)" }}>
                    <Icono className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{n.titulo}</p>
                    <p className="mt-0.5 text-sm text-tenue">{n.texto}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="border-t border-borde bg-superficie px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-4xl justify-end">
          <Boton variante="primario" icono={Check} onClick={alTerminar} className="w-full sm:w-auto">
            Entendido
          </Boton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
