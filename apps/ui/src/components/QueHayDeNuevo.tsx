import type { ModuleId } from "@mi-setup/shared";
import {
  Bot,
  Check,
  Code2,
  Gift,
  Globe2,
  Image,
  LayoutDashboard,
  Music,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Boton } from "./ui";

export const VERSION_NOVEDADES = "0.11.4b";

export const NOVEDADES: readonly { modulo: ModuleId; icono: LucideIcon; titulo: string; texto: string }[] = [
  { modulo: "ajustes", icono: LayoutDashboard, titulo: "Diseño nuevo", texto: "Toda la app se acomoda a PC, monitor vertical, tablet y celular. Las listas tienen páginas y ya no se suben al cambiar de página." },
  { modulo: "ajustes", icono: RefreshCw, titulo: "Actualizaciones solas", texto: "La app se baja sola y al abrirla te enseña esta pantalla. Ajustes tiene nuevo diseño y descargas para PC, Android e iPhone." },
  { modulo: "equipos", icono: Users, titulo: "Equipos", texto: "Si reinstalas la app en el mismo aparato cuenta como uno. Reconoce PC, tablet o celular y puedes cerrar todas las sesiones menos esta." },
  { modulo: "finanzas_personales", icono: Wallet, titulo: "Mis finanzas", texto: "Marca los pagos como pagados; lo que no marques pasa solo al mes siguiente. Ya puedes editar tus suscripciones." },
  { modulo: "vps_terminal", icono: Terminal, titulo: "Terminal tipo Termius", texto: "Se abre a pantalla completa, con barra de teclas que se desliza en el celular, comandos guardados y dividir en 2." },
  { modulo: "ia", icono: Sparkles, titulo: "IA asistente", texto: "Proyectos con archivos, memoria compartida e instrucciones propias. Deudas con seguimiento y pasos a seguir." },
  { modulo: "musica", icono: Music, titulo: "Música", texto: "Spotify con «Dónde suena», canciones parecidas, playlists, historial y Top 50. Tu música de 6 en 6." },
  { modulo: "editor_fotos", icono: Image, titulo: "Editor de fotos", texto: "Herramientas tipo Photoshop: capas, historial, pincel con dureza, relleno y más, también en tablet y celular." },
  { modulo: "sitios", icono: Globe2, titulo: "Sitios", texto: "Pon tu sitio en mantenimiento o ciérralo sin borrarlo, y haz su ícono con la IA o con tu imagen." },
  { modulo: "herramientas", icono: QrCode, titulo: "QR nuevo", texto: "Formas, esquinas, degradado, logo y marco con texto. Y tu firma escrita si no tienes una dibujada." },
  { modulo: "codigo", icono: Code2, titulo: "Programación", texto: "El editor se adapta al celular. Ejercicios nuevos de Java, HTML y CSS con videos para aprender." },
  { modulo: "pterodactyl", icono: ShieldCheck, titulo: "Pterodactyl", texto: "Ya acepta archivos .blueprint y la tienda gratis instala sola lo que se puede descargar." },
  { modulo: "vps_agentes", icono: Bot, titulo: "Agentes de IA", texto: "Ahora viven en la categoría IA." },
  { modulo: "ciberseguridad", icono: ShieldCheck, titulo: "Seguridad más clara", texto: "Tus sesiones ahora están en Equipos y las entradas al servidor en VPS. Puedes vincular hasta 10 cuentas de Google." },
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
