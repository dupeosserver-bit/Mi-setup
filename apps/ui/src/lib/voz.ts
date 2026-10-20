/**
 * Voz de la IA: leer texto en voz alta y dictar mensajes.
 * - Android: plugins nativos (texto a voz y reconocimiento de voz del sistema).
 * - PC y navegador: Web Speech (voces instaladas en Windows).
 */
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import type { Preferencias } from "@mi-setup/shared";
import { api } from "./api";
import { grabarAudio } from "./grabadora";
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

interface ReconocedorContinuo extends ReconocedorWeb {
  continuous: boolean;
  stop(): void;
}

/**
 * Dictado que va escribiendo mientras hablas. Llama alTexto con lo que va
 * entendiendo (parcial) y con cada frase terminada (final). Devuelve cómo parar.
 * - Celular: reconocimiento del sistema (se reinicia solo en cada pausa).
 * - Navegador con Web Speech: continuo.
 * - App de PC: graba trozos de 6 s y los pasa a texto con Gemini en tu servidor.
 */
export async function dictar(alTexto: (texto: string, final: boolean) => void, alError: (e: Error) => void): Promise<() => void> {
  if (esMovil()) {
    const { available } = await SpeechRecognition.available();
    if (!available) throw new Error("Este celular no tiene reconocimiento de voz");
    const permiso = await SpeechRecognition.requestPermissions();
    if (permiso.speechRecognition !== "granted") throw new Error("Permite el micrófono para dictar");
    let activo = true;
    let ultimo = "";
    const empezar = () => {
      ultimo = "";
      // Con resultados parciales responde al momento; lo dicho llega por «partialResults».
      void SpeechRecognition.start({ language: "es-MX", maxResults: 1, partialResults: true, popup: false }).catch(() => undefined);
    };
    const parcial = await SpeechRecognition.addListener("partialResults", (d: { matches?: string[] }) => {
      ultimo = d.matches?.[0] ?? "";
      alTexto(ultimo, false);
    });
    // En cada pausa el celular deja de escuchar: se guarda la frase y se vuelve a empezar.
    const estado = await SpeechRecognition.addListener("listeningState", (d: { status: "started" | "stopped" }) => {
      if (d.status !== "stopped") return;
      if (ultimo) alTexto(ultimo, true);
      ultimo = "";
      if (activo) setTimeout(empezar, 250);
    });
    empezar();
    return () => {
      activo = false;
      void SpeechRecognition.stop().catch(() => undefined);
      void parcial.remove();
      void estado.remove();
    };
  }
  const Clase = (window as unknown as { SpeechRecognition?: new () => ReconocedorContinuo; webkitSpeechRecognition?: new () => ReconocedorContinuo }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => ReconocedorContinuo }).webkitSpeechRecognition;
  const esElectron = /Electron/i.test(navigator.userAgent);
  if (Clase && !esElectron) {
    const rec = new Clase();
    rec.lang = "es-MX";
    rec.continuous = true;
    rec.interimResults = true;
    let activo = true;
    rec.onresult = (e) => {
      const lista = e.results as unknown as ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      const ultimo = lista[lista.length - 1];
      if (ultimo) alTexto(ultimo[0]?.transcript ?? "", ultimo.isFinal);
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech") alError(new Error(e.error === "not-allowed" ? "Permite el micrófono para dictar" : "El dictado se detuvo"));
    };
    rec.onend = () => {
      if (activo) rec.start();
    };
    rec.start();
    return () => {
      activo = false;
      rec.stop();
    };
  }
  // App de PC: trozos de audio → texto en el servidor.
  let activo = true;
  let actual = await grabarAudio();
  const trozo = async () => {
    while (activo) {
      await new Promise((r) => setTimeout(r, 6000));
      const g = actual;
      if (activo) actual = await grabarAudio();
      const { audio, tipo } = await g.detener();
      const datos = new FormData();
      datos.append("archivo", audio, `trozo.${tipo.includes("ogg") ? "ogg" : "webm"}`);
      try {
        const r = await api<{ texto: string }>("/api/voz/transcribir", { formulario: datos });
        if (r.texto) alTexto(r.texto, true);
      } catch (err) {
        activo = false;
        actual.cancelar();
        alError(err instanceof Error ? err : new Error("No se pudo pasar a texto"));
      }
    }
  };
  void trozo();
  return () => {
    activo = false;
    void actual.detener().then(async ({ audio, tipo, duracion }) => {
      if (duracion < 1) return;
      const datos = new FormData();
      datos.append("archivo", audio, `trozo.${tipo.includes("ogg") ? "ogg" : "webm"}`);
      const r = await api<{ texto: string }>("/api/voz/transcribir", { formulario: datos }).catch(() => null);
      if (r?.texto) alTexto(r.texto, true);
    });
  };
}
