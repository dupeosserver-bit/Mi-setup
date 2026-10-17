import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "../src/auth/password.js";
import { createTokenSigner, parseRefreshToken } from "../src/auth/tokens.js";
import { base32Decode, base32Encode, hotp, otpauthUri, totpAt, verifyTotp } from "../src/auth/totp.js";
import { createServerCipher } from "../src/security/crypto.js";

const CLAVE_A = "clave-de-prueba-a".padEnd(40, "a");
const CLAVE_B = "clave-de-prueba-b".padEnd(40, "b");

describe("cifrado del servidor (AES-256-GCM)", () => {
  it("cifra y descifra; cada cifrado es distinto", () => {
    const cipher = createServerCipher(CLAVE_A);
    const a = cipher.encrypt("secreto ñ");
    const b = cipher.encrypt("secreto ñ");
    expect(a).not.toBe(b);
    expect(a).not.toContain("secreto");
    expect(cipher.decrypt(a)).toBe("secreto ñ");
  });

  it("rechaza datos alterados y claves distintas", () => {
    const cipher = createServerCipher(CLAVE_A);
    const payload = cipher.encrypt("hola");
    const partes = payload.split(".");
    const alterado = [...partes.slice(0, 3), Buffer.from("adios").toString("base64url")].join(".");
    expect(() => cipher.decrypt(alterado)).toThrow();
    expect(() => createServerCipher(CLAVE_B).decrypt(payload)).toThrow();
  });
});

describe("Argon2id", () => {
  it("genera hashes argon2id y verifica", async () => {
    const hash = await hashSecret("mi-clave-larga-123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifySecret(hash, "mi-clave-larga-123")).toBe(true);
    expect(await verifySecret(hash, "otra")).toBe(false);
    expect(await verifySecret("no-es-un-hash", "x")).toBe(false);
  });
});

describe("TOTP (RFC 6238)", () => {
  // Secreto de los vectores de prueba del RFC: "12345678901234567890" en ASCII.
  const SECRETO = base32Encode(Buffer.from("12345678901234567890"));

  it("coincide con los vectores oficiales (6 dígitos)", () => {
    expect(SECRETO).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpAt(SECRETO, new Date(59 * 1000))).toBe("287082");
    expect(totpAt(SECRETO, new Date(1111111109 * 1000))).toBe("081804");
    expect(totpAt(SECRETO, new Date(1234567890 * 1000))).toBe("005924");
    expect(totpAt(SECRETO, new Date(2000000000 * 1000))).toBe("279037");
    expect(hotp(base32Decode(SECRETO), 1)).toBe("287082");
  });

  it("acepta ±1 paso y rechaza códigos ya usados", () => {
    const ahora = new Date(1111111109 * 1000);
    const anterior = totpAt(SECRETO, new Date(ahora.getTime() - 30_000));
    const paso = verifyTotp(SECRETO, anterior, ahora, null);
    expect(paso).not.toBeNull();
    expect(verifyTotp(SECRETO, anterior, ahora, paso)).toBeNull();
    expect(verifyTotp(SECRETO, totpAt(SECRETO, new Date(ahora.getTime() - 90_000)), ahora, null)).toBeNull();
    expect(verifyTotp(SECRETO, "12ab56", ahora, null)).toBeNull();
  });

  it("genera el enlace otpauth para la app autenticadora", () => {
    const uri = otpauthUri({ secret: SECRETO, account: "yo@x.test", issuer: "Mi Setup" });
    expect(uri.startsWith("otpauth://totp/Mi%20Setup:yo%40x.test?")).toBe(true);
    expect(uri).toContain(`secret=${SECRETO}`);
  });
});

describe("tokens", () => {
  it("el JWT vence y no acepta otra clave", async () => {
    const ahora = new Date("2026-03-01T12:00:00Z");
    const firmante = createTokenSigner(CLAVE_A);
    const token = await firmante.sign({ userId: "u1", sessionId: "s1" }, ahora);
    expect(await firmante.verify(token, ahora)).toEqual({ userId: "u1", sessionId: "s1" });
    expect(await firmante.verify(token, new Date(ahora.getTime() + 16 * 60 * 1000))).toBeNull();
    expect(await createTokenSigner(CLAVE_B).verify(token, ahora)).toBeNull();
  });

  it("solo acepta refresh tokens con formato válido", () => {
    expect(parseRefreshToken("basura")).toBeNull();
    expect(parseRefreshToken("no-uuid.abcdefghijklmnopqrstuvwxyz")).toBeNull();
    const ok = parseRefreshToken("123e4567-e89b-12d3-a456-426614174000.abcdefghijklmnopqrstuvwxyz");
    expect(ok?.sessionId).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
});
