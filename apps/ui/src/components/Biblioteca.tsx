export interface ArchivoMedia {
  id: string;
  titulo: string;
  tamano: number;
  tipoArchivo: string;
  progreso: number;
  url: string;
  creado: string;
}

export const pesoArchivo = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
export const minutos = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
