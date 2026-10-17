/**
 * Pterodactyl: pantallas nativas con la API de cliente (PTERO_CLIENT_KEY,
 * ptlc_) y de aplicación (PTERO_APP_KEY, ptla_) para administración. La
 * consola se lee del WebSocket de Wings desde el servidor y se reenvía por el
 * WebSocket de la app solo mientras alguien la mira.
 */
import { can, temas } from "@mi-setup/shared";
import type { Env } from "../config.js";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { z } from "zod";
import { HttpError, missingConfig } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, type ModuleDeps } from "./common.js";

const idServidor = z.object({ id: z.string().regex(/^[a-zA-Z0-9-]{8,36}$/, "Servidor inválido") });

export class PteroClient {
  /** Lee la configuración en cada petición: un cambio en Ajustes → Servicios se aplica al momento. */
  constructor(private readonly env: Pick<Env, "PTERO_URL" | "PTERO_CLIENT_KEY" | "PTERO_APP_KEY">) {}

  private get base(): string {
    return this.env.PTERO_URL;
  }
  private get claveCliente(): string | undefined {
    return this.env.PTERO_CLIENT_KEY;
  }
  private get claveApp(): string | undefined {
    return this.env.PTERO_APP_KEY;
  }

  get configurado(): boolean {
    return Boolean(this.claveCliente);
  }

  async peticion<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; app?: boolean; texto?: boolean } = {}): Promise<T> {
    const clave = opciones.app ? this.claveApp : this.claveCliente;
    if (!clave) throw missingConfig(opciones.app ? "PTERO_APP_KEY" : "PTERO_CLIENT_KEY");
    const res = await fetch(`${this.base.replace(/\/$/, "")}${ruta}`, {
      method: opciones.metodo ?? "GET",
      headers: {
        authorization: `Bearer ${clave}`,
        accept: "Application/vnd.pterodactyl.v1+json",
        ...(opciones.cuerpo !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    }).catch((err: unknown) => {
      throw new HttpError(502, `No se pudo contactar el panel: ${err instanceof Error ? err.message : "error"}`, "ptero_error");
    });
    if (res.status === 204) return undefined as T;
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      const mensaje = /"detail":"([^"]+)"/.exec(detalle)?.[1] ?? `HTTP ${res.status}`;
      throw new HttpError(res.status === 404 ? 404 : 502, `El panel respondió: ${mensaje}`, "ptero_error");
    }
    return (opciones.texto ? await res.text() : await res.json()) as T;
  }
}

interface ListaPtero<T> {
  data: { attributes: T }[];
}

interface ServidorPtero {
  identifier: string;
  uuid: string;
  name: string;
  description: string;
  node: string;
  is_suspended: boolean;
  limits: { memory: number; disk: number; cpu: number };
  relationships?: { allocations?: ListaPtero<{ ip_alias: string | null; ip: string; port: number; is_default: boolean }> };
}

