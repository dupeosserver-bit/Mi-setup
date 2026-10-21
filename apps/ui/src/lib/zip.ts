/**
 * Arma un .zip en el navegador (sin librerías). Guarda los archivos tal cual
 * (método «store»): fotos, audio y video ya vienen comprimidos, así que
 * comprimirlos otra vez casi no ahorra y sí tarda.
 */

const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ArchivoZip {
  nombre: string;
  datos: Uint8Array;
  fecha?: Date;
}

/** Nombres repetidos dentro del zip: «foto.jpg», «foto-2.jpg»… */
export function nombresUnicos(nombres: readonly string[]): string[] {
  const usados = new Set<string>();
  return nombres.map((original) => {
    const limpio = original.replace(/[\\:*?"<>|]/g, "_").replace(/^\/+/, "") || "archivo";
    let nombre = limpio;
    const punto = limpio.lastIndexOf(".");
    const [base, ext] = punto > 0 ? [limpio.slice(0, punto), limpio.slice(punto)] : [limpio, ""];
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${base}-${n}${ext}`;
    usados.add(nombre.toLowerCase());
    return nombre;
  });
}

function fechaDos(d: Date): { hora: number; dia: number } {
  const anio = Math.max(1980, d.getFullYear());
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    dia: ((anio - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function crearZip(archivos: readonly ArchivoZip[]): Uint8Array<ArrayBuffer> {
  const codificador = new TextEncoder();
  const nombres = nombresUnicos(archivos.map((a) => a.nombre));
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let desplazamiento = 0;
  archivos.forEach((a, i) => {
    const nombre = codificador.encode(nombres[i]!);
    const crc = crc32(a.datos);
    const { hora, dia } = fechaDos(a.fecha ?? new Date());
    const local = new Uint8Array(30 + nombre.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // nombres en UTF-8
    v.setUint16(8, 0, true);
    v.setUint16(10, hora, true);
    v.setUint16(12, dia, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, a.datos.length, true);
    v.setUint32(22, a.datos.length, true);
    v.setUint16(26, nombre.length, true);
    local.set(nombre, 30);
    locales.push(local, a.datos);

    const central = new Uint8Array(46 + nombre.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.datos.length, true);
    c.setUint32(24, a.datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, desplazamiento, true);
    central.set(nombre, 46);
    centrales.push(central);
    desplazamiento += local.length + a.datos.length;
  });
  const tamCentral = centrales.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, archivos.length, true);
  f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, desplazamiento, true);
  const total = new Uint8Array(desplazamiento + tamCentral + 22);
  let p = 0;
  for (const parte of [...locales, ...centrales, fin]) {
    total.set(parte, p);
    p += parte.length;
  }
  return total;
}
