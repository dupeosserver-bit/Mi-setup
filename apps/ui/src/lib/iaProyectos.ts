import { useQuery } from "@tanstack/react-query";
import { api, API_BASE } from "./api";
import { queryClient } from "./consultas";

export interface Proyecto {
  id: string;
  nombre: string;
  instrucciones: string;
  memoriaCompartida: boolean;
  actualizado: string;
}

export interface Conversacion {
  id: string;
  titulo: string;
  actualizada: string;
  proyectoId: string | null;
}

export interface ArchivoContexto {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  imagen: boolean;
  fragmentos: number;
  fecha: string;
  url: string;
}

export interface UsoContexto {
  archivos: number;
  bytes: number;
  maxArchivos: number;
  maxBytes: number;
}

export interface Recuerdo {
  id: string;
  texto: string;
  proyectoId: string | null;
  fecha: string;
}

export interface Paso {
  texto: string;
  hecho: boolean;
}

export interface CasoDeuda {
  id: string;
  titulo: string;
  tipo: "debo" | "me_deben" | "negociar";
  con: string;
  monto: string;
  estado: "abierto" | "en_acuerdo" | "cerrado";
  probabilidad: number | null;
  pasos: Paso[];
  mensajes: number;
  actualizado: string;
}

export interface AdjuntoCaso {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  imagen: boolean;
  url: string;
}

export interface DetalleCaso {
  caso: CasoDeuda;
  mensajes: { id: number; rol: "user" | "assistant"; texto: string; listo: string | null; fecha: string; adjuntos: AdjuntoCaso[] }[];
  aviso: string;
  sinIa?: boolean;
}

export const urlArchivo = (ruta: string) => `${API_BASE}${ruta}`;

export const refrescarIa = () => void queryClient.invalidateQueries({ queryKey: ["ia"] });

export function useProyectos() {
  return useQuery({ queryKey: ["ia", "proyectos"], queryFn: () => api<Proyecto[]>("/api/ia/proyectos") });
}

export function useConversaciones() {
  return useQuery({ queryKey: ["ia", "conversaciones"], queryFn: () => api<Conversacion[]>("/api/ia/conversaciones") });
}

export function useArchivosProyecto(id: string | null) {
  return useQuery({
    queryKey: ["ia", "archivos", id],
    queryFn: () => api<{ archivos: ArchivoContexto[]; uso: UsoContexto }>(`/api/ia/proyectos/${id}/archivos`),
    enabled: Boolean(id),
  });
}

export function useMemoria(proyectoId: string | null) {
  return useQuery({
    queryKey: ["ia", "memoria", proyectoId],
    queryFn: () => api<Recuerdo[]>(`/api/ia/memoria${proyectoId ? `?proyectoId=${proyectoId}` : ""}`),
  });
}

export function useCasos() {
  return useQuery({ queryKey: ["ia", "deudas"], queryFn: () => api<CasoDeuda[]>("/api/ia/deudas") });
}

export function useCaso(id: string | null) {
  return useQuery({ queryKey: ["ia", "deudas", id], queryFn: () => api<DetalleCaso>(`/api/ia/deudas/${id}`), enabled: Boolean(id) });
}

export const ACEPTA_CONTEXTO = "application/pdf,image/png,image/jpeg,image/webp,image/gif,text/*,.md,.markdown,.txt,.csv,.json,.xml,.yml,.yaml,.html,.css,.js,.ts,.py,.java,.c,.cpp,.sql,.log";

type PdfJs = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJs> | null = null;
function cargarPdfJs(): Promise<PdfJs> {
  pdfjs ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([m, w]) => {
    m.GlobalWorkerOptions.workerSrc = (w as { default: string }).default;
    return m;
  });
  return pdfjs;
}

export async function textoDePdf(f: File, maxLetras = 2_000_000): Promise<string> {
  const m = await cargarPdfJs();
  const doc = await m.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
  const partes: string[] = [];
  let letras = 0;
  for (let i = 1; i <= doc.numPages && letras < maxLetras; i++) {
    const pagina = await doc.getPage(i);
    const contenido = await pagina.getTextContent();
    const texto = contenido.items.map((x) => ("str" in x ? x.str : "")).join(" ").replace(/\s+/g, " ").trim();
    if (texto) {
      partes.push(texto);
      letras += texto.length;
    }
  }
  await doc.destroy();
  return partes.join("\n\n").slice(0, maxLetras);
}

export async function subirContexto(proyectoId: string, f: File) {
  const forma = new FormData();
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) forma.append("texto", await textoDePdf(f).catch(() => ""));
  forma.append("archivo", f, f.name);
  return api<{ archivo: ArchivoContexto; uso: UsoContexto; sinTexto: boolean }>(`/api/ia/proyectos/${proyectoId}/archivos`, { formulario: forma });
}

export function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
