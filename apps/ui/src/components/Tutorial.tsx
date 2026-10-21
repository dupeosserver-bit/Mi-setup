/**
 * Tutorial de bienvenida: la primera vez que entra una cuenta explica, paso a
 * paso, qué hace cada apartado que esa cuenta puede usar. Se marca como visto
 * en las preferencias de la cuenta (y en este equipo) y se puede repetir desde
 * Ajustes → Cuenta.
 */
import { MODULES, can, type ModuleId } from "@mi-setup/shared";
import { ChevronLeft, ChevronRight, Gift, HelpCircle, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AYUDA } from "../lib/ayuda";
import { useMe } from "../lib/consultas";
import { useGuardarPreferencias, usePreferencias } from "../lib/preferencias";
import type { ModuloUi } from "../modulos";
import { Boton, Modal, cx } from "./ui";

export interface GrupoTutorial {
  id: string;
  titulo: string;
  icono: LucideIcon;
  modulos: ModuloUi[];
}

const EVENTO = "mi-setup:tutorial";

/** Versión de las novedades de abajo: al subirla, el tutorial se vuelve a abrir solo con lo nuevo. */
export const VERSION_NOVEDADES = "0.11.2b";

/** Lo nuevo de esta versión; cada línea sale solo si la cuenta puede usar ese apartado. */
const NOVEDADES: readonly { modulo: ModuleId; texto: string }[] = [
  { modulo: "ajustes", texto: "La app ya está en español, inglés, portugués, francés, alemán e italiano (Ajustes → Apariencia → Idioma)." },
  { modulo: "finanzas_personales", texto: "Mis finanzas: resumen de la semana con gráfica, pagos divididos por monto o porcentaje con enlace o imagen para cobrar, y Rendimientos con las tasas del día." },
  { modulo: "inversiones", texto: "Inversiones: ficha de cada acción con estadísticas, gráficas, finanzas y noticias, y botones a sitios confiables para invertir." },
  { modulo: "cripto", texto: "Cripto: estadísticas y gráficas de cada moneda, y botones a sitios confiables para comprar." },
  { modulo: "ia", texto: "IA: chats con proyectos, memoria y skills; mueve, exporta e importa chats, y usa modelos gratis en tu VPS." },
  { modulo: "boveda", texto: "La huella usa la ventana de Android para abrir la bóveda." },
  { modulo: "notas", texto: "Notas: guarda todos los adjuntos en un .zip." },
  { modulo: "vps_seguridad", texto: "Seguridad del servidor: reinicia el VPS, Docker, Mi Setup o un servicio, con confirmación." },
  { modulo: "vps_archivos", texto: "Archivos del VPS: «Organizar» ya no pisa archivos que se llamen igual." },
  { modulo: "pterodactyl", texto: "Pterodactyl: instala extensiones de Blueprint desde un archivo o desde la tienda gratis." },
  { modulo: "herramientas", texto: "Herramientas: QR con formas y logo, y vista previa HTML que se adapta o se abre en una ventana flotante." },
  { modulo: "host_local", texto: "Servidores en mi PC: mapa de semillas con estructuras e historial, y servidores desde un modpack." },
  { modulo: "codigo", texto: "Código: abre y edita un archivo de tu equipo también desde el navegador o el celular." },
  { modulo: "editor_fotos", texto: "Editor de fotos: borrador, cuentagotas, atajos de teclado y paneles como Photoshop." },
  { modulo: "editor_video", texto: "Editor de video: transiciones, efectos, calidades hasta 4K y difuminar marcas de agua de tus propios videos." },
  { modulo: "documentos", texto: "Documentos: firma un PDF o una foto justo donde tú quieras." },
  { modulo: "sitios", texto: "Sitios y apps: editor cómodo en el celular, botones que llevan a una página, un enlace o un archivo, y exportar o importar sitios." },
];

/** Vuelve a abrir el tutorial (botón en Ajustes). */
export function abrirTutorial(): void {
  window.dispatchEvent(new Event(EVENTO));
}

const claveLocal = (usuarioId: string, version?: string) => `mi-setup.tutorial.${usuarioId}${version ? `.${version}` : ""}`;

function leerVisto(usuarioId: string, version?: string): boolean {
  try {
    return localStorage.getItem(claveLocal(usuarioId, version)) === "1";
  } catch {
    return false;
  }
}

interface Paso {
  titulo: string;
  icono: LucideIcon;
  contenido: ReactNode;
}

function pasoNovedades(puede: (m: ModuleId) => boolean): Paso | null {
  const lista = NOVEDADES.filter((n) => puede(n.modulo));
  if (!lista.length) return null;
  return {
    titulo: `Novedades de la versión ${VERSION_NOVEDADES}`,
    icono: Gift,
    contenido: (
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {lista.map((n) => (
          <li key={n.texto}>{n.texto}</li>
        ))}
      </ul>
    ),
  };
}

