/**
 * Seguridad del servidor → Encendido y servicios: reiniciar el VPS, reiniciar,
 * apagar o encender servicios de systemd y contenedores de Docker, reiniciar
 * Docker y reiniciar Mi Setup. Todo con confirmación (escribir el nombre) y
 * PIN o huella; se registra en la actividad.
 *
 * Protecciones: SSH nunca se apaga (te quedarías fuera), y los contenedores
 * de Mi Setup solo se reinician (si se apagan, la app ya no puede volver a
 * encenderlos).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "../common.js";
import type { Servidores } from "./servidores.js";
import { citar, ejecutar } from "./ssh.js";

const NOMBRE = /^[A-Za-z0-9_.@:-]{1,100}$/;
/** Servicios que nunca se apagan desde la app. */
export const NO_APAGAR = /^(ssh|sshd|systemd-.*|dbus|networking|systemd-networkd|NetworkManager|cloud-init.*|getty@.*)(\.service)?$/i;
export const ES_MI_SETUP = /^misetup-/;

export interface Servicio {
  nombre: string;
  estado: string;
  descripcion: string;
}
export interface Contenedor {
  nombre: string;
  estado: string;
  imagen: string;
  activo: boolean;
}

const SCRIPT_SERVICIOS = `S=""; [ "$(id -u)" = 0 ] || S="sudo -n "
echo "==SERVICIOS"
systemctl list-units --type=service --all --no-legend --plain --no-pager 2>/dev/null | awk '$3!="not-found"{d=""; for(i=5;i<=NF;i++) d=d" "$i; print $1"|"$4"|"d}' | head -n 400
echo "==DOCKER"
command -v docker >/dev/null 2>&1 && ($S docker ps -a --format '{{.Names}}|{{.State}}|{{.Status}}|{{.Image}}' 2>/dev/null || echo "SIN_PERMISO") || echo "SIN_DOCKER"
echo "==FIN"`;

export function interpretarServicios(salida: string): { servicios: Servicio[]; contenedores: Contenedor[]; docker: "si" | "no" | "sin-permiso" } {
  const parte = (desde: string, hasta: string) => {
    const i = salida.indexOf(desde);
    const j = salida.indexOf(hasta, i + 1);
    return i < 0 ? [] : salida.slice(i + desde.length, j < 0 ? undefined : j).split("\n").map((l) => l.trim()).filter(Boolean);
  };
  const servicios = parte("==SERVICIOS", "==DOCKER")
    .map((l) => {
      const [nombre = "", estado = "", descripcion = ""] = l.split("|");
      return { nombre: nombre.trim(), estado: estado.trim(), descripcion: descripcion.trim() };
    })
    .filter((s) => NOMBRE.test(s.nombre));
  const lineasDocker = parte("==DOCKER", "==FIN");
  const docker = lineasDocker.includes("SIN_DOCKER") ? "no" : lineasDocker.includes("SIN_PERMISO") ? "sin-permiso" : "si";
  const contenedores = lineasDocker
    .filter((l) => l.includes("|"))
    .map((l) => {
      const [nombre = "", estado = "", texto = "", imagen = ""] = l.split("|");
      return { nombre, estado: texto || estado, imagen, activo: estado === "running" };
    })
    .filter((c) => NOMBRE.test(c.nombre));
  return { servicios, contenedores, docker };
}

const accionSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("vps"), confirmacion: z.string() }),
  z.object({ tipo: z.literal("misetup"), confirmacion: z.string() }),
  z.object({ tipo: z.literal("docker"), confirmacion: z.string() }),
  z.object({ tipo: z.literal("servicio"), nombre: z.string().regex(NOMBRE), operacion: z.enum(["reiniciar", "detener", "iniciar"]), confirmacion: z.string() }),
  z.object({ tipo: z.literal("contenedor"), nombre: z.string().regex(NOMBRE), operacion: z.enum(["reiniciar", "detener", "iniciar"]), confirmacion: z.string() }),
]);
export type AccionEnergia = z.infer<typeof accionSchema>;

/** Qué hay que escribir para confirmar cada acción. */
export function textoConfirmacion(a: AccionEnergia, servidor: string): string {
  if (a.tipo === "servicio" || a.tipo === "contenedor") return a.nombre;
  if (a.tipo === "misetup") return "MI SETUP";
  if (a.tipo === "docker") return "DOCKER";
  return servidor;
}

