/**
 * Crear y editar imágenes con Nano Banana (modelo de imágenes de Google Gemini).
 * Claude y Llama no generan imágenes; por eso se usa GEMINI_API_KEY.
 * La imagen no se guarda en el servidor: se devuelve y tú decides si la bajas.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, missingConfig } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, type ModuleDeps } from "./common.js";

const MAX_IMAGEN = 7 * 1024 * 1024;

const pedidoSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  proporcion: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
  /** Fotos de referencia para editar o combinar (data URL base64). */
  imagenes: z
    .array(z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Imagen inválida"))
    .max(3)
    .default([]),
});

interface ParteGemini {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export function imagenesRoutes(deps: ModuleDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    app.post(
      "/api/ia-creativa/imagen",
      { config: { acceso: { modulo: "ia_creativa", nivel: "escritura" } }, bodyLimit: 4 * MAX_IMAGEN },
      async (request) => {
        const clave = deps.config.env.GEMINI_API_KEY;
        if (!clave) throw missingConfig("GEMINI_API_KEY");
        const d = pedidoSchema.parse(request.body);
        const partes: unknown[] = [{ text: d.prompt }];
        for (const img of d.imagenes) {
          const [cabecera, datos] = img.split(",") as [string, string];
          if ((datos.length * 3) / 4 > MAX_IMAGEN) throw new HttpError(413, "Cada foto debe pesar menos de 7 MB");
          partes.push({ inlineData: { mimeType: cabecera.slice(5, cabecera.indexOf(";")), data: datos } });
        }
        const modelo = deps.config.env.GEMINI_IMAGE_MODEL;
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": clave },
          body: JSON.stringify({
            contents: [{ role: "user", parts: partes }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: d.proporcion } },
          }),
          signal: AbortSignal.timeout(120_000),
        }).catch(() => null);
        if (!r) throw new HttpError(502, "Gemini no respondió (tardó demasiado). Intenta de nuevo.");
        const cuerpo = (await r.json().catch(() => null)) as {
          error?: { message?: string; status?: string };
          candidates?: { content?: { parts?: ParteGemini[] }; finishReason?: string }[];
          promptFeedback?: { blockReason?: string };
        } | null;
        if (!r.ok) {
          if (r.status === 400 && /API key/i.test(cuerpo?.error?.message ?? "")) throw new HttpError(400, "La clave de Gemini no es válida (Ajustes → Servicios y claves).");
          if (r.status === 429) throw new HttpError(429, "Llegaste al límite de Gemini por ahora. Espera un rato o revisa tu plan en aistudio.google.com.");
          throw new HttpError(502, `Gemini respondió ${r.status}: ${(cuerpo?.error?.message ?? "error").slice(0, 200)}`);
        }
        if (cuerpo?.promptFeedback?.blockReason) throw new HttpError(400, "Gemini no quiso hacer esa imagen (contenido bloqueado). Cambia la descripción.");
        const salida = cuerpo?.candidates?.[0]?.content?.parts ?? [];
        const imagenes = salida.filter((p) => p.inlineData?.data).map((p) => `data:${p.inlineData!.mimeType};base64,${p.inlineData!.data}`);
        const texto = salida.map((p) => p.text ?? "").join("").trim();
        if (!imagenes.length) throw new HttpError(502, texto ? `Gemini no devolvió imagen: ${texto.slice(0, 300)}` : "Gemini no devolvió imagen. Intenta describirla de otra forma.");
        await deps.audit.record({
          actorType: "usuario",
          actorUserId: currentUser(request).id,
          action: "imagen_generada",
          module: "ia_creativa",
          target: modelo,
          outcome: "ok",
          details: { proporcion: d.proporcion, referencias: d.imagenes.length },
          ...clientInfo(request),
        });
        return { imagenes, texto };
      },
    );
  };
}
