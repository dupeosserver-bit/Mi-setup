import { healthResponseSchema } from "@mi-setup/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createTestContext } from "./helpers.js";

describe("GET /api/health", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>> | undefined;
  afterEach(async () => ctx?.close());

  it("responde 200 {ok:true, version} sin autenticación", async () => {
    ctx = await createTestContext();
    const res = await ctx.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rutas desconocidas devuelven 404 en español", async () => {
    ctx = await createTestContext();
    const res = await ctx.app.inject({ method: "GET", url: "/api/no-existe" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "No encontrado" });
  });
});
