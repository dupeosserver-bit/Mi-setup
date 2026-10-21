/**
 * Conexiones SSH (ssh2). Las credenciales se descifran solo en memoria al
 * conectar. Equivalente a StrictHostKeyChecking: la huella del host se acepta
 * la primera vez y, si cambia, se rechaza la conexión.
 */
import { createHash } from "node:crypto";
import ssh2, { Client, type ConnectConfig, type SFTPWrapper } from "ssh2";

// ssh2 es CommonJS: en Node (ESM) `utils` solo existe en la exportación por defecto.
const { utils } = ssh2;
import type { VpsServerRow } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import type { ServerCipher } from "../../security/crypto.js";

export function huellaDe(llave: Buffer): string {
  return `SHA256:${createHash("sha256").update(llave).digest("base64").replace(/=+$/, "")}`;
}

/** Saltos de línea de Windows y espacios sobrantes rompen el formato de la llave. */
export function normalizarLlave(llave: string): string {
  return `${llave.replace(/\r\n?/g, "\n").trim()}\n`;
}

const LLAVE_INVALIDA = "La llave privada no es válida. Pégala completa, con las líneas BEGIN y END.";

/**
 * Revisa que el texto sea una llave privada usable (y que la frase la abra si
 * está cifrada). Los mensajes nunca incluyen la llave ni la frase.
 */
export function validarLlave(llave: string, frase?: string | null): void {
  const texto = normalizarLlave(llave);
  if (/^(ssh-|ecdsa-)/.test(texto)) throw new HttpError(400, "Pegaste la llave pública (.pub): aquí va la llave privada.", "llave_invalida");
  if (!/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(texto)) {
    throw new HttpError(400, "Eso no parece una llave privada: debe empezar con -----BEGIN OPENSSH PRIVATE KEY-----.", "llave_invalida");
  }
  let r: ReturnType<typeof utils.parseKey>;
  try {
    r = utils.parseKey(texto, frase || undefined);
  } catch {
    throw new HttpError(400, LLAVE_INVALIDA, "llave_invalida");
  }
  if (r instanceof Error) {
    if (/passphrase|decrypt/i.test(r.message)) {
      throw new HttpError(400, frase ? "La frase de la llave es incorrecta." : "La llave está protegida con frase: escríbela en «Frase de la llave».", "llave_frase");
    }
    throw new HttpError(400, LLAVE_INVALIDA, "llave_invalida");
  }
  if (!r.isPrivateKey()) throw new HttpError(400, "Pegaste la llave pública: aquí va la llave privada.", "llave_invalida");
}

/** Explica en palabras simples por qué falló la conexión (sin secretos). */
function motivoSsh(err: Error & { level?: string; code?: string }, servidor: VpsServerRow): { mensaje: string; codigo: string } {
  if (err.level === "client-authentication" || /authentication methods failed/i.test(err.message)) {
    return {
      codigo: "ssh_rechazado",
      mensaje:
        servidor.authType === "llave"
          ? `${servidor.name} rechazó la llave. Revisa que su llave pública esté en ~/.ssh/authorized_keys del usuario ${servidor.username}.`
          : `${servidor.name} rechazó la contraseña. Si el VPS solo acepta llaves (PasswordAuthentication no), edita el servidor y usa «Llave privada».`,
    };
  }
  const red: Record<string, string> = {
    ECONNREFUSED: `el puerto ${servidor.port} rechazó la conexión`,
    ENOTFOUND: `no se encontró el host ${servidor.host}`,
    EAI_AGAIN: `no se encontró el host ${servidor.host}`,
    EHOSTUNREACH: "el host no es alcanzable",
    ENETUNREACH: "el host no es alcanzable",
    ECONNRESET: "el servidor cortó la conexión",
  };
  const motivo = err.level === "client-timeout" || /timed out/i.test(err.message) ? "no respondió a tiempo (revisa host, puerto y firewall)" : (red[err.code ?? ""] ?? err.message);
  return { codigo: "ssh_error", mensaje: `No se pudo conectar a ${servidor.name}: ${motivo}.` };
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
      config.privateKey = normalizarLlave(secreto);
      if (servidor.passphraseEnc) config.passphrase = cipher.decrypt(servidor.passphraseEnc);
    } else {
      config.password = secreto;
    }

    cliente.once("ready", () => resolve({ cliente, huellaNueva: servidor.hostKeyFingerprint ? null : vista }));
    cliente.once("error", (err) => {
      cliente.end();
      if (cambiada) {
        reject(
          new HttpError(409, `La huella del servidor cambió (${vista}). Si reinstalaste el VPS, acéptala en la configuración del servidor.`, "huella_cambiada", {
            huella: vista,
          }),
        );
        return;
      }
      const { mensaje, codigo } = motivoSsh(err, servidor);
      reject(new HttpError(502, mensaje, codigo));
    });
    try {
      cliente.connect(config);
    } catch (err) {
      // ssh2 valida la llave al conectar y lanza el error de forma síncrona (sin incluir su texto en el mensaje).
      const frase = err instanceof Error && /passphrase|decrypt/i.test(err.message);
      reject(
        new HttpError(
          400,
          frase ? "La frase de la llave falta o es incorrecta: edita el servidor." : "La llave privada guardada no es válida: edita el servidor y pégala de nuevo.",
          "llave_invalida",
        ),
      );
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
export function ejecutar(cliente: Client, comando: string, opciones: { timeoutMs?: number; maxBytes?: number } = {}): Promise<Resultado> {
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
  return new Promise((resolve, reject) => cliente.sftp((err, sftp) => (err ? reject(new HttpError(502, `SFTP no disponible: ${err.message}`, "ssh_error")) : resolve(sftp))));
}

/** Escapa un argumento para el shell remoto (comillas simples). */
export function citar(valor: string): string {
  return `'${valor.replace(/'/g, `'\\''`)}'`;
}
