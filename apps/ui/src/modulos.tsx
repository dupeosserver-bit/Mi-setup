/** Registro de apartados de la UI: ruta, ícono y página de cada módulo. */
import type { ModuleCategory, ModuleId } from "@mi-setup/shared";
import {
  Activity,
  ArrowLeftRight,
  Bitcoin,
  TrendingUp,
  Archive,
  AtSign,
  Bell,
  Bot,
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

  vps_terminal: m("vps_terminal", "/vps/terminal", TerminalSquare, lazy(() => import("./pages/VpsTerminal"))),
  vps_rendimiento: m("vps_rendimiento", "/vps/rendimiento", Activity, lazy(() => import("./pages/VpsRendimiento"))),
  vps_alertas: m("vps_alertas", "/vps/alertas", Siren, lazy(() => import("./pages/VpsAlertas"))),
  vps_comandos: m("vps_comandos", "/vps/comandos", ListChecks, lazy(() => import("./pages/VpsComandos"))),
  vps_archivos: m("vps_archivos", "/vps/archivos", FolderTree, lazy(() => import("./pages/VpsArchivos"))),
  vps_bots: m("vps_bots", "/vps/bots", Bot, lazy(() => import("./pages/VpsBots"))),

  pterodactyl: m("pterodactyl", "/panel/pterodactyl", Server, lazy(() => import("./pages/Pterodactyl"))),
  vencimientos: m("vencimientos", "/panel/vencimientos", CalendarClock, lazy(() => import("./pages/Vencimientos"))),
  clientes: m("clientes", "/panel/clientes", Users, lazy(() => import("./pages/Clientes"))),
  finanzas: m("finanzas", "/panel/finanzas", Wallet, lazy(() => import("./pages/Finanzas"))),
  negocio: m("negocio", "/panel/negocio", Lightbulb, lazy(() => import("./pages/Negocio"))),

  respaldos: m("respaldos", "/respaldos", Archive, lazy(() => import("./pages/Respaldos"))),

  boveda: m("boveda", "/seguridad/boveda", KeyRound, lazy(() => import("./pages/Boveda"))),
  autenticador: m("autenticador", "/seguridad/2fa", ShieldCheck, lazy(() => import("./pages/Autenticador"))),
  correos_temporales: m("correos_temporales", "/seguridad/correos", Mail, lazy(() => import("./pages/Correos"))),
  vpn: m("vpn", "/seguridad/vpn", Shield, lazy(() => import("./pages/Vpn"))),
  navegador_privado: m("navegador_privado", "/seguridad/navegador", Globe, lazy(() => import("./pages/NavegadorPrivado"))),
  auditoria: m("auditoria", "/seguridad/actividad", ScrollText, lazy(() => import("./pages/Auditoria"))),
  cuentas: m("cuentas", "/seguridad/cuentas", UserCog, lazy(() => import("./pages/Cuentas"))),

  streams: m("streams", "/redes/streams", Radio, lazy(() => import("./pages/Streams"))),
  x: m("x", "/redes/x", AtSign, lazy(() => import("./pages/X"))),
  discord: m("discord", "/redes/discord", MessageCircle, lazy(() => import("./pages/Discord"))),

  novedades: m("novedades", "/novedades", Sparkles, lazy(() => import("./pages/Novedades"))),
  noticias: m("noticias", "/noticias", Newspaper, lazy(() => import("./pages/Noticias"))),
  cripto: m("cripto", "/cripto", Bitcoin, lazy(() => import("./pages/Cripto"))),
  inversiones: m("inversiones", "/inversiones", TrendingUp, lazy(() => import("./pages/Inversiones"))),
  divisas: m("divisas", "/divisas", ArrowLeftRight, lazy(() => import("./pages/Divisas"))),
  control_remoto: m("control_remoto", "/control-remoto", MonitorUp, lazy(() => import("./pages/ControlRemoto"))),
  ia: m("ia", "/ia", Sparkles, lazy(() => import("./pages/Ia"))),
  ajustes: m("ajustes", "/ajustes", Settings, lazy(() => import("./pages/Ajustes"))),
};

export const CATEGORIAS: readonly { id: ModuleCategory; titulo: string; icono: LucideIcon }[] = [
  { id: "principal", titulo: "Menú principal", icono: Home },
  { id: "vps", titulo: "VPS", icono: TerminalSquare },
  { id: "panel", titulo: "Panel", icono: Gamepad2 },
  { id: "respaldos", titulo: "Respaldos", icono: Archive },
  { id: "seguridad", titulo: "Seguridad", icono: Shield },
  { id: "redes", titulo: "Redes y streams", icono: Radio },
  { id: "novedades", titulo: "Novedades", icono: Newspaper },
  { id: "control_remoto", titulo: "Control remoto", icono: MonitorUp },
  { id: "ia", titulo: "IA", icono: Sparkles },
  { id: "ajustes", titulo: "Ajustes", icono: Settings },
];

export function moduloPorRuta(ruta: string): ModuloUi | undefined {
  return Object.values(MODULOS_UI)
    .filter((x) => ruta === x.ruta || ruta.startsWith(`${x.ruta}/`))
    .sort((a, b) => b.ruta.length - a.ruta.length)[0];
}
