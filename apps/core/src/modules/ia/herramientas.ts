/**
 * Herramientas que la IA puede PROPONER. Ninguna se ejecuta desde aquí por
 * iniciativa de la IA: `ejecutar` solo lo llama la ruta de aprobación después
 * de que el usuario toca "Aprobar" (y, si es peligrosa, confirma y se
 * reautentica).
 */
import { analizarComando, can, type ModuleId } from "@mi-setup/shared";
import { z } from "zod";
import type { AuthUser } from "../../security/rbac.js";
import { enviarMensaje } from "../chat.js";
import type { ModuleDeps } from "../common.js";
import { crearNota } from "../notas.js";
import type { PteroClient } from "../ptero.js";
import { crearRecordatorio, REPETICIONES } from "../recordatorios.js";
import { ejecutarSeguro } from "../vps/comandos.js";
import type { Servidores } from "../vps/servidores.js";

/** Texto que el usuario escribe para confirmar una acción peligrosa propuesta por la IA. */
export const CONFIRMACION_PELIGROSA = "EJECUTAR";

export interface Herramienta<T = unknown> {
  readonly nombre: string;
  readonly descripcion: string;
  readonly modulo: ModuleId;
  readonly esquema: z.ZodType<T>;
  /** Esquema JSON que ve el modelo. */
  readonly inputSchema: Record<string, unknown>;
  describir(input: T): string;
  peligroso(input: T): boolean;
  ejecutar(user: AuthUser, input: T): Promise<unknown>;
  /** Al ejecutarse (tras aprobar), el resultado se agrega a la conversación para que la IA lo analice. */
  readonly alimentaIa?: boolean;
}

/** Revisiones de solo lectura que la IA puede proponer para diagnosticar un VPS. */
export const REVISIONES_VPS = {
  estado_general: { texto: "Estado general (carga, memoria, disco, procesos)", comando: "uptime; echo; free -m; echo; df -h -x tmpfs -x devtmpfs; echo; top -bn1 | head -n 20" },
  contenedores: { texto: "Contenedores de Docker", comando: "docker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Image}}'" },
  logs_contenedor: { texto: "Últimos registros de un contenedor", comando: "" },
  servicios_fallidos: { texto: "Servicios del sistema con fallas", comando: "systemctl --failed --no-pager" },
  errores_sistema: { texto: "Errores recientes del sistema", comando: "journalctl -p err -n 80 --no-pager" },
  puertos: { texto: "Puertos abiertos y quién los usa", comando: "ss -tulpn | head -n 60" },
  procesos_memoria: { texto: "Procesos que más memoria usan", comando: "ps aux --sort=-%mem | head -n 15" },
  red: { texto: "Red e internet", comando: "ip -brief addr; echo; ping -c 3 -W 2 1.1.1.1" },
} as const;
export type RevisionVps = keyof typeof REVISIONES_VPS;

/** Archivos que la IA nunca debe leer (secretos). */
const ARCHIVO_SECRETO = /(^|\/)\.env|shadow|passwd-|id_rsa|id_ed25519|id_ecdsa|\.pem$|\.key$|\.p12$|secret|password|contrase|credential|token|\.kdbx$|authorized_keys/i;

function comandoRevision(i: { revision: RevisionVps; contenedor?: string | undefined }): string {
  if (i.revision === "logs_contenedor") return `docker logs --tail 150 ${i.contenedor} 2>&1`;
  return REVISIONES_VPS[i.revision].comando;
}

export interface ContextoHerramientas {
  readonly deps: ModuleDeps;
  readonly servidores: Servidores;
  readonly ptero: PteroClient;
}

function definir<T>(h: Herramienta<T>): Herramienta {
  return h as unknown as Herramienta;
}

