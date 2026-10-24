export interface PistaSpotify {
  id: string;
  uri: string;
  nombre: string;
  artistas: string;
  artistaId: string | null;
  album: string;
  portada: string | null;
  portadaChica: string | null;
  duracion: number;
}

export interface CancionSonando extends PistaSpotify {
  progreso: number;
  guardada: boolean;
}

export interface EstadoSpotify {
  conectado: boolean;
  configurado: boolean;
  sonando?: boolean;
  aleatorio?: boolean;
  equipo?: string | null;
  equipoTipo?: string | null;
  /** 0 a 100; null si Spotify no lo dice. */
  volumen?: number | null;
  volumenCambiable?: boolean;
  cancion?: CancionSonando | null;
}

export function conGuardada(e: EstadoSpotify | undefined, id: string, guardada: boolean): EstadoSpotify | undefined {
  if (!e?.cancion || e.cancion.id !== id) return e;
  return { ...e, cancion: { ...e.cancion, guardada } };
}

export async function corazonOptimista(o: { leer: () => EstadoSpotify | undefined; escribir: (e: EstadoSpotify | undefined) => void; enviar: () => Promise<unknown>; id: string; guardar: boolean }): Promise<boolean> {
  const antes = o.leer();
  o.escribir(conGuardada(antes, o.id, o.guardar));
  try {
    await o.enviar();
    return true;
  } catch (err) {
    o.escribir(antes);
    throw err;
  }
}

export const minutos = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const iniciales = (texto: string): string =>
  texto
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "♪";
