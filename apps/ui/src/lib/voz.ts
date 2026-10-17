/**
 * Voz de la IA: leer texto en voz alta y dictar mensajes.
 * - Android: plugins nativos (texto a voz y reconocimiento de voz del sistema).
 * - PC y navegador: Web Speech (voces instaladas en Windows).
 */
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import type { Preferencias } from "@mi-setup/shared";
import { esMovil } from "./plataforma";

type PrefVoz = Preferencias["voz"];

function esperarVoces(): Promise<SpeechSynthesisVoice[]> {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  const ya = speechSynthesis.getVoices();
  if (ya.length) return Promise.resolve(ya);
  return new Promise((resolver) => {
    const listo = () => resolver(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", listo, { once: true });
    setTimeout(listo, 1500);
  });
}

/** Voces disponibles (primero las de español). */
export async function vocesEspanol(): Promise<SpeechSynthesisVoice[]> {
  let voces: SpeechSynthesisVoice[] = [];
  if (esMovil()) {
    voces = (await TextToSpeech.getSupportedVoices().catch(() => ({ voices: [] as SpeechSynthesisVoice[] }))).voices;
  } else {
    voces = await esperarVoces();
  }
  return [...voces].sort((a, b) => Number(b.lang.startsWith("es")) - Number(a.lang.startsWith("es")) || a.name.localeCompare(b.name));
}

/** Quita marcas de Markdown para que no se lean los símbolos. */
function limpiar(texto: string): string {
  return texto
    .replace(/```[\s\S]*?```/g, " (bloque de código) ")
    .replace(/[*_`#>|]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .slice(0, 4000);
}

export async function hablar(texto: string, voz: PrefVoz): Promise<void> {
  const limpio = limpiar(texto);
  if (!limpio.trim()) return;
  if (esMovil()) {
    const voces = await vocesEspanol();
    const indice = voz.nombre ? voces.findIndex((v) => v.name === voz.nombre) : -1;
    await TextToSpeech.stop().catch(() => undefined);
    await TextToSpeech.speak({ text: limpio, lang: "es-MX", rate: voz.velocidad, pitch: voz.tono, ...(indice >= 0 ? { voice: indice } : {}) });
    return;
  }
  if (!("speechSynthesis" in window)) throw new Error("Este dispositivo no puede leer en voz alta");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(limpio);
  const voces = await esperarVoces();
  u.voice = voces.find((v) => v.name === voz.nombre) ?? voces.find((v) => v.lang.startsWith("es")) ?? null;
  u.lang = u.voice?.lang ?? "es-MX";
  u.rate = voz.velocidad;
  u.pitch = voz.tono;
  speechSynthesis.speak(u);
}

export function callar(): void {
  if (esMovil()) void TextToSpeech.stop().catch(() => undefined);
  else if ("speechSynthesis" in window) speechSynthesis.cancel();
}

interface ReconocedorWeb {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
}

/** Escucha una frase y devuelve el texto. */
export async function escuchar(): Promise<string> {
  if (esMovil()) {
    const { available } = await SpeechRecognition.available();
    if (!available) throw new Error("Este celular no tiene reconocimiento de voz");
    const permiso = await SpeechRecognition.requestPermissions();
    if (permiso.speechRecognition !== "granted") throw new Error("Permite el micrófono para dictar");
    const r = await SpeechRecognition.start({ language: "es-MX", maxResults: 1, partialResults: false, popup: true });
    return r.matches?.[0] ?? "";
  }
  const Clase = (window as unknown as { SpeechRecognition?: new () => ReconocedorWeb; webkitSpeechRecognition?: new () => ReconocedorWeb }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => ReconocedorWeb }).webkitSpeechRecognition;
  if (!Clase) throw new Error("Dictado no disponible aquí. Usa el dictado de Windows (tecla Windows + H) en el cuadro de texto.");
  return new Promise((resolver, rechazar) => {
    const rec = new Clase();
    rec.lang = "es-MX";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let texto = "";
    rec.onresult = (e) => {
      texto = e.results[0]?.[0]?.transcript ?? "";
    };
    rec.onerror = (e) =>
      rechazar(new Error(e.error === "not-allowed" ? "Permite el micrófono para dictar" : "No se pudo usar el dictado aquí. Prueba el dictado de Windows (tecla Windows + H)."));
    rec.onend = () => resolver(texto);
    rec.start();
  });
}
