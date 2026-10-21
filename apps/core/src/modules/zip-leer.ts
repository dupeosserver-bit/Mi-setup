/**
 * Lector mínimo de .zip (sin librerías): lista los archivos y saca uno.
 * Sirve para revisar un .blueprint (es un zip) antes de instalarlo.
 */
import { inflateRawSync } from "node:zlib";
import { HttpError } from "../http-error.js";

export interface EntradaZip {
  nombre: string;
  metodo: number;
  comprimido: number;
  tamano: number;
  inicio: number;
}

export function listarZip(buf: Buffer): EntradaZip[] {
  // Fin del directorio central: se busca desde el final (puede haber comentario).
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new HttpError(400, "El archivo no es un .zip válido");
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const entradas: EntradaZip[] = [];
  for (let i = 0; i < total && i < 20_000; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new HttpError(400, "El .zip está dañado");
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const tamano = buf.readUInt32LE(p + 24);
    const largoNombre = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + largoNombre).toString("utf8");
    if (local + 30 > buf.length) throw new HttpError(400, "El .zip está dañado");
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    entradas.push({ nombre, metodo, comprimido, tamano, inicio });
    p += 46 + largoNombre + extra + comentario;
  }
  return entradas;
}

/** Contenido de un archivo del zip (máx. 2 MB: solo para archivos de configuración). */
export function leerDelZip(buf: Buffer, entrada: EntradaZip): Buffer {
  if (entrada.tamano > 2 * 1024 * 1024) throw new HttpError(400, "Ese archivo del zip es demasiado grande");
  const datos = buf.subarray(entrada.inicio, entrada.inicio + entrada.comprimido);
  if (entrada.metodo === 0) return Buffer.from(datos);
  if (entrada.metodo === 8) return inflateRawSync(datos, { maxOutputLength: 2 * 1024 * 1024 });
  throw new HttpError(400, "El zip usa una compresión que no se puede leer");
}
