import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function idDeMaquina(): string | null {
  try {
    if (process.platform === "win32") {
      const salida = execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { encoding: "utf8", windowsHide: true, timeout: 4000 });
      return /MachineGuid\s+REG_SZ\s+([\w-]+)/i.exec(salida)?.[1] ?? null;
    }
    if (process.platform === "darwin") {
      const salida = execFileSync("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { encoding: "utf8", timeout: 4000 });
      return /"IOPlatformUUID"\s*=\s*"([\w-]+)"/.exec(salida)?.[1] ?? null;
    }
    for (const ruta of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      if (existsSync(ruta)) return readFileSync(ruta, "utf8").trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

function idDeRespaldo(): string {
  const ruta = join(homedir(), ".mi-setup-equipo");
  try {
    if (existsSync(ruta)) {
      const guardado = readFileSync(ruta, "utf8").trim();
      if (guardado) return guardado;
    }
    const nuevo = randomUUID();
    writeFileSync(ruta, nuevo, "utf8");
    return nuevo;
  } catch {
    return randomUUID();
  }
}

let calculada: string | null = null;

export function huellaEquipo(): string {
  if (!calculada) calculada = createHash("sha256").update(`mi-setup:pc:${idDeMaquina() ?? idDeRespaldo()}`).digest("hex");
  return calculada;
}
