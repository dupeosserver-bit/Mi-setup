import { describe, expect, it } from "vitest";
import { claveCorrecta, contextoDe, crearVerificador, derivarClave, descifrar, cifrar, nuevaSal, type ParametrosKdf } from "../src/lib/boveda/cripto";
import { fortaleza, generarContrasena, OPCIONES_POR_DEFECTO } from "../src/lib/boveda/generador";
import { base32Decodificar, codigoTotp, hotp, parsearOtpauth } from "../src/lib/boveda/totp";

// Parámetros mínimos para que las pruebas sean rápidas (la app usa 3 pasadas y 64 MiB).
const KDF_PRUEBA: ParametrosKdf = { alg: "argon2id13", opslimit: 2, memlimit: 8 * 1024 * 1024 };

describe("cifrado de la bóveda (Argon2id + XChaCha20-Poly1305)", () => {
  it("la misma clave maestra y sal dan la misma clave; otra clave no descifra", async () => {
    const sal = await nuevaSal();
    const a = await derivarClave("mi clave maestra larga", sal, KDF_PRUEBA);
    const b = await derivarClave("mi clave maestra larga", sal, KDF_PRUEBA);
    const otra = await derivarClave("otra clave distinta!!", sal, KDF_PRUEBA);
    expect(a).toEqual(b);

    const dato = await cifrar(a, { usuario: "jokeer", contrasena: "s3cr3to" }, contextoDe("login"));
    expect(dato.startsWith("v1.")).toBe(true);
    expect(dato).not.toContain("s3cr3to");
    expect(await descifrar(b, dato, contextoDe("login"))).toEqual({ usuario: "jokeer", contrasena: "s3cr3to" });
    await expect(descifrar(otra, dato, contextoDe("login"))).rejects.toThrow();
    // El tipo va como dato asociado: no se puede mover un elemento a otra colección.
    await expect(descifrar(a, dato, contextoDe("totp"))).rejects.toThrow();
  });

  it("cada cifrado es distinto y el verificador detecta la clave equivocada", async () => {
    const sal = await nuevaSal();
    const clave = await derivarClave("clave-maestra-123", sal, KDF_PRUEBA);
    expect(await cifrar(clave, "x", "c")).not.toBe(await cifrar(clave, "x", "c"));
    const verificador = await crearVerificador(clave);
    expect(await claveCorrecta(clave, verificador)).toBe(true);
    expect(await claveCorrecta(await derivarClave("equivocada-123", sal, KDF_PRUEBA), verificador)).toBe(false);
  });
});

describe("TOTP en el cliente", () => {
  const SECRETO = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890"

  it("coincide con los vectores del RFC 6238", async () => {
    expect(await hotp(base32Decodificar(SECRETO), 1)).toBe("287082");
    const c = { emisor: "x", cuenta: "y", secreto: SECRETO, algoritmo: "SHA1" as const, digitos: 6, periodo: 30 };
    expect((await codigoTotp(c, 1111111109 * 1000)).codigo).toBe("081804");
    expect((await codigoTotp({ ...c, digitos: 8 }, 59 * 1000)).codigo).toBe("94287082");
  });

  it("lee enlaces otpauth y rechaza los inválidos", () => {
    const c = parsearOtpauth("otpauth://totp/Discord:jokeer%40mail.test?secret=jbswy3dpehpk3pxp&issuer=Discord&digits=6&period=30");
    expect(c).toMatchObject({ emisor: "Discord", cuenta: "jokeer@mail.test", secreto: "JBSWY3DPEHPK3PXP", algoritmo: "SHA1", digitos: 6, periodo: 30 });
    expect(() => parsearOtpauth("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP")).toThrow(/TOTP/);
    expect(() => parsearOtpauth("https://ejemplo.test")).toThrow();
    expect(() => parsearOtpauth("otpauth://totp/x?secret=123!")).toThrow();
  });
});

describe("generador y fortaleza", () => {
  it("respeta longitud y tipos de carácter, sin ambiguos", () => {
    for (let i = 0; i < 50; i++) {
      const c = generarContrasena({ ...OPCIONES_POR_DEFECTO, longitud: 24 });
      expect(c).toHaveLength(24);
      expect(c).toMatch(/[A-Z]/);
      expect(c).toMatch(/[a-z]/);
      expect(c).toMatch(/\d/);
      expect(c).toMatch(/[^a-zA-Z\d]/);
      expect(c).not.toMatch(/[Il1O0o]/);
    }
    expect(generarContrasena({ ...OPCIONES_POR_DEFECTO, mayusculas: false, minusculas: false, simbolos: false, longitud: 8 })).toMatch(/^\d{8}$/);
  });

  it("califica la fortaleza", () => {
    expect(fortaleza("minecraft123").puntos).toBeLessThanOrEqual(1);
    expect(fortaleza("aaaa").puntos).toBe(0);
    expect(fortaleza(generarContrasena(OPCIONES_POR_DEFECTO)).puntos).toBe(4);
  });
});
