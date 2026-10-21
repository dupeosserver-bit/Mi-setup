/**
 * Preferencias de cada cuenta (se sincronizan entre PC y celular):
 * tema y fuente de la app, zoom, tema y fuente de la terminal, voz de la IA
 * y modelo de IA preferido.
 */
import { z } from "zod";

export const TEMAS_APP = {
  oscuro: "Oscuro",
  claro: "Claro",
  sistema: "Sistema",
  gris: "Gris",
  amoled: "Negro (AMOLED)",
  oceano: "Océano",
  violeta: "Violeta",
  bosque: "Bosque",
  "alto-contraste": "Alto contraste",
} as const;
export type TemaApp = keyof typeof TEMAS_APP;

export const FUENTES_APP = {
  inter: { nombre: "Inter", css: "Inter, system-ui, sans-serif" },
  roboto: { nombre: "Roboto", css: "Roboto, system-ui, sans-serif" },
  poppins: { nombre: "Poppins", css: "Poppins, system-ui, sans-serif" },
  montserrat: { nombre: "Montserrat", css: "Montserrat, system-ui, sans-serif" },
  sistema: { nombre: "Del sistema", css: "system-ui, 'Segoe UI', sans-serif" },
} as const;
export type FuenteApp = keyof typeof FUENTES_APP;

export const TEMAS_TERMINAL = {
  "mi-setup": "Mi Setup",
  termius: "Termius Dark",
  dracula: "Dracula",
  monokai: "Monokai",
  nord: "Nord",
  "solarized-oscuro": "Solarized Dark",
  "hacker-verde": "Hacker Green",
  "hacker-azul": "Hacker Blue",
  claro: "Claro",
} as const;
export type TemaTerminal = keyof typeof TEMAS_TERMINAL;

export const FUENTES_TERMINAL = {
  jetbrains: { nombre: "JetBrains Mono", css: "'JetBrains Mono', ui-monospace, monospace" },
  fira: { nombre: "Fira Code", css: "'Fira Code', ui-monospace, monospace" },
  cascadia: { nombre: "Cascadia / Consolas", css: "'Cascadia Mono', Consolas, ui-monospace, monospace" },
  sistema: { nombre: "Monoespaciada del sistema", css: "ui-monospace, SFMono-Regular, Menlo, monospace" },
} as const;
export type FuenteTerminal = keyof typeof FUENTES_TERMINAL;

/** Modelos de IA que se pueden elegir (el servidor siempre valida contra esta lista). */
export const MODELOS_IA = {
  "claude-sonnet-5-5": { nombre: "Claude Sonnet 5.5", detalle: "Equilibrado: rápido y capaz (recomendado)" },
  "claude-opus-5-5": { nombre: "Claude Opus 5.5", detalle: "El más capaz para tareas difíciles; cuesta el doble" },
  "claude-haiku-5-5": { nombre: "Claude Haiku 5.5", detalle: "El más rápido y barato, para cosas simples" },
  "claude-fable-5-1": { nombre: "Claude Fable 5.1", detalle: "Máxima calidad; el más caro" },
  "llama-local": { nombre: "Llama local (gratis)", detalle: "Corre en tu VPS con Ollama: sin costo, más simple y solo conversa (no propone acciones)" },
} as const;
/** Modelo gratuito que corre en el VPS (Ollama). También se usa solo al llegar al tope mensual. */
export const MODELO_LOCAL = "llama-local";
export type ModeloIa = keyof typeof MODELOS_IA;

/** Agentes de terminal instalados en el VPS (VPS → Agentes) que también responden en el asistente. */
export const AGENTES_IA = {
  "agente:claude-code": { nombre: "Claude Code (en tu VPS)", detalle: "Usa la cuenta con la que iniciaste sesión en el VPS (claude). Solo responde: no corre comandos ni edita archivos." },
  "agente:gemini-cli": { nombre: "Gemini CLI (en tu VPS)", detalle: "Usa tu cuenta de Google del VPS (gemini). Solo responde: no corre comandos ni edita archivos." },
} as const;
/** Además de MODELOS_IA: un modelo de Ollama descargado («ollama:nombre») o un agente del VPS. */
export const MODELO_EXTRA = /^(ollama:[a-zA-Z0-9._:/-]{1,80}|agente:(claude-code|gemini-cli))$/;
/** Lo que se puede guardar como modelo elegido. */
export type ModeloElegido = ModeloIa | `ollama:${string}` | keyof typeof AGENTES_IA;
export const esModeloElegible = (m: string): m is ModeloElegido => m in MODELOS_IA || MODELO_EXTRA.test(m);

const claves = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const preferenciasSchema = z.object({
  tema: z.enum(claves(TEMAS_APP)).default("oscuro"),
  fuente: z.enum(claves(FUENTES_APP)).default("inter"),
  /** Porcentaje de zoom de la interfaz. */
  zoom: z.number().int().min(70).max(150).default(100),
  /** Ya vio el tutorial de bienvenida (se muestra una vez por cuenta). */
  tutorialVisto: z.boolean().default(false),
  /** Fondo de pantalla: qué tan transparentes son los paneles (%) y cuánto se oscurece la imagen (%). */
  vidrio: z
    .object({
      paneles: z.number().int().min(0).max(85).default(0),
      velo: z.number().int().min(0).max(100).default(90),
      /** Cómo se acomoda la imagen: auto (completa si no cabe bien), llenar (recorta) o completo (se ve entera). */
      ajuste: z.enum(["auto", "llenar", "completo"]).default("auto"),
    })
    .default({}),
  terminal: z
    .object({
      tema: z.enum(claves(TEMAS_TERMINAL)).default("mi-setup"),
      fuente: z.enum(claves(FUENTES_TERMINAL)).default("jetbrains"),
      tamano: z.number().int().min(10).max(24).default(13),
    })
    .default({}),
  voz: z
    .object({
      /** Nombre de la voz del sistema (speechSynthesis); null = la predeterminada en español. */
      nombre: z.string().max(200).nullable().default(null),
      velocidad: z.number().min(0.5).max(2).default(1),
      tono: z.number().min(0.5).max(2).default(1),
      /** Leer en voz alta las respuestas de la IA. */
      leerRespuestas: z.boolean().default(false),
    })
    .default({}),
  ia: z
    .object({
      /** null = el modelo del servidor (AI_MODEL). */
      modelo: z
        .string()
        .refine(esModeloElegible, "Modelo desconocido")
        .transform((m) => m as ModeloElegido)
        .nullable()
        .default(null),
    })
    .default({}),
});

export type Preferencias = z.infer<typeof preferenciasSchema>;
export const PREFERENCIAS_INICIALES: Preferencias = preferenciasSchema.parse({});
