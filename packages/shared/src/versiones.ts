/**
 * Versiones de Mi Setup («0.11.2b»): números + letra de etapa.
 * «b» (beta) va antes que «a» (pública); sin letra cuenta como pública.
 */

const ETAPA: Record<string, number> = { b: 0, a: 1, "": 1 };

/** 1 si a > b, -1 si a < b, 0 si son iguales ("0.10.0" > "0.9.3", "0.9.0a" > "0.9.0b"). */
export function compararVersiones(a: string, b: string): number {
  const partes = (v: string) => {
    const m = /^([\d.]+)([a-z]?)/i.exec(v.trim());
    return { nums: (m?.[1] ?? v).split(".").map((n) => Number.parseInt(n, 10) || 0), etapa: ETAPA[(m?.[2] ?? "").toLowerCase()] ?? 1 };
  };
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return Math.sign(pa.etapa - pb.etapa);
}

/** "MiSetup-0.11.2b.apk" → "0.11.2b"; "MiSetup Setup 0.11.1.exe" → "0.11.1"; sin versión → null. */
export function versionDeArchivo(nombre: string): string | null {
  const m = /(\d+\.\d+(?:\.\d+)?[ab]?)(?=[^\d]*\.(?:apk|exe)$)/i.exec(nombre);
  return m ? m[1]!.toLowerCase() : null;
}

export interface ArchivoVersionado {
  nombre: string;
  tipo: string;
  modificado: string;
}

/** Cuántas versiones se muestran y se guardan: la nueva y las 2 anteriores. */
export const VERSIONES_GUARDADAS = 3;

/**
 * De cada tipo (Android, Windows) se quedan las `cuantas` versiones más nuevas;
 * los archivos sin número de versión se ordenan por fecha.
 */
export function versionesRecientes<T extends ArchivoVersionado>(archivos: readonly T[], cuantas = VERSIONES_GUARDADAS): T[] {
  const porTipo = new Map<string, T[]>();
  for (const a of archivos) porTipo.set(a.tipo, [...(porTipo.get(a.tipo) ?? []), a]);
  const quedan: T[] = [];
  for (const lista of porTipo.values()) {
    const ordenada = [...lista].sort((x, y) => {
      const vx = versionDeArchivo(x.nombre);
      const vy = versionDeArchivo(y.nombre);
      const porVersion = vx && vy ? compararVersiones(vy, vx) : 0;
      return porVersion || y.modificado.localeCompare(x.modificado);
    });
    quedan.push(...ordenada.slice(0, cuantas));
  }
  return quedan.sort((x, y) => y.modificado.localeCompare(x.modificado));
}
