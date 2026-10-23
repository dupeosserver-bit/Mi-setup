import { describe, expect, it } from "vitest";
import { origenServidor } from "../src/lib/api";

describe("versión web: dirección del servidor", () => {
  it("acepta la dirección con o sin https:// y se queda solo con el origen", () => {
    expect(origenServidor("setup.tudominio.com")).toBe("https://setup.tudominio.com");
    expect(origenServidor("  https://setup.tudominio.com/notas  ")).toBe("https://setup.tudominio.com");
    expect(origenServidor("http://setup.tudominio.com")).toBeNull();
    expect(origenServidor("localhost")).toBeNull();
    expect(origenServidor("")).toBeNull();
  });
});
