import { createHash, randomBytes } from "node:crypto";

export const SCOPES_SPOTIFY = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-recently-played",
  "user-top-read",
  "app-remote-control",
  "streaming",
] as const;

export function pkce(): { verificador: string; reto: string } {
  const verificador = randomBytes(48).toString("base64url");
  const reto = createHash("sha256").update(verificador).digest("base64url");
  return { verificador, reto };
}

interface ImagenSp {
  url: string;
  width?: number | null;
}
export interface PistaSp {
  id: string;
  uri: string;
  name: string;
  duration_ms?: number;
  artists: { id?: string; name: string }[];
  album?: { name?: string; images?: ImagenSp[] };
}

export interface Pista {
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

const grande = (imgs: ImagenSp[] | undefined) => imgs?.[0]?.url ?? null;
const chica = (imgs: ImagenSp[] | undefined) => imgs?.at(-1)?.url ?? imgs?.[0]?.url ?? null;

export function mapearPista(t: PistaSp): Pista {
  return {
    id: t.id,
    uri: t.uri,
    nombre: t.name,
    artistas: t.artists.map((a) => a.name).join(", "),
    artistaId: t.artists[0]?.id ?? null,
    album: t.album?.name ?? "",
    portada: grande(t.album?.images),
    portadaChica: chica(t.album?.images),
    duracion: t.duration_ms ?? 0,
  };
}

export interface ReproductorSp {
  is_playing?: boolean;
  progress_ms?: number;
  shuffle_state?: boolean;
  device?: { id?: string; name: string; type?: string; volume_percent?: number | null };
  item?: PistaSp | null;
}

export function mapearEstado(d: ReproductorSp | null, guardada = false) {
  return {
    conectado: true,
    configurado: true,
    sonando: d?.is_playing ?? false,
    aleatorio: d?.shuffle_state ?? false,
    equipo: d?.device?.name ?? null,
    equipoTipo: d?.device?.type ?? null,
    cancion: d?.item ? { ...mapearPista(d.item), progreso: d.progress_ms ?? 0, guardada } : null,
  };
}

export interface DispositivoSp {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted?: boolean;
  volume_percent?: number | null;
}

export function mapearDispositivos(lista: DispositivoSp[]) {
  return lista
    .filter((d): d is DispositivoSp & { id: string } => Boolean(d.id) && !d.is_restricted)
    .map((d) => ({ id: d.id, nombre: d.name, tipo: d.type.toLowerCase(), activo: d.is_active, volumen: d.volume_percent ?? null }));
}

export interface PlaylistSp {
  id: string;
  uri: string;
  name: string;
  images?: ImagenSp[] | null;
  /** Desde 2026 se llama `items`; `tracks` es el nombre viejo. */
  items?: { total: number } | null;
  tracks?: { total: number } | null;
  owner?: { display_name?: string | null };
}

export function mapearPlaylist(p: PlaylistSp) {
  return { id: p.id, uri: p.uri, nombre: p.name, portada: grande(p.images ?? undefined), total: p.items?.total ?? p.tracks?.total ?? 0, de: p.owner?.display_name ?? "" };
}

/** Elemento de /playlists/{id}/items: `item` desde 2026, `track` antes. */
export interface ElementoPlaylistSp {
  item?: PistaSp | null;
  track?: PistaSp | null;
}

export function pistasDePlaylist(items: ElementoPlaylistSp[]): Pista[] {
  return items
    .map((i) => i.item ?? i.track)
    .filter((t): t is PistaSp => Boolean(t?.id && t.uri?.startsWith("spotify:track")))
    .map(mapearPista);
}

export function parecidasSinRepetir(candidatas: Pista[], excluir: string[], cuantas = 10): Pista[] {
  const vistas = new Set(excluir);
  const salida: Pista[] = [];
  for (const p of candidatas) {
    if (vistas.has(p.id)) continue;
    vistas.add(p.id);
    salida.push(p);
    if (salida.length >= cuantas) break;
  }
  return salida;
}

export function paginar<T>(lista: readonly T[], pagina: number, porPagina = 6) {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  return { items: lista.slice((actual - 1) * porPagina, actual * porPagina), total: lista.length, pagina: actual, paginas };
}
