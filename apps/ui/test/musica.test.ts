import { describe, expect, it } from "vitest";
import { conGuardada, corazonOptimista, iniciales, minutos, type EstadoSpotify } from "../src/lib/musica";

const base: EstadoSpotify = {
  conectado: true,
  configurado: true,
  sonando: true,
  cancion: { id: "a", uri: "spotify:track:a", nombre: "Canción", artistas: "Artista", artistaId: null, album: "", portada: null, portadaChica: null, duracion: 1000, progreso: 0, guardada: false },
};

describe("música", () => {
  it("el corazón cambia al instante y se queda si Spotify responde bien", async () => {
    let estado: EstadoSpotify | undefined = base;
    const vistos: (boolean | undefined)[] = [];
    await corazonOptimista({
      leer: () => estado,
      escribir: (e) => {
        estado = e;
        vistos.push(e?.cancion?.guardada);
      },
      enviar: async () => undefined,
      id: "a",
      guardar: true,
    });
    expect(vistos).toEqual([true]);
    expect(estado?.cancion?.guardada).toBe(true);
  });

  it("si Spotify falla, el corazón regresa como estaba", async () => {
    let estado: EstadoSpotify | undefined = base;
    const vistos: (boolean | undefined)[] = [];
    await expect(
      corazonOptimista({
        leer: () => estado,
        escribir: (e) => {
          estado = e;
          vistos.push(e?.cancion?.guardada);
        },
        enviar: async () => {
          throw new Error("sin red");
        },
        id: "a",
        guardar: true,
      }),
    ).rejects.toThrow("sin red");
    expect(vistos).toEqual([true, false]);
    expect(estado?.cancion?.guardada).toBe(false);
  });

  it("no toca otra canción y da formato a tiempos e iniciales", () => {
    expect(conGuardada(base, "otra", true)).toBe(base);
    expect(minutos(208_000)).toBe("3:28");
    expect(minutos(-5)).toBe("0:00");
    expect(iniciales("Tal Como Eres")).toBe("TC");
    expect(iniciales("")).toBe("♪");
  });
});
