/**
 * Grabar notas de voz con el micrófono (chat y bloc de notas). Funciona en el
 * navegador, en la app de PC y en el celular (permiso de micrófono).
 */

export interface Grabacion {
  /** Termina y entrega el audio con su duración en segundos. */
  detener(): Promise<{ audio: Blob; duracion: number; tipo: string }>;
  cancelar(): void;
  /** Segundos que lleva grabando. */
  segundos(): number;
}

function tipoAudio(): string {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export async function grabarAudio(): Promise<Grabacion> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Este dispositivo no puede grabar audio aquí");
  let flujo: MediaStream;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    // Algunos celulares no aceptan los ajustes de audio: se intenta con el micrófono tal cual.
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      const nombre = e instanceof DOMException ? e.name : "";
      if (nombre === "NotFoundError") throw new Error("No se encontró un micrófono");
      if (nombre === "NotReadableError") throw new Error("Otra app está usando el micrófono; ciérrala e intenta otra vez");
      throw new Error("Permite el micrófono para grabar (en el celular: Ajustes → Apps → Mi Setup → Permisos → Micrófono)");
    }
  }
  const tipo = tipoAudio();
  const grabadora = new MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: 48_000 } : undefined);
  const partes: Blob[] = [];
  grabadora.ondataavailable = (e) => {
    if (e.data.size) partes.push(e.data);
  };
  const inicio = Date.now();
  grabadora.start(500);
  const apagar = () => flujo.getTracks().forEach((t) => t.stop());
  return {
    segundos: () => Math.round((Date.now() - inicio) / 1000),
    cancelar() {
      grabadora.onstop = null;
      if (grabadora.state !== "inactive") grabadora.stop();
      apagar();
    },
    detener() {
      return new Promise((resolver) => {
        grabadora.onstop = () => {
          apagar();
          const t = (grabadora.mimeType || tipo || "audio/webm").split(";")[0]!;
          resolver({ audio: new Blob(partes, { type: t }), duracion: Math.max(1, Math.round((Date.now() - inicio) / 1000)), tipo: t });
        };
        if (grabadora.state !== "inactive") grabadora.stop();
      });
    },
  };
}

export const extensionDe = (tipo: string) => (tipo.includes("ogg") ? "ogg" : tipo.includes("mp4") ? "m4a" : "webm");
export const fmtDuracion = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
