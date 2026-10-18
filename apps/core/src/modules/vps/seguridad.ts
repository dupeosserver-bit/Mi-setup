/**
 * Seguridad del servidor (VPS o home lab): revisión con calificación y
 * acciones de un botón (firewall, fail2ban, actualizaciones). Las acciones
 * piden reautenticación fuerte y escribir el nombre del servidor; el puerto
 * de SSH nunca se cierra para no dejarte fuera.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "../common.js";
import type { Servidores } from "./servidores.js";
import { ejecutar } from "./ssh.js";

const SCRIPT_AUDITORIA = [
  'S=""; [ "$(id -u)" = 0 ] || S="sudo -n"',
  'echo "##os"; . /etc/os-release 2>/dev/null; echo "$PRETTY_NAME"',
  'echo "##ufw"; if command -v ufw >/dev/null; then $S ufw status verbose 2>&1; else echo "sin-ufw"; fi',
  'echo "##fail2ban"; systemctl is-active fail2ban 2>/dev/null || echo inactive; $S fail2ban-client status sshd 2>/dev/null | grep -Ei "currently banned|total banned"',
  'echo "##sshd"; ($S sshd -T 2>/dev/null || cat /etc/ssh/sshd_config 2>/dev/null) | grep -Ei "^(permitrootlogin|passwordauthentication|port) " | tr "A-Z" "a-z"',
  'echo "##upgrades"; grep -c "Unattended-Upgrade \\"1\\"" /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null || echo 0',
  'echo "##pendientes"; apt list --upgradable 2>/dev/null | grep -c upgradable',
  'echo "##reinicio"; if [ -f /var/run/reboot-required ]; then echo si; else echo no; fi',
  "echo \"##puertos\"; ss -tulnH 2>/dev/null | awk '{print $1\" \"$5}'",
  'echo "##tailscale"; if command -v tailscale >/dev/null; then tailscale ip -4 2>/dev/null | head -1; else echo no; fi',
].join("\n");

export type Estado = "ok" | "aviso" | "mal";
export interface Punto {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  accion?: "firewall_activar" | "fail2ban_instalar" | "actualizaciones_auto" | "actualizar";
}
export interface Auditoria {
  sistema: string;
  calificacion: number;
  puntos: Punto[];
  firewall: { instalado: boolean; activo: boolean; reglas: string[] };
  puertos: { proto: string; puerto: number; direccion: string; publico: boolean }[];
  puertoSsh: number;
  tailscale: string | null;
}

function secciones(salida: string): Record<string, string[]> {
  const r: Record<string, string[]> = {};
  let actual = "";
  for (const linea of salida.split("\n")) {
    const m = /^##(\w+)$/.exec(linea.trim());
    if (m) {
      actual = m[1]!;
      r[actual] = [];
    } else if (actual && linea.trim()) r[actual]!.push(linea.trim());
  }
  return r;
}

/** Convierte la salida del script en puntos con explicación y una calificación de 0 a 100. */
export function interpretarAuditoria(salida: string, puertoConexion: number): Auditoria {
  const s = secciones(salida);
  const ufw = s["ufw"] ?? [];
  const instalado = !ufw.includes("sin-ufw");
  const activo = ufw.some((l) => /^status:\s*active/i.test(l));
  const reglas = ufw.filter((l) => /\b(allow|deny|reject|limit)\b/i.test(l) && !/^(default|status|logging|new profiles):/i.test(l));
  const f2b = s["fail2ban"] ?? [];
  const f2bActivo = f2b[0] === "active";
  const baneados = f2b.find((l) => /total banned/i.test(l))?.match(/(\d+)\s*$/)?.[1];
  const sshd = Object.fromEntries((s["sshd"] ?? []).map((l) => l.split(/\s+/, 2) as [string, string]));
  const puertoSsh = Number(sshd["port"]) || puertoConexion;
  const rootLogin = sshd["permitrootlogin"] ?? "desconocido";
  const conPassword = sshd["passwordauthentication"] ?? "desconocido";
  const autoUpd = Number(s["upgrades"]?.[0] ?? 0) > 0;
  const pendientes = Number(s["pendientes"]?.[0] ?? 0) || 0;
  const reinicio = s["reinicio"]?.[0] === "si";
  const ts = s["tailscale"]?.[0];
  const puertos = (s["puertos"] ?? [])
    .map((l) => {
      const [proto = "", dir = ""] = l.split(" ");
      const i = dir.lastIndexOf(":");
      const direccion = dir.slice(0, i);
      return { proto, puerto: Number(dir.slice(i + 1)), direccion, publico: !/^(127\.|\[?::1\]?|localhost)/.test(direccion) };
    })
    .filter((p, i, a) => p.puerto > 0 && a.findIndex((q) => q.proto === p.proto && q.puerto === p.puerto) === i)
    .sort((a, b) => a.puerto - b.puerto);
  const publicos = puertos.filter((p) => p.publico);

  const puntos: Punto[] = [
    !instalado
      ? { id: "firewall", titulo: "Firewall (ufw)", estado: "mal", detalle: "No está instalado. El botón lo instala y lo enciende dejando abierto SSH.", accion: "firewall_activar" }
      : activo
        ? { id: "firewall", titulo: "Firewall (ufw)", estado: "ok", detalle: `Activo con ${reglas.length} regla(s).` }
        : { id: "firewall", titulo: "Firewall (ufw)", estado: "mal", detalle: "Está apagado: cualquier puerto abierto queda expuesto a internet.", accion: "firewall_activar" },
    f2bActivo
      ? { id: "fail2ban", titulo: "Fail2ban (bloquea a quien adivina contraseñas)", estado: "ok", detalle: baneados ? `Activo. Ha bloqueado ${baneados} IP(s).` : "Activo." }
      : { id: "fail2ban", titulo: "Fail2ban (bloquea a quien adivina contraseñas)", estado: "aviso", detalle: "No está activo. Bots de todo el mundo intentan entrar por SSH a diario.", accion: "fail2ban_instalar" },
    {
      id: "root",
      titulo: "Entrar como root por SSH",
      estado: rootLogin === "yes" ? "aviso" : "ok",
      detalle:
        rootLogin === "yes"
          ? "Permitido con contraseña. Lo ideal: un usuario normal con sudo y PermitRootLogin prohibit-password. Cámbialo a mano en /etc/ssh/sshd_config cuando ya tengas llave SSH (si lo haces mal te quedas fuera)."
          : `Configurado como "${rootLogin}".`,
    },
    {
      id: "password",
      titulo: "Entrar con contraseña",
      estado: conPassword === "yes" ? "aviso" : "ok",
      detalle: conPassword === "yes" ? "Se puede entrar con contraseña. Más seguro: solo llaves SSH (PasswordAuthentication no), después de probar que tu llave funciona." : "Solo con llave SSH. ¡Bien!",
    },
    autoUpd
      ? { id: "auto", titulo: "Actualizaciones de seguridad automáticas", estado: "ok", detalle: "Activadas." }
      : { id: "auto", titulo: "Actualizaciones de seguridad automáticas", estado: "aviso", detalle: "Apagadas: los parches de seguridad no se instalan solos.", accion: "actualizaciones_auto" },
    pendientes > 0
      ? { id: "pendientes", titulo: "Actualizaciones pendientes", estado: pendientes > 20 ? "mal" : "aviso", detalle: `${pendientes} paquete(s) por actualizar.`, accion: "actualizar" }
      : { id: "pendientes", titulo: "Actualizaciones pendientes", estado: "ok", detalle: "Todo al día." },
    { id: "reinicio", titulo: "Reinicio pendiente", estado: reinicio ? "aviso" : "ok", detalle: reinicio ? "Hay actualizaciones que necesitan reiniciar el servidor (hazlo cuando no haya nadie jugando)." : "No hace falta." },
    {
      id: "puertos",
      titulo: "Puertos abiertos a internet",
      estado: publicos.length > 12 ? "aviso" : "ok",
      detalle: publicos.length ? `${publicos.length}: ${publicos.map((p) => `${p.puerto}/${p.proto}`).join(", ")}` : "Ninguno además de lo básico.",
    },
  ];
  const peso = { ok: 1, aviso: 0.5, mal: 0 } as const;
  const calificacion = Math.round((puntos.reduce((t, p) => t + peso[p.estado], 0) / puntos.length) * 100);
  return {
    sistema: s["os"]?.[0] ?? "Linux",
    calificacion,
    puntos,
    firewall: { instalado, activo, reglas },
    puertos,
    puertoSsh,
    tailscale: ts && ts !== "no" ? ts : null,
  };
}

