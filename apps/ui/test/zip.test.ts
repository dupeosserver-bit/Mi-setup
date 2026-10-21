import { describe, expect, it } from "vitest";
import { crc32, crearZip, nombresUnicos } from "../src/lib/zip";

describe("zip propio", () => {
  it("calcula el CRC32 estándar", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("no repite nombres dentro del zip", () => {
    expect(nombresUnicos(["foto.jpg", "Foto.jpg", "foto.jpg", "nota"])).toEqual(["foto.jpg", "Foto-2.jpg", "foto-3.jpg", "nota"]);
  });

  it("arma un zip con su directorio central", () => {
    const zip = crearZip([
      { nombre: "a.txt", datos: new TextEncoder().encode("hola") },
      { nombre: "voz.webm", datos: new Uint8Array([1, 2, 3]) },
    ]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const fin = zip.length - 22;
    expect(v.getUint32(fin, true)).toBe(0x06054b50);
    expect(v.getUint16(fin + 10, true)).toBe(2);
    const inicioCentral = v.getUint32(fin + 16, true);
    expect(v.getUint32(inicioCentral, true)).toBe(0x02014b50);
  });
});
