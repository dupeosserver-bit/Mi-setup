/**
 * Administración de Pterodactyl con la API de aplicación (PTERO_APP_KEY):
 * cuentas del panel, crear y borrar servidores, nodos (con su config de Wings
 * y puertos) y eggs. Importar eggs y las extensiones de Blueprint no existen en
 * la API: se hacen por SSH en el VPS donde está instalado el panel.
 */
import { can } from "@mi-setup/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, type ModuleDeps } from "./common.js";
import type { PteroClient } from "./ptero.js";
import type { Servidores } from "./vps/servidores.js";
import { citar, ejecutar } from "./vps/ssh.js";

interface Lista<T> {
  data: { attributes: T }[];
}

const PANEL = "/var/www/pterodactyl";
const idNum = z.object({ id: z.coerce.number().int().positive() });
const idExtension = /^[a-zA-Z0-9_-]{1,64}$/;

/** Prefijo para correr artisan como el dueño del panel (no como root: dejaría logs que el panel no puede escribir). */
const COMO_PANEL = `cd ${PANEL} || { echo "NOPANEL"; exit 3; }; DUENO=$(stat -c %U storage); if [ "$(id -u)" = 0 ]; then C="runuser -u $DUENO --"; else C="sudo -n -u $DUENO"; fi;`;

/** Lee la lista de extensiones de Blueprint (salida del script de abajo). */
export function leerExtensiones(salida: string): { blueprint: boolean; extensiones: { id: string; nombre: string; version: string; autor: string }[] } {
  const lineas = salida.split("\n").map((l) => l.trim());
  return {
    blueprint: lineas.includes("BP:1"),
    extensiones: lineas
      .filter((l) => l.startsWith("EXT|"))
      .map((l) => {
        const [, id = "", nombre = "", version = "", autor = ""] = l.split("|");
        return { id, nombre: nombre || id, version, autor };
      })
      .filter((e) => idExtension.test(e.id) && e.id !== "blueprint"),
  };
}

const SCRIPT_EXTENSIONES = `cd ${PANEL} 2>/dev/null || { echo NOPANEL; exit 0; }
command -v blueprint >/dev/null 2>&1 && echo BP:1 || echo BP:0
campo() { [ -n "$2" ] && grep -m1 -E "^[[:space:]]*$1:" "$2" | sed -E "s/^[^:]*:[[:space:]]*//; s/[\\"'|]//g"; }
for d in .blueprint/extensions/*/; do
  [ -d "$d" ] || continue
  id=$(basename "$d"); f=$(find "$d" -maxdepth 4 -name conf.yml 2>/dev/null | head -1)
  echo "EXT|$id|$(campo name "$f")|$(campo version "$f")|$(campo author "$f")"
done`;

