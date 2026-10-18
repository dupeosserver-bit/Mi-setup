/**
 * Catálogo de módulos de Mi Setup. Cada apartado de la app es un módulo y
 * los permisos se asignan por módulo (RBAC).
 */

export const MODULE_CATEGORIES = [
  "principal",
  "vps",
  "panel",
  "respaldos",
  "seguridad",
  "redes",
  "novedades",
  "herramientas",
  "entretenimiento",
  "casa",
  "control_remoto",
  "ia",
  "ajustes",
] as const;

export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

export interface ModuleDefinition {
  /** Nombre visible en la interfaz. */
  readonly label: string;
  readonly category: ModuleCategory;
  /** Si es true, solo la cuenta maestra puede acceder (no se puede delegar). */
  readonly masterOnly: boolean;
}

export const MODULES = {
  // Menú principal
  recordatorios: { label: "Recordatorios", category: "principal", masterOnly: false },
  notas: { label: "Bloc de notas", category: "principal", masterOnly: false },
  equipos: { label: "Equipos", category: "principal", masterOnly: false },
  chat: { label: "Chat", category: "principal", masterOnly: false },
  calendario: { label: "Calendario", category: "principal", masterOnly: false },
  finanzas_personales: { label: "Mis finanzas", category: "principal", masterOnly: false },
  portapapeles: { label: "Portapapeles", category: "principal", masterOnly: false },

  // VPS (los accesos a VPS son solo de la cuenta maestra)
  vps_terminal: { label: "Terminal", category: "vps", masterOnly: true },
  vps_rendimiento: { label: "Rendimiento", category: "vps", masterOnly: true },
  vps_alertas: { label: "Alertas de caída", category: "vps", masterOnly: false },
  vps_comandos: { label: "Comandos guardados", category: "vps", masterOnly: true },
  vps_archivos: { label: "Archivos", category: "vps", masterOnly: true },
  vps_bots: { label: "Bots de Discord", category: "vps", masterOnly: false },
  vps_seguridad: { label: "Seguridad del servidor", category: "vps", masterOnly: true },

  // Panel (hosting)
  pterodactyl: { label: "Pterodactyl", category: "panel", masterOnly: false },
  vencimientos: { label: "Vencimientos", category: "panel", masterOnly: false },
  clientes: { label: "Clientes y cobros", category: "panel", masterOnly: false },
  finanzas: { label: "Gastos e ingresos", category: "panel", masterOnly: false },
  negocio: { label: "Mejoras del negocio", category: "panel", masterOnly: false },

  // Respaldos
  respaldos: { label: "Respaldos", category: "respaldos", masterOnly: false },

  // Seguridad
  boveda: { label: "Gestor de contraseñas", category: "seguridad", masterOnly: true },
  autenticador: { label: "Autenticador 2FA", category: "seguridad", masterOnly: true },
  correos_temporales: { label: "Correos temporales", category: "seguridad", masterOnly: false },
  vpn: { label: "VPN", category: "seguridad", masterOnly: false },
  navegador_privado: { label: "Navegador privado", category: "seguridad", masterOnly: false },
  ciberseguridad: { label: "Ciberseguridad", category: "seguridad", masterOnly: false },
  auditoria: { label: "Registro de actividad", category: "seguridad", masterOnly: true },
  cuentas: { label: "Cuentas y permisos", category: "seguridad", masterOnly: true },

  // Redes y streams
  streams: { label: "Streams", category: "redes", masterOnly: false },
  x: { label: "X (Twitter)", category: "redes", masterOnly: false },
  discord: { label: "Discord", category: "redes", masterOnly: false },
  streamer: { label: "Modo streamer", category: "redes", masterOnly: false },

  // Novedades
  novedades: { label: "Novedades", category: "novedades", masterOnly: false },
  noticias: { label: "Noticias", category: "novedades", masterOnly: false },
  cripto: { label: "Cripto", category: "novedades", masterOnly: false },
  inversiones: { label: "Inversiones", category: "novedades", masterOnly: false },
  divisas: { label: "Cambio de monedas", category: "novedades", masterOnly: false },

  // Herramientas
  herramientas: { label: "Herramientas", category: "herramientas", masterOnly: false },
  documentos: { label: "Documentos y PDF", category: "herramientas", masterOnly: false },
  convertidor: { label: "Convertidor", category: "herramientas", masterOnly: false },
  enlaces: { label: "Enlaces cortos", category: "herramientas", masterOnly: false },
  compartir: { label: "Compartir archivos", category: "herramientas", masterOnly: false },

  // Entretenimiento
  peliculas: { label: "Películas y series", category: "entretenimiento", masterOnly: false },
  musica: { label: "Música", category: "entretenimiento", masterOnly: false },
  videos: { label: "Mis videos", category: "entretenimiento", masterOnly: false },

  // Casa
  casa: { label: "Mi casa", category: "casa", masterOnly: false },

  // Control remoto
  control_remoto: { label: "Control remoto", category: "control_remoto", masterOnly: true },

  // IA asistente
  ia: { label: "IA asistente", category: "ia", masterOnly: false },
  ia_creativa: { label: "IA creativa", category: "ia", masterOnly: false },

  // Ajustes
  ajustes: { label: "Ajustes", category: "ajustes", masterOnly: false },
} as const satisfies Record<string, ModuleDefinition>;

export type ModuleId = keyof typeof MODULES;

export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

export function isModuleId(value: string): value is ModuleId {
  return Object.prototype.hasOwnProperty.call(MODULES, value);
}
