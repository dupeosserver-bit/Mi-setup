/**
 * IA gratis en tu VPS: bajar, ver y borrar modelos abiertos de Ollama para
 * usarlos como asistente (se eligen en el selector de modelo del chat).
 * Solo modelos que se descargan completos y corren en tu VPS: nada que pida
 * cuenta, suscripción o recargas (por eso se bloquean los «cloud» de Ollama).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, missingConfig } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { clientInfo, type ModuleDeps } from "../common.js";

export interface ModeloGratis {
  id: string;
  nombre: string;
  descripcion: string;
  /** RAM aproximada que pide para correr. */
  ramGb: number;
  /** Tamaño aproximado de la descarga. */
  descargaGb: number;
  bueno: string;
}

export const MODELOS_GRATIS: readonly ModeloGratis[] = [
  { id: "llama3.2:1b", nombre: "Llama 3.2 · 1B", descripcion: "El más ligero de Meta; responde rápido aunque el VPS sea chico.", ramGb: 1.5, descargaGb: 1.3, bueno: "Respuestas cortas" },
  { id: "llama3.2:3b", nombre: "Llama 3.2 · 3B", descripcion: "Buen equilibrio entre calidad y RAM (el de siempre de Mi Setup).", ramGb: 3, descargaGb: 2, bueno: "Uso general" },
  { id: "qwen2.5:3b", nombre: "Qwen 2.5 · 3B", descripcion: "De Alibaba; muy bueno en español para su tamaño.", ramGb: 3, descargaGb: 1.9, bueno: "Español" },
  { id: "gemma3:4b", nombre: "Gemma 3 · 4B", descripcion: "De Google; entiende también imágenes.", ramGb: 4, descargaGb: 3.3, bueno: "Uso general" },
  { id: "phi4-mini", nombre: "Phi-4 mini", descripcion: "De Microsoft; bueno para razonar y matemáticas.", ramGb: 4, descargaGb: 2.5, bueno: "Razonar" },
  { id: "qwen2.5:7b", nombre: "Qwen 2.5 · 7B", descripcion: "Más listo; pide más RAM.", ramGb: 6, descargaGb: 4.7, bueno: "Uso general" },
  { id: "qwen2.5-coder:7b", nombre: "Qwen 2.5 Coder · 7B", descripcion: "Especial para programar.", ramGb: 6, descargaGb: 4.7, bueno: "Código" },
  { id: "llama3.1:8b", nombre: "Llama 3.1 · 8B", descripcion: "El clásico de Meta, más completo.", ramGb: 7, descargaGb: 4.9, bueno: "Uso general" },
  { id: "mistral:7b", nombre: "Mistral · 7B", descripcion: "Modelo abierto francés, rápido y equilibrado.", ramGb: 6, descargaGb: 4.1, bueno: "Uso general" },
  { id: "deepseek-r1:7b", nombre: "DeepSeek R1 · 7B", descripcion: "Piensa paso a paso antes de responder (más lento).", ramGb: 6, descargaGb: 4.7, bueno: "Razonar" },
];

/** Nombres válidos de Ollama; los «cloud» corren en servidores de Ollama con cuenta: no se permiten. */
export const NOMBRE_MODELO = /^[a-z0-9][a-z0-9._-]{0,60}(\/[a-z0-9._-]{1,60})?(:[a-z0-9._-]{1,40})?$/i;
export function modeloPermitido(nombre: string): boolean {
  return NOMBRE_MODELO.test(nombre) && !/cloud/i.test(nombre);
}

interface Descarga {
  modelo: string;
  estado: string;
  porcentaje: number | null;
  error: string | null;
  terminado: boolean;
}

export function modelosLocalesRoutes(deps: ModuleDeps) {
  const leer = { config: { acceso: { modulo: "ia" as const, nivel: "lectura" as const } } };
  const admin = { config: { acceso: { modulo: "ia" as const, nivel: "administrar" as const, reauth: "pin" as const } } };
  const descargas = new Map<string, Descarga>();
  const base = () => {
    const url = deps.config.env.OLLAMA_URL;
    if (!url) throw missingConfig("OLLAMA_URL");
    return url.replace(/\/+$/, "");
  };

  async function bajar(modelo: string): Promise<void> {
    const d: Descarga = { modelo, estado: "Empezando…", porcentaje: null, error: null, terminado: false };
    descargas.set(modelo, d);
    try {
      const r = await fetch(`${base()}/api/pull`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: modelo, stream: true }) });
      if (!r.ok || !r.body) throw new Error(`Ollama respondió ${r.status}`);
      const lector = r.body.getReader();
      const decod = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += decod.decode(value, { stream: true });
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        for (const l of lineas) {
          if (!l.trim()) continue;
          const j = JSON.parse(l) as { status?: string; total?: number; completed?: number; error?: string };
          if (j.error) throw new Error(j.error);
          d.estado = j.status ?? d.estado;
          if (j.total && j.completed !== undefined) d.porcentaje = Math.round((j.completed / j.total) * 100);
        }
      }
      d.estado = "Listo";
      d.porcentaje = 100;
    } catch (err) {
      d.error = err instanceof Error ? err.message.slice(0, 200) : "Falló la descarga";
    } finally {
      d.terminado = true;
    }
  }

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/ia/modelos-locales", leer, async () => {
      const url = deps.config.env.OLLAMA_URL;
      const r = url ? await fetch(`${url.replace(/\/+$/, "")}/api/tags`, { signal: AbortSignal.timeout(5000) }).catch(() => null) : null;
      const tags = r?.ok ? ((await r.json().catch(() => null)) as { models?: { name: string; size?: number; modified_at?: string }[] } | null) : null;
      return {
        configurado: Boolean(url),
        conectado: Boolean(r?.ok),
        instalados: (tags?.models ?? []).map((m) => ({ nombre: m.name, tamano: m.size ?? null, modificado: m.modified_at ?? null })),
        catalogo: MODELOS_GRATIS,
        descargas: [...descargas.values()],
      };
    });

    app.post("/api/ia/modelos-locales", admin, async (request) => {
      const { modelo } = z.object({ modelo: z.string().trim().max(120) }).parse(request.body);
      if (!modeloPermitido(modelo)) throw new HttpError(400, "Nombre de modelo inválido o de pago (los «cloud» de Ollama piden cuenta)");
      base();
      const actual = descargas.get(modelo);
      if (actual && !actual.terminado) return { ok: true, yaBajando: true };
      void bajar(modelo);
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "ia_modelo_descargado", module: "ia", target: modelo, outcome: "ok", ...clientInfo(request) });
      return { ok: true, yaBajando: false };
    });

    app.delete("/api/ia/modelos-locales/:modelo", admin, async (request) => {
      const { modelo } = z.object({ modelo: z.string().max(120) }).parse(request.params);
      if (!NOMBRE_MODELO.test(modelo)) throw new HttpError(400, "Nombre de modelo inválido");
      const r = await fetch(`${base()}/api/delete`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: modelo }) }).catch(() => null);
      if (!r?.ok) throw new HttpError(502, "Ollama no pudo borrar el modelo");
      descargas.delete(modelo);
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "ia_modelo_borrado", module: "ia", target: modelo, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });
  };
}
