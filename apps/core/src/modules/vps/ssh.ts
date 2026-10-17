/**
 * Conexiones SSH (ssh2). Las credenciales se descifran solo en memoria al
 * conectar. Equivalente a StrictHostKeyChecking: la huella del host se acepta
 * la primera vez y, si cambia, se rechaza la conexión.
 */
import { createHash } from "node:crypto";
import { Client, type ConnectConfig, type SFTPWrapper } from "ssh2";
import type { VpsServerRow } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import type { ServerCipher } from "../../security/crypto.js";

export function huellaDe(llave: Buffer): string {
  return `SHA256:${createHash("sha256").update(llave).digest("base64").replace(/=+$/, "")}`;
}

export interface Conexion {
  readonly cliente: Client;
  /** Huella vista si el servidor aún no tenía una guardada (primera conexión). */
  readonly huellaNueva: string | null;
}

export function conectar(servidor: VpsServerRow, cipher: ServerCipher): Promise<Conexion> {
  return new Promise((resolve, reject) => {
    const cliente = new Client();
    let vista: string | null = null;
    let cambiada = false;

    const config: ConnectConfig = {
      host: servidor.host,
      port: servidor.port,
      username: servidor.username,
      readyTimeout: 12_000,
      keepaliveInterval: 15_000,
      hostVerifier: (llave: Buffer) => {
        vista = huellaDe(llave);
        if (!servidor.hostKeyFingerprint || servidor.hostKeyFingerprint === vista) return true;
        cambiada = true;
        return false;
      },
    };
    const secreto = cipher.decrypt(servidor.secretEnc);
    if (servidor.authType === "llave") {
      config.privateKey = secreto;
      if (servidor.passphraseEnc) config.passphrase = cipher.decrypt(servidor.passphraseEnc);
    } else {
      config.password = secreto;
    }

    cliente.once("ready", () => resolve({ cliente, huellaNueva: servidor.hostKeyFingerprint ? null : vista }));
    cliente.once("error", (err) => {
      cliente.end();
      reject(
        cambiada
          ? new HttpError(
              409,
              `La huella del servidor cambió (${vista}). Si reinstalaste el VPS, acéptala en la configuración del servidor.`,
              "huella_cambiada",
              { huella: vista },
            )
          : new HttpError(502, `No se pudo conectar por SSH a ${servidor.name}: ${err.message}`, "ssh_error"),
      );
    });
    try {
      cliente.connect(config);
    } catch (err) {
      // ssh2 valida la llave al conectar y lanza el error de forma síncrona.
      const detalle = err instanceof Error ? err.message : "error desconocido";
      reject(new HttpError(400, `La llave privada no es válida (${detalle}). Pega la llave completa en formato OpenSSH o PEM.`, "llave_invalida"));
    }
  });
}

export interface Resultado {
  codigo: number | null;
  salida: string;
  error: string;
  truncado: boolean;
  duracionMs: number;
}

/** Ejecuta un comando y junta la salida (con límite de tiempo y de tamaño). */
export function ejecutar(
  cliente: Client,
  comando: string,
  opciones: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<Resultado> {
  const { timeoutMs = 120_000, maxBytes = 512 * 1024 } = opciones;
  const inicio = Date.now();
  return new Promise((resolve, reject) => {
    cliente.exec(comando, (err, canal) => {
      if (err) return reject(new HttpError(502, `No se pudo ejecutar: ${err.message}`, "ssh_error"));
      let salida = "";
      let error = "";
      let truncado = false;
      const agregar = (actual: string, d: Buffer) => {
        if (actual.length + d.length > maxBytes) {
          truncado = true;
          return actual + d.toString("utf8", 0, Math.max(0, maxBytes - actual.length));
        }
        return actual + d.toString("utf8");
      };
      const limite = setTimeout(() => {
        truncado = true;
        canal.close();
      }, timeoutMs);
      canal.on("data", (d: Buffer) => (salida = agregar(salida, d)));
      canal.stderr.on("data", (d: Buffer) => (error = agregar(error, d)));
      canal.on("close", (codigo: number | null) => {
        clearTimeout(limite);
        resolve({ codigo: codigo ?? null, salida, error, truncado, duracionMs: Date.now() - inicio });
      });
    });
  });
}

export function abrirSftp(cliente: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) =>
    cliente.sftp((err, sftp) => (err ? reject(new HttpError(502, `SFTP no disponible: ${err.message}`, "ssh_error")) : resolve(sftp))),
  );
}

/** Escapa un argumento para el shell remoto (comillas simples). */
export function citar(valor: string): string {
  return `'${valor.replace(/'/g, `'\\''`)}'`;
}
