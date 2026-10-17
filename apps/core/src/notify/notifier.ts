/**
 * Notificaciones push vía ntfy autoalojado. Nunca lanza: si falla o falta
 * NTFY_TOPIC, solo deja constancia en el log.
 */
import type { FastifyBaseLogger } from "fastify";

export interface PushMessage {
  readonly title: string;
  readonly message: string;
  /** 1 (mínima) a 5 (urgente). */
  readonly priority?: 1 | 2 | 3 | 4 | 5;
  readonly tags?: readonly string[];
}

export interface Notifier {
  send(message: PushMessage): Promise<void>;
}

export function createNtfyNotifier(options: {
  url: string;
  topic: string | undefined;
  log: FastifyBaseLogger;
}): Notifier {
  let avisado = false;
  return {
    async send(push) {
      if (!options.topic) {
        if (!avisado) options.log.warn("Falta configurar: NTFY_TOPIC (no se envían avisos push)");
        avisado = true;
        return;
      }
      try {
        const res = await fetch(options.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            topic: options.topic,
            title: push.title,
            message: push.message,
            priority: push.priority ?? 3,
            tags: push.tags ?? [],
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) options.log.warn({ status: res.status }, "ntfy rechazó el aviso");
      } catch (err) {
        options.log.warn({ err }, "No se pudo enviar el aviso push");
      }
    },
  };
}
