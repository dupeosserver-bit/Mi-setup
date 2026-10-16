import { healthResponseSchema } from "@mi-setup/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { memoryAudit, testConfig } from "./helpers.js";

describe("GET /api/health", () => {
  it("responde 200 {ok:true, version} sin autenticación", async () => {
    const app = await buildApp({ config: testConfig, audit: memoryAudit(), logger: false });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    await app.close();
  });

  it("rutas desconocidas devuelven 404 en español", async () => {
    const app = await buildApp({ config: testConfig, audit: memoryAudit(), logger: false });
    const res = await app.inject({ method: "GET", url: "/api/no-existe" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "No encontrado" });
    await app.close();
  });
});
