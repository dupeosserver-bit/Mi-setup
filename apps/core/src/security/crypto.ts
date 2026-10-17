/**
 * Cifrado del lado del servidor (nivel B): AES-256-GCM con una clave derivada
 * de SERVER_ENC_KEY mediante HKDF-SHA256. Formato: v1.<iv>.<tag>.<cifrado> (base64url).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export interface ServerCipher {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
}

export function createServerCipher(secret: string): ServerCipher {
  const key = Buffer.from(hkdfSync("sha256", secret, "mi-setup", "server-enc-v1", 32));

  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ["v1", iv, tag, data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
    },
    decrypt(payload) {
      const [version, iv, tag, data] = payload.split(".");
      if (version !== "v1" || !iv || !tag || data === undefined) {
        throw new Error("Formato de cifrado desconocido");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    },
  };
}
