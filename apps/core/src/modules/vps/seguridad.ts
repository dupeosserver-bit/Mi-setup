/**
 * Seguridad del servidor (VPS o home lab): revisión con calificación y
 * acciones de un botón (firewall, fail2ban, actualizaciones, memoria de
 * respaldo, protección contra cuelgues, límites de logs, SSH solo con llave y
 * alertas cuando alguien entra). Las acciones piden reautenticación fuerte y
 * escribir el nombre del servidor; el puerto de SSH nunca se cierra para no
 * dejarte fuera.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { users } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "../common.js";
import { getSetting, setSetting } from "../settings.js";
import type { Servidores } from "./servidores.js";
import { citar, ejecutar } from "./ssh.js";

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
  "echo \"##memoria\"; free -b | awk '/^Mem:/{print $2} /^Swap:/{print $2}'",
  "echo \"##disco\"; df -P / | tail -1 | awk '{print $5}' | tr -d %",
  'echo "##earlyoom"; systemctl is-active earlyoom 2>/dev/null || echo inactive',
  'echo "##journald"; if [ -f /etc/systemd/journald.conf.d/mi-setup.conf ]; then echo si; else echo no; fi',
  "echo \"##dockerlogs\"; if ! command -v docker >/dev/null; then echo sin-docker; elif grep -q max-size /etc/docker/daemon.json 2>/dev/null; then echo si; else echo no; fi",
  'echo "##alertas"; if grep -q mi-setup-aviso-entrada /etc/pam.d/sshd 2>/dev/null; then echo si; else echo no; fi',
  'echo "##fallidos"; ($S journalctl -u ssh -u sshd --since "24 hours ago" --no-pager 2>/dev/null || $S cat /var/log/auth.log 2>/dev/null) | grep -cE "Failed password|Invalid user"',
].join("\n");

export type Estado = "ok" | "aviso" | "mal";
export interface Punto {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  accion?: "firewall_activar" | "fail2ban_instalar" | "actualizaciones_auto" | "actualizar" | "swap_crear" | "earlyoom_instalar" | "journald_limitar" | "docker_logs" | "alertas_ssh" | "ssh_solo_llave";
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
export function interpretarAuditoria(salida: string, puertoConexion: number, conLlave = false): Auditoria {
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
  const [ram = 0, swap = 0] = (s["memoria"] ?? []).map(Number);
  const disco = Number(s["disco"]?.[0] ?? 0);
  const earlyoom = s["earlyoom"]?.[0] === "active";
  const journald = s["journald"]?.[0] === "si";
  const dockerLogs = s["dockerlogs"]?.[0] ?? "sin-docker";
  const alertas = s["alertas"]?.[0] === "si";
  const fallidos = Number(s["fallidos"]?.[0] ?? 0) || 0;
  const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;

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
    swap > 0
      ? { id: "swap", titulo: "Memoria de respaldo (swap)", estado: "ok", detalle: `${gb(swap)} de swap con ${gb(ram)} de RAM.` }
      : { id: "swap", titulo: "Memoria de respaldo (swap)", estado: "aviso", detalle: `Sin swap: si la RAM (${gb(ram)}) se llena, el servidor se congela o se reinician tus servicios. El botón crea 2 GB.`, accion: "swap_crear" },
    earlyoom
      ? { id: "earlyoom", titulo: "Protección contra cuelgues (earlyoom)", estado: "ok", detalle: "Activa: si la memoria se acaba, cierra el programa que más gasta antes de que se congele todo (nunca SSH, Docker ni la base)." }
      : { id: "earlyoom", titulo: "Protección contra cuelgues (earlyoom)", estado: "aviso", detalle: "Sin ella, un servidor de juego que se coma la RAM puede tumbar todo el VPS.", accion: "earlyoom_instalar" },
    {
      id: "disco",
      titulo: "Espacio en disco",
      estado: disco >= 90 ? "mal" : disco >= 80 ? "aviso" : "ok",
      detalle: disco >= 80 ? `Usado al ${disco} %. Limpia basura (Archivos → Limpiar basura) o respaldos viejos.` : `Usado al ${disco} %.`,
    },
    journald
      ? { id: "journald", titulo: "Tamaño de los registros del sistema", estado: "ok", detalle: "Limitados a 500 MB." }
      : { id: "journald", titulo: "Tamaño de los registros del sistema", estado: "aviso", detalle: "Sin límite: con el tiempo llenan el disco.", accion: "journald_limitar" },
    ...(dockerLogs === "sin-docker"
      ? []
      : [
          dockerLogs === "si"
            ? ({ id: "dockerlogs", titulo: "Registros de Docker", estado: "ok", detalle: "Con tamaño máximo." } as Punto)
            : ({ id: "dockerlogs", titulo: "Registros de Docker", estado: "aviso", detalle: "Los contenedores guardan registros sin límite y pueden llenar el disco.", accion: "docker_logs" } as Punto),
        ]),
    alertas
      ? { id: "alertas", titulo: "Alertas de entrada por SSH", estado: "ok", detalle: "Te llega un aviso cada vez que alguien entra a este servidor." }
      : { id: "alertas", titulo: "Alertas de entrada por SSH", estado: "aviso", detalle: "Activa el aviso para enterarte al momento si alguien entra (aunque tenga tu contraseña).", accion: "alertas_ssh" },
    {
      id: "fallidos",
      titulo: "Intentos de entrar (últimas 24 h)",
      estado: fallidos > 50 && !f2bActivo ? "aviso" : "ok",
      detalle: fallidos ? `${fallidos} intento(s) fallido(s) por SSH.${f2bActivo ? " Fail2ban los va bloqueando." : " Activa fail2ban."}` : "Ninguno.",
    },
    ...(conLlave && (conPassword === "yes" || rootLogin === "yes")
      ? [{ id: "solollave", titulo: "SSH solo con llave", estado: "aviso", detalle: "Mi Setup entra con llave: puedes apagar la entrada con contraseña sin quedarte fuera.", accion: "ssh_solo_llave" } as Punto]
      : []),
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
  z.object({ accion: z.literal("swap_crear"), confirmacion }),
  z.object({ accion: z.literal("earlyoom_instalar"), confirmacion }),
  z.object({ accion: z.literal("journald_limitar"), confirmacion }),
  z.object({ accion: z.literal("docker_logs"), confirmacion }),
  z.object({ accion: z.literal("alertas_ssh"), confirmacion }),
  z.object({ accion: z.literal("ssh_solo_llave"), confirmacion }),
  z.object({ accion: z.literal("puerto_abrir"), puerto: z.number().int().min(1).max(65535), proto: z.enum(["tcp", "udp"]), confirmacion }),
  z.object({ accion: z.literal("puerto_cerrar"), puerto: z.number().int().min(1).max(65535), proto: z.enum(["tcp", "udp"]), confirmacion }),
]);
export type AccionSeguridad = z.infer<typeof accionSchema>;

/** Línea de shell que ignora las conexiones de Mi Setup. */
export function patronPropio(ip: string): string {
  const limpia = ip.replace(/[^0-9a-fA-F.:]/g, "");
  const m = /^(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\.(\d+)\./.exec(limpia);
  if (m) {
    const prefijo = limpia.split(".").slice(0, 2).join(".");
    return `case "$PAM_RHOST" in ${prefijo}.*) exit 0;; esac`;
  }
  return `[ "$PAM_RHOST" = ${citar(limpia)} ] && exit 0`;
}

/** Script que avisa a Mi Setup cada vez que alguien abre sesión por SSH (con pam_exec, «optional»: nunca impide entrar). */
export function scriptAvisoEntrada(url: string, token: string, ignorarIp: string | null): string {
  return [
    "#!/bin/sh",
    '[ "$PAM_TYPE" = "open_session" ] || exit 0',
    // Las conexiones del propio Mi Setup no cuentan (en red privada, todo su rango: la IP de Docker cambia).
    ...(ignorarIp ? [patronPropio(ignorarIp)] : []),
    'U=$(printf %s "$PAM_USER" | tr -cd "A-Za-z0-9._-")',
    'H=$(printf %s "$PAM_RHOST" | tr -cd "A-Za-z0-9.:_-")',
    `(curl -fsS -m 5 -X POST ${citar(url)} -H ${citar(`x-mi-setup-alerta: ${token}`)} -H 'content-type: application/json' -d "{\\"usuario\\":\\"$U\\",\\"ip\\":\\"$H\\"}" >/dev/null 2>&1 &)`,
    "exit 0",
  ].join("\n");
}

/** Comandos de cada acción (sin sudo si el usuario ya es root). */
export function comandosDeAccion(a: AccionSeguridad, root: boolean, puertoSsh: number, extra: { avisoEntrada?: string; conLlave?: boolean } = {}): string[] {
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
    case "swap_crear":
      return [
        `if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then [ "$(df --output=avail -B1G / | tail -1 | tr -d ' ')" -gt 6 ] || { echo "Se necesitan más de 6 GB libres para crear la swap" >&2; exit 3; }; ${s}fallocate -l 2G /swapfile && ${s}chmod 600 /swapfile && ${s}mkswap /swapfile && ${s}swapon /swapfile; fi`,
        `(grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | ${s}tee -a /etc/fstab >/dev/null)`,
        `echo 'vm.swappiness=10' | ${s}tee /etc/sysctl.d/99-mi-setup-swap.conf >/dev/null`,
        `${s}sysctl -p /etc/sysctl.d/99-mi-setup-swap.conf`,
      ];
    case "earlyoom_instalar":
      return [
        `${apt} update -q`,
        `${apt} install -y -q earlyoom`,
        `printf '%s\\n' 'EARLYOOM_ARGS="-m 4 -s 10 -r 3600 --avoid (^|/)(sshd|dockerd|containerd|systemd|postgres|caddy)$"' | ${s}tee /etc/default/earlyoom >/dev/null`,
        `${s}systemctl enable earlyoom`,
        `${s}systemctl restart earlyoom`,
      ];
    case "journald_limitar":
      return [
        `${s}mkdir -p /etc/systemd/journald.conf.d`,
        `printf '[Journal]\\nSystemMaxUse=500M\\n' | ${s}tee /etc/systemd/journald.conf.d/mi-setup.conf >/dev/null`,
        `${s}systemctl restart systemd-journald`,
        `${s}journalctl --vacuum-size=500M`,
      ];
    case "docker_logs":
      // Solo se escribe la configuración; se aplica a contenedores nuevos o al reiniciar Docker (no se reinicia solo).
      return [
        `if [ ! -s /etc/docker/daemon.json ]; then ${s}mkdir -p /etc/docker && printf '{\\n  "log-driver": "json-file",\\n  "log-opts": { "max-size": "20m", "max-file": "3" }\\n}\\n' | ${s}tee /etc/docker/daemon.json >/dev/null; elif command -v python3 >/dev/null; then ${s}python3 -c 'import json;p="/etc/docker/daemon.json";d=json.load(open(p));d.setdefault("log-driver","json-file");d.setdefault("log-opts",{});d["log-opts"].setdefault("max-size","20m");d["log-opts"].setdefault("max-file","3");json.dump(d,open(p,"w"),indent=2)'; else echo "Falta python3 para editar daemon.json" >&2; exit 3; fi`,
      ];
    case "alertas_ssh": {
      if (!extra.avisoEntrada) throw new HttpError(500, "Falta el script de aviso");
      const script = extra.avisoEntrada;
      return [
        `printf '%s\\n' ${citar(script)} | ${s}tee /usr/local/sbin/mi-setup-aviso-entrada >/dev/null`,
        `${s}chmod 700 /usr/local/sbin/mi-setup-aviso-entrada`,
        `(command -v curl >/dev/null || (${apt} update -q && ${apt} install -y -q curl))`,
        `(grep -q mi-setup-aviso-entrada /etc/pam.d/sshd || echo 'session optional pam_exec.so /usr/local/sbin/mi-setup-aviso-entrada' | ${s}tee -a /etc/pam.d/sshd >/dev/null)`,
      ];
    }
    case "ssh_solo_llave":
      if (!extra.conLlave) throw new HttpError(400, "Mi Setup entra a este servidor con contraseña: primero conéctalo con llave SSH o te quedarías fuera.");
      // 01-… se lee antes que 50-cloud-init.conf (en sshd gana el primer valor).
      return [
        `grep -qiE '^Include /etc/ssh/sshd_config.d/' /etc/ssh/sshd_config || { echo "Este sshd no lee sshd_config.d; cámbialo a mano" >&2; exit 3; }`,
        `printf 'PasswordAuthentication no\\nKbdInteractiveAuthentication no\\nPermitRootLogin prohibit-password\\n' | ${s}tee /etc/ssh/sshd_config.d/01-mi-setup.conf >/dev/null`,
        `(${s}sshd -t || { ${s}rm -f /etc/ssh/sshd_config.d/01-mi-setup.conf; echo "La configuración no pasó la prueba; no se cambió nada" >&2; exit 3; })`,
        `(${s}systemctl reload ssh 2>/dev/null || ${s}systemctl reload sshd)`,
      ];
    case "puerto_abrir":
      return [`${s}ufw allow ${a.puerto}/${a.proto}`];
    case "puerto_cerrar":
      if (a.puerto === puertoSsh) throw new HttpError(400, `El puerto ${puertoSsh} es el de SSH: si lo cierras te quedas fuera del servidor.`);
      return [`(${s}ufw delete allow ${a.puerto}/${a.proto} || true)`, `${s}ufw deny ${a.puerto}/${a.proto}`];
  }
}