const confirmacion = z.string().max(200);
const accionSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("firewall_activar"), confirmacion }),
  z.object({ accion: z.literal("fail2ban_instalar"), confirmacion }),
  z.object({ accion: z.literal("actualizaciones_auto"), confirmacion }),
  z.object({ accion: z.literal("actualizar"), confirmacion }),
  z.object({ accion: z.literal("puerto_abrir"), puerto: z.number().int().min(1).max(65535), proto: z.enum(["tcp", "udp"]), confirmacion }),
  z.object({ accion: z.literal("puerto_cerrar"), puerto: z.number().int().min(1).max(65535), proto: z.enum(["tcp", "udp"]), confirmacion }),
]);
export type AccionSeguridad = z.infer<typeof accionSchema>;

/** Comandos de cada acción (sin sudo si el usuario ya es root). */
export function comandosDeAccion(a: AccionSeguridad, root: boolean, puertoSsh: number): string[] {
  const s = root ? "" : "sudo -n ";
  const apt = `${s}env DEBIAN_FRONTEND=noninteractive apt-get`;
  switch (a.accion) {
    case "firewall_activar":
      // Primero se permite SSH para no quedarte fuera.
      return [`(command -v ufw >/dev/null || (${apt} update -q && ${apt} install -y -q ufw))`, `${s}ufw allow ${puertoSsh}/tcp`, `${s}ufw --force enable`];
    case "fail2ban_instalar":
      return [`${apt} update -q`, `${apt} install -y -q fail2ban`, `${s}systemctl enable --now fail2ban`];
    case "actualizaciones_auto":
      return [
        `${apt} install -y -q unattended-upgrades`,
        `printf 'APT::Periodic::Update-Package-Lists "1";\\nAPT::Periodic::Unattended-Upgrade "1";\\n' | ${s}tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null`,
      ];
    case "actualizar":
      return [`${apt} update -q`, `${apt} -y -q -o Dpkg::Options::=--force-confold upgrade`];
    case "puerto_abrir":
      return [`${s}ufw allow ${a.puerto}/${a.proto}`];
    case "puerto_cerrar":
      if (a.puerto === puertoSsh) throw new HttpError(400, `El puerto ${puertoSsh} es el de SSH: si lo cierras te quedas fuera del servidor.`);
      return [`(${s}ufw delete allow ${a.puerto}/${a.proto} || true)`, `${s}ufw deny ${a.puerto}/${a.proto}`];
  }
}