export function pteroAdminRoutes(deps: ModuleDeps, ptero: PteroClient, servidores: Servidores) {
  const app_ = <T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}) => ptero.peticion<T>(ruta, { ...opciones, app: true });
  const auditar = (request: FastifyRequest, accion: string, objetivo: string, detalles: Record<string, unknown> = {}) =>
    deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: accion, module: "pterodactyl", target: objetivo, outcome: "ok", details: detalles, ...clientInfo(request) });

  /** Las tareas por SSH (eggs, Blueprint) corren en el VPS: además piden el permiso de comandos del VPS. */
  const servidorPanel = async (request: FastifyRequest, servidorId?: string) => {
    if (!can(currentUser(request), "vps_comandos", "administrar")) throw new HttpError(403, "Necesitas el permiso de comandos del VPS para esto", "sin_permiso");
    const lista = await servidores.listar();
    const s = servidorId ? lista.find((x) => x.id === servidorId) : lista[0];
    if (!s) throw new HttpError(400, "Agrega primero el VPS donde está el panel (VPS → Terminal)");
    return s;
  };

  return async function (app: FastifyInstance): Promise<void> {
    const leer = { config: { acceso: { modulo: "pterodactyl" as const, nivel: "administrar" as const } } };
    const cambiar = { config: { acceso: { modulo: "pterodactyl" as const, nivel: "administrar" as const, reauth: "pin" as const } } };
    const peligro = { config: { acceso: { modulo: "pterodactyl" as const, nivel: "administrar" as const, reauth: "fuerte" as const } } };

    // ------------------------------------------------------------ cuentas
    app.get("/api/ptero/admin/usuarios", leer, async () => {
      const r = await app_<Lista<{ id: number; username: string; email: string; first_name: string; last_name: string; root_admin: boolean; "2fa": boolean; created_at: string }>>(
        "/api/application/users?per_page=100",
      );
      return r.data.map(({ attributes: u }) => ({ id: u.id, usuario: u.username, correo: u.email, nombre: `${u.first_name} ${u.last_name}`.trim(), admin: u.root_admin, dosPasos: u["2fa"], creado: u.created_at }));
    });

    app.post("/api/ptero/admin/usuarios", cambiar, async (request) => {
      const d = z
        .object({
          correo: z.string().trim().toLowerCase().email(),
          usuario: z.string().trim().regex(/^[a-zA-Z0-9_.-]{1,60}$/, "Usuario: letras, números, punto, guion o guion bajo"),
          nombre: z.string().trim().min(1).max(60),
          apellido: z.string().trim().max(60).default(""),
          password: z.string().min(8).max(200).optional(),
          admin: z.boolean().default(false),
        })
        .parse(request.body);
      const r = await app_<{ attributes: { id: number } }>("/api/application/users", {
        metodo: "POST",
        cuerpo: { email: d.correo, username: d.usuario, first_name: d.nombre, last_name: d.apellido || "-", root_admin: d.admin, ...(d.password ? { password: d.password } : {}) },
      });
      await auditar(request, "ptero_usuario_creado", d.correo);
      return { ok: true, id: r.attributes.id };
    });

    app.delete("/api/ptero/admin/usuarios/:id", peligro, async (request) => {
      const { id } = idNum.parse(request.params);
      await app_(`/api/application/users/${id}`, { metodo: "DELETE" });
      await auditar(request, "ptero_usuario_borrado", String(id));
      return { ok: true };
    });

    // ------------------------------------------------------------ servidores
    app.post("/api/ptero/admin/servidores", cambiar, async (request) => {
      const d = z
        .object({
          nombre: z.string().trim().min(1).max(191),
          usuario: z.number().int().positive(),
          nido: z.number().int().positive(),
          egg: z.number().int().positive(),
          asignacion: z.number().int().positive(),
          memoriaMb: z.number().int().min(128).max(1_048_576),
          discoMb: z.number().int().min(256).max(10_485_760),
          cpu: z.number().int().min(0).max(10_000).default(0),
          bases: z.number().int().min(0).max(50).default(0),
          respaldos: z.number().int().min(0).max(50).default(1),
          variables: z.record(z.string().regex(/^[A-Z0-9_]{1,191}$/), z.string().max(1000)).default({}),
        })
        .parse(request.body);
      const egg = await app_<{
        attributes: { docker_image: string; startup: string; relationships?: { variables?: Lista<{ env_variable: string; default_value: string | null }> } };
      }>(`/api/application/nests/${d.nido}/eggs/${d.egg}?include=variables`);
      const entorno = Object.fromEntries((egg.attributes.relationships?.variables?.data ?? []).map(({ attributes: v }) => [v.env_variable, d.variables[v.env_variable] ?? v.default_value ?? ""]));
      const r = await app_<{ attributes: { id: number; identifier: string } }>("/api/application/servers", {
        metodo: "POST",
        cuerpo: {
          name: d.nombre,
          user: d.usuario,
          egg: d.egg,
          docker_image: egg.attributes.docker_image,
          startup: egg.attributes.startup,
          environment: entorno,
          limits: { memory: d.memoriaMb, swap: 0, disk: d.discoMb, io: 500, cpu: d.cpu },
          feature_limits: { databases: d.bases, allocations: 1, backups: d.respaldos },
          allocation: { default: d.asignacion },
          start_on_completion: true,
        },
      });
      await auditar(request, "ptero_servidor_creado", d.nombre, { id: r.attributes.id });
      return { ok: true, id: r.attributes.id, identificador: r.attributes.identifier };
    });

    app.delete("/api/ptero/admin/servidores/:id", peligro, async (request) => {
      const { id } = idNum.parse(request.params);
      const { forzar } = z.object({ forzar: z.enum(["0", "1"]).default("0") }).parse(request.query);
      await app_(`/api/application/servers/${id}${forzar === "1" ? "/force" : ""}`, { metodo: "DELETE" });
      await auditar(request, "ptero_servidor_borrado", String(id), { forzar: forzar === "1" });
      return { ok: true };
    });

    // ------------------------------------------------------------ nodos
    app.get("/api/ptero/admin/nodos", leer, async () => {
      const [nodos, ubicaciones] = await Promise.all([
        app_<Lista<{ id: number; name: string; fqdn: string; scheme: string; memory: number; disk: number; location_id: number; maintenance_mode: boolean; allocated_resources?: { memory: number; disk: number } }>>(
          "/api/application/nodes?per_page=100",
        ),
        app_<Lista<{ id: number; short: string; long: string | null }>>("/api/application/locations?per_page=100"),
      ]);
      return {
        nodos: nodos.data.map(({ attributes: n }) => ({
          id: n.id,
          nombre: n.name,
          fqdn: n.fqdn,
          https: n.scheme === "https",
          memoriaMb: n.memory,
          discoMb: n.disk,
          usadoMemoriaMb: n.allocated_resources?.memory ?? null,
          usadoDiscoMb: n.allocated_resources?.disk ?? null,
          ubicacion: n.location_id,
          mantenimiento: n.maintenance_mode,
        })),
        ubicaciones: ubicaciones.data.map(({ attributes: u }) => ({ id: u.id, nombre: u.short, descripcion: u.long })),
      };
    });

    app.post("/api/ptero/admin/ubicaciones", cambiar, async (request) => {
      const d = z.object({ nombre: z.string().trim().regex(/^[a-zA-Z0-9_.-]{1,60}$/, "Nombre corto: sin espacios"), descripcion: z.string().trim().max(191).default("") }).parse(request.body);
      const r = await app_<{ attributes: { id: number } }>("/api/application/locations", { metodo: "POST", cuerpo: { short: d.nombre, long: d.descripcion || d.nombre } });
      await auditar(request, "ptero_ubicacion_creada", d.nombre);
      return { ok: true, id: r.attributes.id };
    });

    app.post("/api/ptero/admin/nodos", cambiar, async (request) => {
      const d = z
        .object({
          nombre: z.string().trim().min(1).max(100),
          ubicacion: z.number().int().positive(),
          fqdn: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]{1,253}$/, "Dominio o IP del nodo"),
          https: z.boolean().default(true),
          detrasDeProxy: z.boolean().default(false),
          memoriaMb: z.number().int().min(512),
          discoMb: z.number().int().min(1024),
          puertoWings: z.number().int().min(1).max(65535).default(8080),
          puertoSftp: z.number().int().min(1).max(65535).default(2022),
        })
        .parse(request.body);
      const r = await app_<{ attributes: { id: number } }>("/api/application/nodes", {
        metodo: "POST",
        cuerpo: {
          name: d.nombre,
          location_id: d.ubicacion,
          fqdn: d.fqdn,
          scheme: d.https ? "https" : "http",
          behind_proxy: d.detrasDeProxy,
          memory: d.memoriaMb,
          memory_overallocate: 0,
          disk: d.discoMb,
          disk_overallocate: 0,
          upload_size: 100,
          daemon_listen: d.puertoWings,
          daemon_sftp: d.puertoSftp,
        },
      });
      await auditar(request, "ptero_nodo_creado", d.nombre);
      return { ok: true, id: r.attributes.id };
    });

    /** Config de Wings del nodo (va en /etc/pterodactyl/config.yml; es JSON, que YAML también acepta). Lleva el token del nodo. */
    app.get("/api/ptero/admin/nodos/:id/configuracion", peligro, async (request) => {
      const { id } = idNum.parse(request.params);
      const config = await app_<Record<string, unknown>>(`/api/application/nodes/${id}/configuration`);
      await auditar(request, "ptero_nodo_config_vista", String(id));
      return { config: JSON.stringify(config, null, 2) };
    });

    app.get("/api/ptero/admin/nodos/:id/puertos", leer, async (request) => {
      const { id } = idNum.parse(request.params);
      const r = await app_<Lista<{ id: number; ip: string; alias: string | null; port: number; assigned: boolean }>>(`/api/application/nodes/${id}/allocations?per_page=500`);
      return r.data.map(({ attributes: a }) => ({ id: a.id, ip: a.ip, alias: a.alias, puerto: a.port, usado: a.assigned }));
    });

    app.post("/api/ptero/admin/nodos/:id/puertos", cambiar, async (request) => {
      const { id } = idNum.parse(request.params);
      const d = z
        .object({
          ip: z.string().trim().regex(/^[0-9a-fA-F.:]{3,45}$/, "IP inválida"),
          puertos: z.array(z.string().regex(/^\d{2,5}(-\d{2,5})?$/, "Puerto o rango (25565 o 25565-25570)")).min(1).max(50),
        })
        .parse(request.body);
      await app_(`/api/application/nodes/${id}/allocations`, { metodo: "POST", cuerpo: { ip: d.ip, ports: d.puertos } });
      await auditar(request, "ptero_puertos_creados", String(id), { puertos: d.puertos });
      return { ok: true };
    });

    // ------------------------------------------------------------ eggs
    app.get("/api/ptero/admin/eggs", leer, async () => {
      const r = await app_<Lista<{ id: number; name: string; relationships?: { eggs?: Lista<{ id: number; name: string; description: string | null }> } }>>("/api/application/nests?per_page=100&include=eggs");
      return r.data.map(({ attributes: n }) => ({
        id: n.id,
        nombre: n.name,
        eggs: (n.relationships?.eggs?.data ?? []).map(({ attributes: e }) => ({ id: e.id, nombre: e.name, descripcion: e.description })),
      }));
    });

    app.get("/api/ptero/admin/eggs/:nido/:egg/variables", leer, async (request) => {
      const { nido, egg } = z.object({ nido: z.coerce.number().int().positive(), egg: z.coerce.number().int().positive() }).parse(request.params);
      const r = await app_<{ attributes: { relationships?: { variables?: Lista<{ name: string; description: string; env_variable: string; default_value: string | null; user_editable: boolean }> } } }>(
        `/api/application/nests/${nido}/eggs/${egg}?include=variables`,
      );
      return (r.attributes.relationships?.variables?.data ?? []).map(({ attributes: v }) => ({ nombre: v.name, descripcion: v.description, variable: v.env_variable, valor: v.default_value ?? "", editable: v.user_editable }));
    });

    /** Importar un egg (.json) en un nido: la API no lo permite, así que se usa el importador del panel por SSH. */
    app.post("/api/ptero/admin/eggs/importar", { ...peligro, bodyLimit: 1024 * 1024 }, async (request) => {
      const d = z.object({ nido: z.number().int().positive(), json: z.string().min(20).max(500_000), servidorId: z.string().uuid().optional() }).parse(request.body);
      let egg: { meta?: { version?: string }; name?: string };
      try {
        egg = JSON.parse(d.json) as typeof egg;
      } catch {
        throw new HttpError(400, "El archivo no es un JSON válido");
      }
      if (!/^PTDL_v[12]$/.test(egg.meta?.version ?? "") || !egg.name) throw new HttpError(400, "Eso no parece un egg de Pterodactyl (falta meta.version PTDL_v1/v2 o el nombre)");
      const s = await servidorPanel(request, d.servidorId);
      const tmp = `/tmp/misetup-egg-${Date.now()}.json`;
      const php = `$f=new \\Illuminate\\Http\\UploadedFile("${tmp}","egg.json","application/json",null,true);$e=app(\\Pterodactyl\\Services\\Eggs\\Sharing\\EggImporterService::class)->handle($f,${d.nido});echo "EGG_OK:".$e->id;`;
      const comando = `${COMO_PANEL} echo ${citar(Buffer.from(d.json).toString("base64"))} | base64 -d > ${tmp} && chmod 644 ${tmp} && $C php artisan tinker --execute=${citar(php)} 2>&1; r=$?; rm -f ${tmp}; exit $r`;
      const r = await servidores.usar(s.id, (c) => ejecutar(c, comando, { timeoutMs: 120_000 }));
      const salida = `${r.salida}\n${r.error}`;
      if (salida.includes("NOPANEL")) throw new HttpError(400, `No encontré el panel en ${PANEL} de ${s.name}`);
      const idEgg = /EGG_OK:(\d+)/.exec(salida)?.[1];
      if (!idEgg) throw new HttpError(502, `El panel no aceptó el egg: ${salida.trim().split("\n").slice(-3).join(" ").slice(0, 300)}`);
      await auditar(request, "ptero_egg_importado", egg.name, { nido: d.nido, id: Number(idEgg) });
      return { ok: true, id: Number(idEgg), nombre: egg.name };
    });

    // ------------------------------------------------------------ Blueprint
    app.get("/api/ptero/admin/blueprint", leer, async (request) => {
      const { servidorId } = z.object({ servidorId: z.string().uuid().optional() }).parse(request.query);
      const s = await servidorPanel(request, servidorId);
      const r = await servidores.usar(s.id, (c) => ejecutar(c, SCRIPT_EXTENSIONES, { timeoutMs: 20_000 }));
      if (r.salida.includes("NOPANEL")) return { panel: false, blueprint: false, extensiones: [], servidor: s.name };
      return { panel: true, servidor: s.name, ...leerExtensiones(r.salida) };
    });

    app.delete("/api/ptero/admin/blueprint/:extension", peligro, async (request) => {
      const { extension } = z.object({ extension: z.string().regex(idExtension, "Extensión inválida") }).parse(request.params);
      const { servidorId } = z.object({ servidorId: z.string().uuid().optional() }).parse(request.query);
      const s = await servidorPanel(request, servidorId);
      // blueprint pide confirmar: `yes` responde por ti. Puede tardar (recompila el panel).
      const r = await servidores.usar(s.id, (c) => ejecutar(c, `cd ${PANEL} && yes | blueprint -remove ${citar(extension)} 2>&1 | tail -n 15`, { timeoutMs: 600_000 }));
      // eslint-disable-next-line no-control-regex
      const salida = r.salida.replace(/\x1b\[[0-9;]*m/g, "");
      const despues = await servidores.usar(s.id, (c) => ejecutar(c, SCRIPT_EXTENSIONES, { timeoutMs: 20_000 }));
      const sigue = leerExtensiones(despues.salida).extensiones.some((e) => e.id === extension);
      await auditar(request, "ptero_blueprint_quitada", extension, { sigue });
      if (sigue) throw new HttpError(502, `Blueprint no quitó ${extension}: ${salida.trim().split("\n").slice(-3).join(" ").slice(0, 300)}`);
      return { ok: true, salida };
    });
  };
}
