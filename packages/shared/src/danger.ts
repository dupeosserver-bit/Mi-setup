/**
 * Detección de comandos peligrosos. Un comando peligroso exige doble
 * confirmación y reautenticación fuerte, la escriba quien la escriba (incluida la IA).
 */

const PATRONES: readonly { regex: RegExp; motivo: string }[] = [
  { regex: /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf]/i, motivo: "borrado forzado o recursivo (rm -r/-f)" },
  { regex: /\bdd\s+[^|;&]*\bof=/i, motivo: "escritura directa a disco (dd)" },
  { regex: /\bmkfs(\.[a-z0-9]+)?\b/i, motivo: "formateo de disco (mkfs)" },
  { regex: /\b(wipefs|fdisk|sfdisk|parted|shred)\b/i, motivo: "herramienta de particiones o borrado seguro" },
  { regex: /\b(shutdown|poweroff|halt)\b/i, motivo: "apaga el servidor" },
  { regex: /\breboot\b/i, motivo: "reinicia el servidor" },
  { regex: /\binit\s+[06]\b/, motivo: "apaga o reinicia el servidor (init)" },
  { regex: /\bsystemctl\s+(poweroff|reboot|halt|kexec)\b/i, motivo: "apaga o reinicia el servidor (systemctl)" },
  { regex: /\biptables\s+(-[a-z]*\s+)*(-F|--flush|-X|-P\s+\w+\s+DROP)/i, motivo: "vacía o cierra el firewall (iptables)" },
  { regex: /\b(nft\s+flush|ufw\s+(disable|reset))\b/i, motivo: "desactiva el firewall" },
  { regex: />\s*\/dev\/(sd|nvme|vd|xvd|hd)[a-z0-9]*/i, motivo: "escribe directamente a un disco" },
  { regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, motivo: "fork bomb" },
  { regex: /\bchmod\s+(-[a-z]*\s+)*[0-7]*777\s+\/(\s|$)/i, motivo: "permisos 777 en la raíz" },
  { regex: /\bch(own|mod)\s+-[a-z]*R[a-z]*\s+\S+\s+\/(\s|$)/, motivo: "cambio recursivo de permisos en la raíz" },
  { regex: /\bsystemctl\s+(stop|disable|mask)\s+(sshd?|docker|wg-quick@\S+|networking)\b/i, motivo: "detiene un servicio crítico" },
  { regex: /\bdocker\s+(system\s+prune|volume\s+(rm|prune)|rm\s+-[a-z]*f)/i, motivo: "borra contenedores o volúmenes de Docker" },
  { regex: /\b(drop\s+(database|table|schema)|truncate\s+table)\b/i, motivo: "borra datos de una base de datos" },
  { regex: /\bkill(all)?\s+(-9\s+)?-1\b|\bkill\s+-9\s+1\b/, motivo: "mata todos los procesos" },
  { regex: /\bmv\s+\/(bin|boot|etc|lib|usr|var)\b/, motivo: "mueve un directorio del sistema" },
  { regex: /\buserdel\b|\bpasswd\s+-d\b/, motivo: "borra cuentas o contraseñas del sistema" },
  { regex: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i, motivo: "ejecuta un script descargado de internet" },
];

export interface DangerReport {
  readonly peligroso: boolean;
  readonly motivos: readonly string[];
}

export function analizarComando(comando: string): DangerReport {
  const motivos = PATRONES.filter((p) => p.regex.test(comando)).map((p) => p.motivo);
  return { peligroso: motivos.length > 0, motivos: [...new Set(motivos)] };
}
