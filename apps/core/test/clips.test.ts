import { describe, expect, it } from "vitest";
import { argsCorte, argsMomentos, argsYtDlp, elegirMomentos, validarUrlClip, volumenPorSegundo } from "../src/modules/clips.js";

describe("clips: enlaces permitidos", () => {
  it("acepta Twitch, Kick y YouTube por https", () => {
    for (const u of ["https://www.twitch.tv/videos/123456", "https://clips.twitch.tv/AbCd", "https://kick.com/jokeer/videos/abc", "https://youtu.be/xyz", "https://www.youtube.com/watch?v=1"]) {
      expect(validarUrlClip(u).href).toContain("https://");
    }
  });
  it("rechaza lo demás: http, otras páginas, direcciones internas y credenciales", () => {
    for (const u of ["http://twitch.tv/x", "https://evil.com/twitch.tv", "https://twitch.tv.evil.com/x", "https://localhost:3000/x", "https://127.0.0.1/x", "file:///etc/passwd", "https://user:pass@twitch.tv/x", "no es un enlace"]) {
      expect(() => validarUrlClip(u)).toThrow();
    }
  });
});

describe("clips: comandos", () => {
  it("yt-dlp baja un fragmento con --download-sections y nunca usa shell", () => {
    const a = argsYtDlp("https://www.twitch.tv/videos/1", "/x/%(ext)s", { inicio: 3600, fin: 3700 });
    expect(a).toContain("--no-playlist");
    expect(a).toContain("*3600-3700");
    expect(a.at(-1)).toBe("https://www.twitch.tv/videos/1");
    expect(argsYtDlp("https://clips.twitch.tv/a", "/x/%(ext)s")).not.toContain("--download-sections");
  });
  it("el corte vertical pone el video sobre un fondo desenfocado 1080x1920", () => {
    const a = argsCorte("/in.mp4", "/out.mp4", { inicio: 10, fin: 40, formato: "vertical" });
    const filtro = a[a.indexOf("-filter_complex") + 1]!;
    expect(filtro).toContain("1080:1920");
    expect(filtro).toContain("boxblur");
    expect(a[a.indexOf("-t") + 1]).toBe("30");
    expect(a[a.indexOf("-ss") + 1]).toBe("10");
    expect(a.at(-1)).toBe("/out.mp4");
  });
  it("el formato original solo ajusta a medidas pares", () => {
    const a = argsCorte("/in.mp4", "/out.mp4", { inicio: 0, fin: 10, formato: "original" });
    expect(a).not.toContain("-filter_complex");
    expect(a[a.indexOf("-vf") + 1]).toContain("trunc(iw/2)*2");
  });
  it("el análisis de audio imprime el volumen y no escribe archivos", () => {
    expect(argsMomentos("/in.mp4").join(" ")).toContain("lavfi.astats.Overall.RMS_level");
  });
});

describe("clips: momentos destacados", () => {
  it("calcula el volumen por segundo (con silencios -inf)", () => {
    const salida = ["frame:0 pts:0 pts_time:0.01", "lavfi.astats.Overall.RMS_level=-30.0", "frame:1 pts:1 pts_time:0.5", "lavfi.astats.Overall.RMS_level=-20.0", "frame:2 pts:2 pts_time:1.2", "lavfi.astats.Overall.RMS_level=-inf"].join("\n");
    const v = volumenPorSegundo(salida);
    expect(v[0]).toBeCloseTo(-25);
    expect(v[1]).toBe(-90);
  });
  it("elige los picos más fuertes, separados y dentro del video", () => {
    const base = Array.from({ length: 400 }, () => -40);
    for (let i = 100; i < 110; i++) base[i] = -10;
    for (let i = 300; i < 306; i++) base[i] = -15;
    const m = elegirMomentos(base, 2, 400);
    expect(m).toHaveLength(2);
    expect(m[0]!.inicio).toBeLessThan(m[1]!.inicio);
    expect(m[0]!.inicio).toBeLessThanOrEqual(105);
    expect(m[0]!.fin).toBeGreaterThanOrEqual(105);
    expect(m[1]!.inicio).toBeLessThanOrEqual(303);
    expect(m.every((x) => x.puntaje > 20 && x.inicio >= 0 && x.fin <= 400)).toBe(true);
  });
  it("no inventa momentos si el audio es muy corto", () => {
    expect(elegirMomentos([-30, -20, -25], 3, 3)).toEqual([]);
  });
});