function pasos(grupos: GrupoTutorial[], nombre: string, novedades: Paso | null): Paso[] {
  const inicio: Paso = {
    titulo: nombre ? `¡Bienvenido, ${nombre}!` : "¡Bienvenido!",
    icono: Sparkles,
    contenido: (
      <div className="space-y-2 text-sm">
        <p>Mi Setup junta en un solo lugar tus recordatorios, notas, servidores, panel, seguridad y más, sincronizado entre PC y celular.</p>
        <p>En los siguientes pasos verás qué hace cada apartado que tu cuenta puede usar. Toma un minuto.</p>
        <p className="text-tenue">Usa el menú de la izquierda (en el celular, el botón ☰ de arriba) para moverte.</p>
      </div>
    ),
  };
  const porGrupo: Paso[] = grupos.map((g) => ({
    titulo: g.titulo,
    icono: g.icono,
    contenido: (
      <ul className="space-y-3">
        {g.modulos.map((m) => {
          const Icono = m.icono;
          const ayuda = AYUDA[m.id as ModuleId];
          return (
            <li key={m.id} className="flex gap-3">
              <Icono className="mt-0.5 h-5 w-5 shrink-0 text-acento" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{MODULES[m.id].label}</p>
                <p className="text-sm text-tenue">{ayuda?.pasos[0] ?? ""}</p>
              </div>
            </li>
          );
        })}
      </ul>
    ),
  }));
  const fin: Paso = {
    titulo: "Listo para empezar",
    icono: HelpCircle,
    contenido: (
      <div className="space-y-2 text-sm">
        <p>
          En cada apartado hay un botón <strong>¿Cómo se usa?</strong> arriba con los pasos detallados.
        </p>
        <p>
          La <strong>IA</strong> solo propone: nada se ejecuta hasta que tocas <strong>Aprobar</strong>, y lo peligroso pide confirmación doble y tu contraseña o huella.
        </p>
        <p>
          Cambia tema, letra, zoom, voz y modelo de IA en <strong>Ajustes</strong>. Desde ahí también puedes volver a ver este tutorial.
        </p>
      </div>
    ),
  };
  return [inicio, ...porGrupo, ...(novedades ? [novedades] : []), fin];
}

export function Tutorial({ grupos }: { grupos: GrupoTutorial[] }) {
  const { data: me } = useMe();
  const prefs = usePreferencias();
  const guardar = useGuardarPreferencias();
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);
  const [soloNovedades, setSoloNovedades] = useState(false);
  const usuarioId = me?.usuario.id;

  // Primera vez de la cuenta: se abre solo (cuando ya cargaron la cuenta y el menú).
  useEffect(() => {
    if (!usuarioId || !grupos.length) return;
    if (!prefs.tutorialVisto && !leerVisto(usuarioId)) {
      setIndice(0);
      setSoloNovedades(false);
      setAbierto(true);
    } else if (prefs.novedadesVistas !== VERSION_NOVEDADES && !leerVisto(usuarioId, VERSION_NOVEDADES)) {
      // Ya conoce la app: solo le enseñamos lo nuevo de esta versión.
      setIndice(0);
      setSoloNovedades(true);
      setAbierto(true);
    }
  }, [usuarioId, grupos.length, prefs.tutorialVisto, prefs.novedadesVistas]);

  useEffect(() => {
    const abrir = () => {
      setIndice(0);
      setSoloNovedades(false);
      setAbierto(true);
    };
    window.addEventListener(EVENTO, abrir);
    return () => window.removeEventListener(EVENTO, abrir);
  }, []);

  if (!me) return null;
  const puede = (m: ModuleId) => can({ role: me.usuario.role, isActive: true, permissions: me.permisos }, m, "lectura");
  const novedades = pasoNovedades(puede);
  const lista = soloNovedades && novedades ? [novedades] : pasos(grupos, me.usuario.displayName, novedades);
  const paso = lista[Math.min(indice, lista.length - 1)]!;
  const ultimo = indice >= lista.length - 1;
  const Icono = paso.icono;

  const terminar = () => {
    setAbierto(false);
    try {
      localStorage.setItem(claveLocal(me.usuario.id), "1");
      localStorage.setItem(claveLocal(me.usuario.id, VERSION_NOVEDADES), "1");
    } catch {
      // Sin almacenamiento local: basta con la preferencia de la cuenta.
    }
    if (!prefs.tutorialVisto || prefs.novedadesVistas !== VERSION_NOVEDADES) guardar((p) => ({ ...p, tutorialVisto: true, novedadesVistas: VERSION_NOVEDADES }));
  };

  return (
    <Modal abierto={abierto} titulo={soloNovedades ? "Novedades" : "Tutorial"} alCerrar={terminar}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Icono className="h-6 w-6 text-acento" />
          <h3 className="text-lg font-semibold">{paso.titulo}</h3>
        </div>
        <div className="max-h-[55vh] overflow-y-auto pr-1">{paso.contenido}</div>
        <div className="flex justify-center gap-1.5" aria-hidden>
          {lista.map((_, i) => (
            <span key={i} className={cx("h-1.5 rounded-full transition-all", i === indice ? "w-5 bg-acento" : "w-1.5 bg-borde")} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Boton variante="fantasma" onClick={terminar}>
            Saltar
          </Boton>
          <div className="flex gap-2">
            {indice > 0 ? (
              <Boton icono={ChevronLeft} onClick={() => setIndice((i) => i - 1)}>
                Atrás
              </Boton>
            ) : null}
            {ultimo ? (
              <Boton variante="primario" onClick={terminar}>
                Empezar
              </Boton>
            ) : (
              <Boton variante="primario" onClick={() => setIndice((i) => i + 1)}>
                Siguiente <ChevronRight className="h-4 w-4" />
              </Boton>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-tenue">
          Paso {indice + 1} de {lista.length}
        </p>
      </div>
    </Modal>
  );
}