/** Comando para cada acción (los que tumban la conexión van con nohup y un respiro). */
export function comandoEnergia(a: AccionEnergia, root: boolean): string {
  const s = root ? "" : "sudo -n ";
  const despues = (c: string) => `nohup sh -c ${citar(`sleep 2; ${c}`)} >/dev/null 2>&1 &`;
  switch (a.tipo) {
    case "vps":
      return despues(`${s}systemctl reboot`);
    case "misetup":
      return despues(`${s}docker restart $(${s}docker ps -q --filter name=^misetup-)`);
    case "docker":
      return despues(`${s}systemctl restart docker`);
    case "servicio": {
      if (a.operacion !== "reiniciar" && NO_APAGAR.test(a.nombre)) throw new HttpError(400, `${a.nombre} no se puede ${a.operacion === "detener" ? "apagar" : "tocar"} desde aquí: te quedarías sin acceso al servidor.`);
      const op = { reiniciar: "restart", detener: "stop", iniciar: "start" }[a.operacion];
      return `${s}systemctl ${op} ${citar(a.nombre)} && systemctl is-active ${citar(a.nombre)} || true`;
    }
    case "contenedor": {
      if (ES_MI_SETUP.test(a.nombre) && a.operacion !== "reiniciar") throw new HttpError(400, "Los contenedores de Mi Setup solo se reinician: si los apagas, la app ya no puede volver a encenderlos.");
      const op = { reiniciar: "restart", detener: "stop", iniciar: "start" }[a.operacion];
      // Reiniciar el propio Mi Setup corta esta conexión: se hace después de responder.
      if (ES_MI_SETUP.test(a.nombre)) return despues(`${s}docker restart ${citar(a.nombre)}`);
      return `${s}docker ${op} ${citar(a.nombre)}`;
    }
  }
}

export function energiaRoutes(deps: ModuleDeps, servidores: Servidores) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vps/servidores/:id/servicios", { config: { acceso: { modulo: "vps_seguridad", nivel: "lectura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      return servidores.usar(id, async (c) => interpretarServicios((await ejecutar(c, SCRIPT_SERVICIOS, { timeoutMs: 30_000, maxBytes: 2 * 1024 * 1024 })).salida));
    });

    app.post("/api/vps/servidores/:id/energia", { config: { acceso: { modulo: "vps_seguridad", nivel: "administrar", reauth: "fuerte" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const a = accionSchema.parse(request.body);
      const servidor = await servidores.obtener(id);
      const esperado = textoConfirmacion(a, servidor.name);
      if (a.confirmacion.trim() !== esperado) throw new HttpError(400, `Escribe "${esperado}" para confirmar`, "doble_confirmacion");
      const comando = comandoEnergia(a, servidor.username === "root");
      const r = await servidores.usar(id, (c) => ejecutar(c, comando, { timeoutMs: 120_000 }));
      await deps.audit.record({
        actorType: "usuario",
        actorUserId: currentUser(request).id,
        action: "energia_vps",
        module: "vps_seguridad",
        target: `${servidor.name}${"nombre" in a ? `:${a.nombre}` : ""}`,
        outcome: r.codigo === 0 ? "ok" : "error",
        details: { tipo: a.tipo, ...("operacion" in a ? { operacion: a.operacion } : {}), codigo: r.codigo },
        ...clientInfo(request),
      });
      const sinSudo = /sudo: (a terminal|a password) is required/i.test(r.error);
      if (r.codigo !== 0) throw new HttpError(502, sinSudo ? "Tu usuario necesita sudo sin contraseña para esto (o conéctate como root)." : `No se pudo: ${`${r.error}\n${r.salida}`.trim().slice(-300)}`);
      const mensajes: Record<AccionEnergia["tipo"], string> = {
        vps: "El VPS se está reiniciando: vuelve en 1 o 2 minutos.",
        misetup: "Mi Setup se está reiniciando: la app se reconecta sola en unos segundos.",
        docker: "Docker se está reiniciando (los contenedores con reinicio automático vuelven solos).",
        servicio: "Listo.",
        contenedor: "Listo.",
      };
      return { ok: true, mensaje: mensajes[a.tipo], salida: r.salida.trim().slice(-2000) };
    });
  };
}