export function seguridadRoutes(deps: ModuleDeps, servidores: Servidores) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vps/servidores/:id/seguridad", { config: { acceso: { modulo: "vps_seguridad", nivel: "lectura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      return servidores.usar(id, async (c, servidor) => {
        const r = await ejecutar(c, SCRIPT_AUDITORIA, { timeoutMs: 60_000 });
        return interpretarAuditoria(r.salida, servidor.port);
      });
    });

    app.post(
      "/api/vps/servidores/:id/seguridad/accion",
      { config: { acceso: { modulo: "vps_seguridad", nivel: "administrar", reauth: "fuerte" } } },
      async (request) => {
        const { id } = idParams.parse(request.params);
        const d = accionSchema.parse(request.body);
        const servidor = await servidores.obtener(id);
        if (d.confirmacion !== servidor.name) throw new HttpError(400, `Escribe "${servidor.name}" para confirmar`, "doble_confirmacion");
        const user = currentUser(request);
        return servidores.usar(id, async (c) => {
          const auditoria = interpretarAuditoria((await ejecutar(c, SCRIPT_AUDITORIA, { timeoutMs: 60_000 })).salida, servidor.port);
          const comandos = comandosDeAccion(d, servidor.username === "root", auditoria.puertoSsh);
          const r = await ejecutar(c, comandos.join(" && "), { timeoutMs: d.accion === "actualizar" ? 15 * 60_000 : 5 * 60_000 });
          await deps.audit.record({
            actorType: "usuario",
            actorUserId: user.id,
            action: "seguridad_vps",
            module: "vps_seguridad",
            target: servidor.name,
            outcome: r.codigo === 0 ? "ok" : "error",
            details: { accion: d.accion, ...("puerto" in d ? { puerto: d.puerto, proto: d.proto } : {}), codigo: r.codigo },
            ...clientInfo(request),
          });
          const sinSudo = /sudo: (a terminal|a password) is required/i.test(r.error);
          return {
            ok: r.codigo === 0,
            salida: `${r.salida}\n${r.error}`.trim().slice(-4000),
            aviso: sinSudo ? "Tu usuario necesita sudo sin contraseña para esto (o conéctate como root)." : null,
          };
        });
      },
    );
  };
}
