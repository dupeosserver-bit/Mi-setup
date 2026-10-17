import { describe, expect, it } from "vitest";
import { prepareAuditRow } from "../src/audit/audit.js";
import { loadConfig } from "../src/config.js";
import { REDACTED, redactSecrets } from "../src/security/redact.js";

describe("redacción de secretos", () => {
  it("oculta claves sensibles a cualquier profundidad", () => {
    const entrada = {
      usuario: "jokeer",
      password: "x",
      datos: { apiToken: "y", lista: [{ privateKey: "z", nombre: "ok" }] },
    };
    expect(redactSecrets(entrada)).toEqual({
      usuario: "jokeer",
      password: REDACTED,
      datos: { apiToken: REDACTED, lista: [{ privateKey: REDACTED, nombre: "ok" }] },
    });
  });

  it("la auditoría guarda los detalles ya redactados", () => {
    const fila = prepareAuditRow({
      actorType: "ia",
      action: "propuesta",
      outcome: "propuesto",
      details: { comando: "uptime", secret: "no-debe-guardarse" },
    });
    expect(fila.details).toEqual({ comando: "uptime", secret: REDACTED });
  });
});

describe("configuración", () => {
  it("en producción exige los secretos básicos", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/Falta configurar: POSTGRES_PASSWORD/);
  });

  it("usa misetup como usuario y base por defecto y construye la URL", () => {
    const config = loadConfig({ NODE_ENV: "development", POSTGRES_PASSWORD: "p@ss/word" });
    const url = new URL(config.databaseUrl);
    expect(url.username).toBe("misetup");
    expect(url.pathname).toBe("/misetup");
    expect(decodeURIComponent(url.password)).toBe("p@ss/word");
  });

  it("CORS en producción solo permite el host de la app y la app de Android", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      APP_HOST: "setup.mexicanland.net",
      POSTGRES_PASSWORD: "a",
      JWT_SECRET: "b".repeat(32),
      SERVER_ENC_KEY: "c".repeat(32),
    });
    expect(config.corsOrigins).toEqual(["https://setup.mexicanland.net", "https://localhost", "capacitor://localhost"]);
  });

  it("rechaza secretos de menos de 32 caracteres", () => {
    expect(() => loadConfig({ NODE_ENV: "development", JWT_SECRET: "corto" })).toThrow(/al menos 32/);
  });
});