const hashAlerta = (t: string) => createHash("sha256").update(`alerta:${t}`).digest("hex");

export function seguridadRoutes(deps: ModuleDeps, servidores: Servidores) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vps/servidores/:id/seguridad", { config: { acceso: { modulo: "vps_seguridad", nivel: "lectura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      return servidores.usar(id, async (c, servidor) => {
        const r = await ejecutar(c, SCRIPT_AUDITORIA, { timeoutMs: 60_000 });
        return interpretarAuditoria(r.salida, servidor.port, servidor.authType === "llave");
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
          const conLlave = servidor.authType === "llave";
          const auditoria = interpretarAuditoria((await ejecutar(c, SCRIPT_AUDITORIA, { timeoutMs: 60_000 })).salida, servidor.port, conLlave);
          let avisoEntrada: string | undefined;
          if (d.accion === "alertas_ssh") {
            // La IP con la que Mi Setup llega a este servidor (sus propias conexiones no avisan).
            const propia = (await ejecutar(c, "echo $SSH_CLIENT", { timeoutMs: 10_000 })).salida.trim().split(/\s+/)[0] || null;
            const token = randomBytes(24).toString("base64url");
            await setSetting(deps.db, `alerta-entrada:${servidor.id}`, { hash: hashAlerta(token) }, deps.now());
            avisoEntrada = scriptAvisoEntrada(`https://${deps.config.env.APP_HOST}/api/alertas/entrada/${servidor.id}`, token, propia);
          }
          const comandos = comandosDeAccion(d, servidor.username === "root", auditoria.puertoSsh, { conLlave, ...(avisoEntrada ? { avisoEntrada } : {}) });
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
            aviso: sinSudo
              ? "Tu usuario necesita sudo sin contraseña para esto (o conéctate como root)."
              : d.accion === "docker_logs" && r.codigo === 0
                ? "Se aplica a los contenedores nuevos o la próxima vez que reinicies Docker."
                : null,
          };
        });
      },
    );

    /** El servidor avisa que alguien entró por SSH (lo manda el script instalado con «alertas_ssh»). */
    const ultimos = new Map<string, number>();
    app.post("/api/alertas/entrada/:id", { config: { acceso: { publico: true } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const token = String(request.headers["x-mi-setup-alerta"] ?? "");
      const guardado = await getSetting<{ hash: string }>(deps.db, `alerta-entrada:${id}`);
      const a = Buffer.from(hashAlerta(token));
      const b = Buffer.from(guardado?.hash ?? "");
      if (!guardado || a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(404, "No encontrado");
      const d = z.object({ usuario: z.string().max(64).default("?"), ip: z.string().max(64).default("?") }).parse(request.body ?? {});
      const servidor = await servidores.obtener(id).catch(() => null);
      if (!servidor) throw new HttpError(404, "No encontrado");
      // Una alerta por usuario e IP cada 10 minutos.
      const clave = `${id}|${d.usuario}|${d.ip}`;
      const ahora = deps.now().getTime();
      if ((ultimos.get(clave) ?? 0) > ahora - 10 * 60_000) return { ok: true };
      ultimos.set(clave, ahora);
      const [maestra] = await deps.db.select({ id: users.id }).from(users).where(eq(users.role, "maestra")).limit(1);
      await deps.audit.record({ actorType: "sistema", actorUserId: maestra?.id ?? null, action: "entrada_ssh", module: "vps_seguridad", target: servidor.name, outcome: "ok", ip: d.ip, details: { servidor: servidor.name, usuario: d.usuario } });
      await deps.notifier.send({
        title: `Entraron a ${servidor.name} por SSH`,
        message: `Usuario: ${d.usuario}\nDesde: ${d.ip}\nSi no fuiste tú, cambia la contraseña y revisa Seguridad del servidor.`,
        priority: 4,
        tags: ["rotating_light"],
      });
      return { ok: true };
    });
  };
}
