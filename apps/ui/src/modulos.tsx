/** Registro de apartados de la UI: ruta, ícono y página de cada módulo. */
import type { ModuleCategory, ModuleId } from "@mi-setup/shared";
import {
  Activity,
  Code2,
  Boxes,
  Globe2,
  GraduationCap,
  CalendarDays,
  Clapperboard,
  ClipboardList,
  Cpu,
  FileText,
  Film,
  House,
  Link,
  Music,
  PiggyBank,
  Repeat,
  Share2,
  ShieldAlert,
  Tv,
  Wand2,
  Wrench,
  ArrowLeftRight,
  Bitcoin,
  TrendingUp,
  Archive,
  AtSign,
  ImageIcon,
  Palette,
  Scissors,
  Bell,
  Bot,
  BrainCircuit,
  CalendarClock,
  FolderTree,
  Gamepad2,
  Globe,
  Home,
  KeyRound,
  Lightbulb,
  ListChecks,
  Mail,
  MessageCircle,
  MessagesSquare,
  MonitorSmartphone,
  MonitorUp,
  Newspaper,
  NotebookPen,
  Radio,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Siren,
  Sparkles,
  TerminalSquare,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export interface ModuloUi {
  readonly id: ModuleId;
  readonly ruta: string;
  readonly icono: LucideIcon;
  readonly Pagina: LazyExoticComponent<ComponentType>;
  /** false = no sale en el menú (vive como pestaña de otra pantalla). */
  readonly enMenu?: boolean;
}

const Pendiente = lazy(() => import("./pages/Pendiente"));

function m(id: ModuleId, ruta: string, icono: LucideIcon, Pagina: LazyExoticComponent<ComponentType> = Pendiente): ModuloUi {
  return { id, ruta, icono, Pagina };
}

export const MODULOS_UI: Record<ModuleId, ModuloUi> = {
  recordatorios: m("recordatorios", "/recordatorios", Bell, lazy(() => import("./pages/Recordatorios"))),
  notas: m("notas", "/notas", NotebookPen, lazy(() => import("./pages/Notas"))),
  equipos: m("equipos", "/equipos", MonitorSmartphone, lazy(() => import("./pages/Equipos"))),
  chat: m("chat", "/chat", MessagesSquare, lazy(() => import("./pages/Chat"))),
  calendario: m("calendario", "/calendario", CalendarDays, lazy(() => import("./pages/Calendario"))),
  finanzas_personales: m("finanzas_personales", "/finanzas", PiggyBank, lazy(() => import("./pages/MisFinanzas"))),
  portapapeles: m("portapapeles", "/portapapeles", ClipboardList, lazy(() => import("./pages/Portapapeles"))),

  vps_terminal: m("vps_terminal", "/vps/terminal", TerminalSquare, lazy(() => import("./pages/VpsTerminal"))),
  vps_rendimiento: m("vps_rendimiento", "/vps/rendimiento", Activity, lazy(() => import("./pages/VpsRendimiento"))),
  vps_alertas: m("vps_alertas", "/vps/alertas", Siren, lazy(() => import("./pages/VpsAlertas"))),
  vps_comandos: m("vps_comandos", "/vps/comandos", ListChecks, lazy(() => import("./pages/VpsComandos"))),
  vps_archivos: m("vps_archivos", "/vps/archivos", FolderTree, lazy(() => import("./pages/VpsArchivos"))),
  vps_seguridad: m("vps_seguridad", "/vps/seguridad", ShieldAlert, lazy(() => import("./pages/VpsSeguridad"))),
  vps_bots: m("vps_bots", "/vps/bots", Bot, lazy(() => import("./pages/VpsBots"))),

  pterodactyl: m("pterodactyl", "/panel/pterodactyl", Server, lazy(() => import("./pages/Pterodactyl"))),
  vencimientos: m("vencimientos", "/panel/vencimientos", CalendarClock, lazy(() => import("./pages/Vencimientos"))),
  clientes: m("clientes", "/panel/clientes", Users, lazy(() => import("./pages/Clientes"))),
  finanzas: m("finanzas", "/panel/finanzas", Wallet, lazy(() => import("./pages/Finanzas"))),
  negocio: m("negocio", "/panel/negocio", Lightbulb, lazy(() => import("./pages/Negocio"))),

  respaldos: m("respaldos", "/respaldos", Archive, lazy(() => import("./pages/Respaldos"))),
  vps_agentes: m("vps_agentes", "/vps/agentes", BrainCircuit, lazy(() => import("./pages/VpsAgentes"))),

  boveda: m("boveda", "/seguridad/boveda", KeyRound, lazy(() => import("./pages/Boveda"))),
  autenticador: m("autenticador", "/seguridad/2fa", ShieldCheck, lazy(() => import("./pages/Autenticador"))),
  correos_temporales: m("correos_temporales", "/seguridad/correos", Mail, lazy(() => import("./pages/Correos"))),
  navegador_privado: m("navegador_privado", "/seguridad/navegador", Globe, lazy(() => import("./pages/NavegadorPrivado"))),
  ciberseguridad: m("ciberseguridad", "/seguridad/ciberseguridad", Cpu, lazy(() => import("./pages/Ciberseguridad"))),
  auditoria: m("auditoria", "/seguridad/actividad", ScrollText, lazy(() => import("./pages/Auditoria"))),
  cuentas: m("cuentas", "/seguridad/cuentas", UserCog, lazy(() => import("./pages/Cuentas"))),

  streams: m("streams", "/redes/streams", Radio, lazy(() => import("./pages/Streams"))),
  x: m("x", "/redes/x", AtSign, lazy(() => import("./pages/X"))),
  discord: m("discord", "/redes/discord", MessageCircle, lazy(() => import("./pages/Discord"))),
  streamer: m("streamer", "/redes/streamer", Tv, lazy(() => import("./pages/Streamer"))),

  novedades: m("novedades", "/novedades", Sparkles, lazy(() => import("./pages/Novedades"))),
  // Viven como pestañas de Novedades; sus rutas viejas siguen funcionando.
  noticias: { ...m("noticias", "/noticias", Newspaper, lazy(() => import("./pages/Noticias"))), enMenu: false },
  cripto: { ...m("cripto", "/cripto", Bitcoin, lazy(() => import("./pages/Cripto"))), enMenu: false },
  inversiones: { ...m("inversiones", "/inversiones", TrendingUp, lazy(() => import("./pages/Inversiones"))), enMenu: false },
  divisas: { ...m("divisas", "/divisas", ArrowLeftRight, lazy(() => import("./pages/Divisas"))), enMenu: false },
  herramientas: m("herramientas", "/herramientas", Wrench, lazy(() => import("./pages/Herramientas"))),
  codigo: m("codigo", "/programacion/codigo", Code2, lazy(() => import("./pages/Codigo"))),
  host_local: m("host_local", "/host-local", Boxes, lazy(() => import("./pages/HostLocal"))),
  sitios: m("sitios", "/sitios", Globe2, lazy(() => import("./pages/Sitios"))),
  editor_fotos: m("editor_fotos", "/estudio/fotos", ImageIcon, lazy(() => import("./pages/EditorFotos"))),
  editor_video: m("editor_video", "/estudio/video", Scissors, lazy(() => import("./pages/EditorVideo"))),
  bots_discord: m("bots_discord", "/redes/bots", Bot, lazy(() => import("./pages/BotsDiscord"))),
  ejercicios: m("ejercicios", "/programacion/ejercicios", GraduationCap, lazy(() => import("./pages/Ejercicios"))),
  documentos: m("documentos", "/herramientas/documentos", FileText, lazy(() => import("./pages/Documentos"))),
  convertidor: m("convertidor", "/herramientas/convertidor", Repeat, lazy(() => import("./pages/Convertidor"))),
  enlaces: m("enlaces", "/herramientas/enlaces", Link, lazy(() => import("./pages/Enlaces"))),
  compartir: m("compartir", "/herramientas/compartir", Share2, lazy(() => import("./pages/Compartir"))),
  peliculas: m("peliculas", "/entretenimiento/peliculas", Clapperboard, lazy(() => import("./pages/Peliculas"))),
  musica: m("musica", "/entretenimiento/musica", Music, lazy(() => import("./pages/Musica"))),
  videos: m("videos", "/entretenimiento/videos", Film, lazy(() => import("./pages/Videos"))),
  casa: m("casa", "/casa", House, lazy(() => import("./pages/Casa"))),
  control_remoto: m("control_remoto", "/control-remoto", MonitorUp, lazy(() => import("./pages/ControlRemoto"))),
  ia: m("ia", "/ia", Sparkles, lazy(() => import("./pages/Ia"))),
  ia_creativa: m("ia_creativa", "/ia/creativa", Wand2, lazy(() => import("./pages/IaCreativa"))),
  ajustes: m("ajustes", "/ajustes", Settings, lazy(() => import("./pages/Ajustes"))),
};

export const CATEGORIAS: readonly { id: ModuleCategory; titulo: string; icono: LucideIcon }[] = [
  { id: "principal", titulo: "Menú principal", icono: Home },
  { id: "vps", titulo: "VPS", icono: TerminalSquare },
  { id: "panel", titulo: "Panel", icono: Gamepad2 },
  { id: "seguridad", titulo: "Seguridad", icono: Shield },
  { id: "redes", titulo: "Redes y streams", icono: Radio },
  { id: "novedades", titulo: "Novedades", icono: Newspaper },
  { id: "herramientas", titulo: "Herramientas", icono: Wrench },
  { id: "programacion", titulo: "Programación", icono: Code2 },
  { id: "host_local", titulo: "Host local", icono: Boxes },
  { id: "sitios", titulo: "Sitios web", icono: Globe2 },
  { id: "estudio", titulo: "Estudio creativo", icono: Palette },
  { id: "entretenimiento", titulo: "Entretenimiento", icono: Clapperboard },
  { id: "casa", titulo: "Casa", icono: House },
  { id: "control_remoto", titulo: "Control remoto", icono: MonitorUp },
  { id: "ia", titulo: "IA", icono: Sparkles },
  { id: "ajustes", titulo: "Ajustes", icono: Settings },
];

/**
 * Apartados que en el menú salen como una sola entrada; adentro se cambian con
 * pestañas. Cada uno sigue siendo su propio módulo (ruta y permisos).
 */
export interface GrupoMenu {
  readonly id: string;
  readonly titulo: string;
  readonly icono: LucideIcon;
  readonly miembros: readonly { id: ModuleId; texto: string }[];
}

export const GRUPOS_MENU: readonly GrupoMenu[] = [
  {
    id: "bots",
    titulo: "Bots de Discord",
    icono: Bot,
    miembros: [
      { id: "bots_discord", texto: "Crear y vender bots" },
      { id: "vps_bots", texto: "Bots en mi VPS" },
    ],
  },
  {
    id: "negocio",
    titulo: "Negocio y cobros",
    icono: Wallet,
    miembros: [
      { id: "clientes", texto: "Clientes y cobros" },
      { id: "vencimientos", texto: "Vencimientos" },
      { id: "finanzas", texto: "Gastos e ingresos" },
      { id: "negocio", texto: "Ideas de mejoras" },
    ],
  },
  {
    id: "contrasenas",
    titulo: "Contraseñas y 2FA",
    icono: KeyRound,
    miembros: [
      { id: "boveda", texto: "Gestor de contraseñas" },
      { id: "autenticador", texto: "Autenticador 2FA" },
      { id: "correos_temporales", texto: "Correos temporales" },
    ],
  },
];

export function grupoDe(id: ModuleId): GrupoMenu | undefined {
  return GRUPOS_MENU.find((g) => g.miembros.some((m) => m.id === id));
}

export function moduloPorRuta(ruta: string): ModuloUi | undefined {
  return Object.values(MODULOS_UI)
    .filter((x) => ruta === x.ruta || ruta.startsWith(`${x.ruta}/`))
    .sort((a, b) => b.ruta.length - a.ruta.length)[0];
}