const objeto = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export function crearHerramientas(ctx: ContextoHerramientas, extras: Herramienta[] = []): Herramienta[] {
  const { deps } = ctx;
  const base: Herramienta[] = [
    definir({
      nombre: "crear_recordatorio",
      descripcion: "Propone crear un recordatorio para el usuario. Fecha en ISO 8601 con zona horaria.",
      modulo: "recordatorios",
      esquema: z.object({
        titulo: z.string().trim().min(1).max(200),
        notas: z.string().max(2000).default(""),
        fecha: z.string().datetime({ offset: true }),
        repeticion: z.enum(REPETICIONES).default("nunca"),
      }),
      inputSchema: objeto(
        {
          titulo: { type: "string", description: "Título corto" },
          notas: { type: "string" },
          fecha: { type: "string", description: "Fecha y hora ISO 8601, p. ej. 2026-10-20T09:00:00-06:00" },
          repeticion: { type: "string", enum: [...REPETICIONES] },
        },
        ["titulo", "fecha"],
      ),
      describir: (i) => `Crear recordatorio "${i.titulo}" para ${new Date(i.fecha).toLocaleString("es-MX")}`,
      peligroso: () => false,
      ejecutar: (user, i) => crearRecordatorio(deps, user.id, { ...i, fecha: new Date(i.fecha) }, "ia"),
    }),
    definir({
      nombre: "crear_nota",
      descripcion: "Propone guardar una nota en el bloc de notas del usuario.",
      modulo: "notas",
      esquema: z.object({ titulo: z.string().trim().max(200).default(""), contenido: z.string().max(20_000) }),
      inputSchema: objeto({ titulo: { type: "string" }, contenido: { type: "string" } }, ["contenido"]),
      describir: (i) => `Crear nota "${i.titulo || i.contenido.slice(0, 40)}"`,
      peligroso: () => false,
      ejecutar: (user, i) => crearNota(deps, user.id, i),
    }),
    definir({
      nombre: "enviar_mensaje_chat",
      descripcion: "Propone enviar un mensaje a un canal del chat interno (usa un canalId del contexto).",
      modulo: "chat",
      esquema: z.object({ canalId: z.string().uuid(), texto: z.string().trim().min(1).max(4000) }),
      inputSchema: objeto({ canalId: { type: "string" }, texto: { type: "string" } }, ["canalId", "texto"]),
      describir: (i) => `Enviar al chat: "${i.texto.slice(0, 80)}"`,
      peligroso: () => false,
      ejecutar: (user, i) => enviarMensaje(deps, user.id, i.canalId, { texto: i.texto }),
    }),
    definir({
      nombre: "ejecutar_comando_vps",
      descripcion:
        "Propone ejecutar un comando de shell en un servidor VPS registrado (usa un servidorId del contexto). Los comandos destructivos requieren doble confirmación del usuario.",
      modulo: "vps_comandos",
      esquema: z.object({ servidorId: z.string().uuid(), comando: z.string().trim().min(1).max(4000) }),
      inputSchema: objeto({ servidorId: { type: "string" }, comando: { type: "string" } }, ["servidorId", "comando"]),
      describir: (i) => `Ejecutar en VPS: ${i.comando.slice(0, 200)}`,
      peligroso: (i) => analizarComando(i.comando).peligroso,
      ejecutar: (user, i) =>
        ejecutarSeguro(deps, ctx.servidores, user, {
          servidorId: i.servidorId,
          comando: i.comando,
          // La ruta de aprobación ya exigió la doble confirmación y la reautenticación.
          confirmacion: CONFIRMACION_PELIGROSA,
          textoEsperado: CONFIRMACION_PELIGROSA,
          origen: "ia",
        }),
    }),
    definir({
      nombre: "diagnosticar_vps",
      descripcion:
        "Propone una revisión de SOLO LECTURA en un VPS para encontrar errores (estado, contenedores, logs de un contenedor, servicios con fallas, errores del sistema, puertos, memoria, red). Úsala cuando el usuario reporte que algo falla. Al aprobarse, recibirás la salida para analizarla y explicar la causa y la solución.",
      modulo: "vps_comandos",
      esquema: z
        .object({
          servidorId: z.string().uuid(),
          revision: z.enum(Object.keys(REVISIONES_VPS) as [RevisionVps, ...RevisionVps[]]),
          contenedor: z
            .string()
            .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/, "Nombre de contenedor inválido")
            .optional(),
        })
        .refine((i) => i.revision !== "logs_contenedor" || Boolean(i.contenedor), "Indica el contenedor"),
      inputSchema: objeto(
        {
          servidorId: { type: "string" },
          revision: { type: "string", enum: Object.keys(REVISIONES_VPS), description: Object.entries(REVISIONES_VPS).map(([k, v]) => `${k}: ${v.texto}`).join("; ") },
          contenedor: { type: "string", description: "Solo para logs_contenedor, p. ej. misetup-core" },
        },
        ["servidorId", "revision"],
      ),
      describir: (i) => `Revisar (solo lectura): ${REVISIONES_VPS[i.revision].texto}${i.contenedor ? ` de ${i.contenedor}` : ""} → ${comandoRevision(i)}`,
      peligroso: () => false,
      alimentaIa: true,
      ejecutar: (user, i) =>
        ejecutarSeguro(deps, ctx.servidores, user, {
          servidorId: i.servidorId,
          comando: comandoRevision(i),
          confirmacion: CONFIRMACION_PELIGROSA,
          textoEsperado: CONFIRMACION_PELIGROSA,
          origen: "ia",
        }),
    }),
    definir({
      nombre: "leer_archivo_vps",
      descripcion:
        "Propone leer (solo lectura) un archivo de texto del VPS para explicar su código o encontrar un error de configuración. Nunca pidas archivos de secretos (.env, llaves, contraseñas). Al aprobarse, recibirás el contenido.",
      modulo: "vps_comandos",
      esquema: z.object({
        servidorId: z.string().uuid(),
        ruta: z
          .string()
          .regex(/^\/[\w@%+=:,./-]{1,300}$/, "Ruta absoluta sin espacios ni caracteres especiales")
          .refine((r) => !r.split("/").includes(".."), "Ruta inválida")
          .refine((r) => !ARCHIVO_SECRETO.test(r), "Ese archivo puede tener secretos: la IA no lo lee"),
        desde: z.number().int().min(1).max(1_000_000).default(1),
      }),
      inputSchema: objeto(
        { servidorId: { type: "string" }, ruta: { type: "string", description: "Ruta absoluta, p. ej. /opt/mi-setup/app/docker-compose.yml" }, desde: { type: "integer", description: "Línea inicial (lee 300 líneas)" } },
        ["servidorId", "ruta"],
      ),
      describir: (i) => `Leer (solo lectura) ${i.ruta}, líneas ${i.desde ?? 1}–${(i.desde ?? 1) + 299}`,
      peligroso: () => false,
      alimentaIa: true,
      ejecutar: (user, i) =>
        ejecutarSeguro(deps, ctx.servidores, user, {
          servidorId: i.servidorId,
          comando: `sed -n '${i.desde ?? 1},${(i.desde ?? 1) + 299}p' -- '${i.ruta}'`,
          confirmacion: CONFIRMACION_PELIGROSA,
          textoEsperado: CONFIRMACION_PELIGROSA,
          origen: "ia",
        }),
    }),
    definir({
      nombre: "estado_servidor_juego",
      descripcion: "Propone consultar (solo lectura) el estado y uso de recursos de un servidor de Pterodactyl para diagnosticar si está caído o saturado.",
      modulo: "pterodactyl",
      esquema: z.object({ servidorId: z.string().regex(/^[a-z0-9-]{8,36}$/i) }),
      inputSchema: objeto({ servidorId: { type: "string" } }, ["servidorId"]),
      describir: (i) => `Consultar estado del servidor de juego ${i.servidorId}`,
      peligroso: () => false,
      alimentaIa: true,
      ejecutar: async (_user, i) => {
        const r = await ctx.ptero.peticion<{ attributes: unknown }>(`/api/client/servers/${i.servidorId}/resources`);
        return r.attributes;
      },
    }),
    definir({
      nombre: "energia_servidor_juego",
      descripcion: "Propone encender, apagar, reiniciar o forzar el apagado (kill) de un servidor de Pterodactyl (identificador corto).",
      modulo: "pterodactyl",
      esquema: z.object({
        servidorId: z.string().regex(/^[a-z0-9-]{8,36}$/i),
        senal: z.enum(["start", "stop", "restart", "kill"]),
      }),
      inputSchema: objeto(
        { servidorId: { type: "string" }, senal: { type: "string", enum: ["start", "stop", "restart", "kill"] } },
        ["servidorId", "senal"],
      ),
      describir: (i) => {
        const textos = { start: "Encender", stop: "Apagar", restart: "Reiniciar", kill: "Forzar apagado de" } as const;
        return `${textos[i.senal]} el servidor de juego ${i.servidorId}`;
      },
      peligroso: (i) => i.senal === "kill",
      ejecutar: async (_user, i) => {
        await ctx.ptero.peticion(`/api/client/servers/${i.servidorId}/power`, { metodo: "POST", cuerpo: { signal: i.senal } });
        return { ok: true };
      },
    }),
  ];
  return [...base, ...extras];
}

/** Solo se ofrecen al modelo las herramientas que el usuario podría aprobar. */
export function herramientasPermitidas(todas: readonly Herramienta[], user: AuthUser): Herramienta[] {
  return todas.filter((h) => can(user, h.modulo, "escritura"));
}