export function pteroRoutes(deps: ModuleDeps) {
  const ptero = new PteroClient(deps.config.env);
  const consolas = new Map<string, { ws: WebSocket | null; activo: boolean }>();

  const abrirConsola = async (id: string) => {
    const estado = consolas.get(id);
    if (!estado?.activo) return;
    const tema = temas.consolaPtero(id);
    try {
      const { data } = await ptero.peticion<{ data: { token: string; socket: string } }>(`/api/client/servers/${id}/websocket`);
      const ws = new WebSocket(data.socket, { headers: { origin: new URL(deps.config.env.PTERO_URL).origin } });
      estado.ws = ws;
      ws.on("open", () => ws.send(JSON.stringify({ event: "auth", args: [data.token] })));
      ws.on("message", (raw) => {
        let msg: { event: string; args?: string[] };
        try {
          msg = JSON.parse(raw.toString()) as typeof msg;
        } catch {
          return;
        }
        if (msg.event === "auth success") ws.send(JSON.stringify({ event: "send logs", args: [null] }));
        else if (msg.event === "console output" || msg.event === "install output") deps.hub.publicar(tema, { linea: msg.args?.[0] ?? "" });
        else if (msg.event === "status") deps.hub.publicar(tema, { estado: msg.args?.[0] });
        else if (msg.event === "token expiring" || msg.event === "token expired") {
          void ptero
            .peticion<{ data: { token: string } }>(`/api/client/servers/${id}/websocket`)
            .then((r) => ws.send(JSON.stringify({ event: "auth", args: [r.data.token] })))
            .catch(() => ws.close());
        }
      });
      ws.on("close", () => {
        estado.ws = null;
        if (estado.activo) setTimeout(() => void abrirConsola(id), 5_000);
      });
      ws.on("error", () => undefined);
    } catch (err) {
      deps.hub.publicar(tema, { error: err instanceof Error ? err.message : "No se pudo abrir la consola" });
      if (estado.activo) setTimeout(() => void abrirConsola(id), 15_000);
    }
  };

  deps.hub.registrarTema(
    "ptero:",
    (user, tema) => tema.endsWith(":consola") && can(user, "pterodactyl", "lectura"),
    (tema, activos) => {
      const id = tema.split(":")[1] ?? "";
      if (activos > 0 && !consolas.get(id)?.activo) {
        consolas.set(id, { ws: null, activo: true });
        void abrirConsola(id);
      } else if (activos === 0) {
        const e = consolas.get(id);
        if (e) {
          e.activo = false;
          e.ws?.close();
          consolas.delete(id);
        }
      }
    },
  );

  const auditar = (request: import("fastify").FastifyRequest, accion: string, objetivo: string, detalles?: Record<string, unknown>) =>
    deps.audit.record({
      actorType: "usuario",
      actorUserId: currentUser(request).id,
      action: accion,
      module: "pterodactyl",
      target: objetivo,
      outcome: "ok",
      ...(detalles ? { details: detalles } : {}),
      ...clientInfo(request),
    });

  return {
    ptero,
    routes: async function (app: FastifyInstance): Promise<void> {
      const leer = { config: { acceso: { modulo: "pterodactyl" as const, nivel: "lectura" as const } } };
      const escribir = { config: { acceso: { modulo: "pterodactyl" as const, nivel: "escritura" as const } } };

      app.get("/api/ptero/estado", leer, async () => ({
        url: deps.config.env.PTERO_URL,
        cliente: Boolean(deps.config.env.PTERO_CLIENT_KEY),
        administracion: Boolean(deps.config.env.PTERO_APP_KEY),
      }));

      app.get("/api/ptero/servidores", leer, async () => {
        const r = await ptero.peticion<ListaPtero<ServidorPtero>>("/api/client?per_page=100&include=allocations");
        return r.data.map(({ attributes: s }) => {
          const asignacion = s.relationships?.allocations?.data.find((a) => a.attributes.is_default)?.attributes;
          return {
            id: s.identifier,
            uuid: s.uuid,
            nombre: s.name,
            descripcion: s.description,
            nodo: s.node,
            suspendido: s.is_suspended,
            limites: { memoriaMb: s.limits.memory, discoMb: s.limits.disk, cpu: s.limits.cpu },
            direccion: asignacion ? `${asignacion.ip_alias ?? asignacion.ip}:${asignacion.port}` : null,
          };
        });
      });

      app.get("/api/ptero/servidores/:id/recursos", leer, async (request) => {
        const { id } = idServidor.parse(request.params);
        const r = await ptero.peticion<{
          attributes: { current_state: string; resources: { memory_bytes: number; cpu_absolute: number; disk_bytes: number; network_rx_bytes: number; network_tx_bytes: number; uptime: number } };
        }>(`/api/client/servers/${id}/resources`);
        const x = r.attributes.resources;
        return { estado: r.attributes.current_state, cpu: x.cpu_absolute, memoria: x.memory_bytes, disco: x.disk_bytes, rx: x.network_rx_bytes, tx: x.network_tx_bytes, uptimeMs: x.uptime };
      });

      app.post("/api/ptero/servidores/:id/energia", escribir, async (request) => {
        const { id } = idServidor.parse(request.params);
        const { senal } = z.object({ senal: z.enum(["start", "stop", "restart", "kill"]) }).parse(request.body);
        await ptero.peticion(`/api/client/servers/${id}/power`, { metodo: "POST", cuerpo: { signal: senal } });
        await auditar(request, "ptero_energia", id, { senal });
        return { ok: true };
      });

      app.post("/api/ptero/servidores/:id/comando", escribir, async (request) => {
        const { id } = idServidor.parse(request.params);
        const { comando } = z.object({ comando: z.string().trim().min(1).max(1000) }).parse(request.body);
        await ptero.peticion(`/api/client/servers/${id}/command`, { metodo: "POST", cuerpo: { command: comando } });
        await auditar(request, "ptero_comando", id, { comando });
        return { ok: true };
      });

      app.get("/api/ptero/servidores/:id/archivos", leer, async (request) => {
        const { id } = idServidor.parse(request.params);
        const { dir } = z.object({ dir: z.string().max(1000).default("/") }).parse(request.query);
        const r = await ptero.peticion<ListaPtero<{ name: string; size: number; is_file: boolean; modified_at: string; mode: string }>>(
          `/api/client/servers/${id}/files/list?directory=${encodeURIComponent(dir)}`,
        );
        return r.data
          .map(({ attributes: f }) => ({ nombre: f.name, tamano: f.size, archivo: f.is_file, modificado: f.modified_at, permisos: f.mode }))
          .sort((a, b) => (a.archivo === b.archivo ? a.nombre.localeCompare(b.nombre) : a.archivo ? 1 : -1));
      });

      app.get("/api/ptero/servidores/:id/archivos/contenido", leer, async (request) => {
        const { id } = idServidor.parse(request.params);
        const { archivo } = z.object({ archivo: z.string().min(1).max(1000) }).parse(request.query);
        const texto = await ptero.peticion<string>(`/api/client/servers/${id}/files/contents?file=${encodeURIComponent(archivo)}`, { texto: true });
        return { contenido: texto.length > 1_000_000 ? `${texto.slice(0, 1_000_000)}\n…(recortado)` : texto };
      });

      app.get("/api/ptero/servidores/:id/respaldos", leer, async (request) => {
        const { id } = idServidor.parse(request.params);
        const r = await ptero.peticion<ListaPtero<{ uuid: string; name: string; bytes: number; created_at: string; completed_at: string | null; is_successful: boolean }>>(
          `/api/client/servers/${id}/backups`,
        );
        return r.data
          .map(({ attributes: b }) => ({ uuid: b.uuid, nombre: b.name, bytes: b.bytes, creado: b.created_at, completado: b.completed_at, exitoso: b.is_successful }))
          .sort((a, b) => b.creado.localeCompare(a.creado));
      });

      app.post("/api/ptero/servidores/:id/respaldos", escribir, async (request) => {
        const { id } = idServidor.parse(request.params);
        await ptero.peticion(`/api/client/servers/${id}/backups`, { metodo: "POST", cuerpo: {} });
        await auditar(request, "ptero_respaldo", id);
        return { ok: true };
      });

      // Administración (llave de aplicación): todos los servidores y suspensión.
      app.get("/api/ptero/admin/servidores", { config: { acceso: { modulo: "pterodactyl", nivel: "administrar" } } }, async () => {
        const r = await ptero.peticion<ListaPtero<{ id: number; identifier: string; name: string; suspended: boolean; user: number; node: number }>>(
          "/api/application/servers?per_page=100",
          { app: true },
        );
        return r.data.map(({ attributes: s }) => ({ idApp: s.id, id: s.identifier, nombre: s.name, suspendido: s.suspended, usuario: s.user, nodo: s.node }));
      });

      app.post(
        "/api/ptero/admin/servidores/:idApp/:accion",
        { config: { acceso: { modulo: "pterodactyl", nivel: "administrar", reauth: "pin" } } },
        async (request) => {
          const { idApp, accion } = z.object({ idApp: z.coerce.number().int().positive(), accion: z.enum(["suspend", "unsuspend"]) }).parse(request.params);
          await ptero.peticion(`/api/application/servers/${idApp}/${accion}`, { metodo: "POST", app: true });
          await auditar(request, `ptero_${accion}`, String(idApp));
          return { ok: true };
        },
      );
    },
  };
}
