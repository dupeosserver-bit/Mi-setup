/** Tareas periódicas de core. Solo se arrancan desde index.ts (no en pruebas). */
import type { FastifyBaseLogger } from "fastify";

export interface Job {
  readonly nombre: string;
  readonly cadaMs: number;
  /** Ejecutar también al arrancar. */
  readonly alInicio?: boolean;
  run(): Promise<void> | void;
}

export function startJobs(jobs: readonly Job[], log: FastifyBaseLogger): () => void {
  const timers: NodeJS.Timeout[] = [];
  for (const job of jobs) {
    let corriendo = false;
    const ejecutar = () => {
      if (corriendo) return;
      corriendo = true;
      Promise.resolve()
        .then(() => job.run())
        .catch((err: unknown) => log.warn({ err, job: job.nombre }, "Falló una tarea periódica"))
        .finally(() => {
          corriendo = false;
        });
    };
    if (job.alInicio) ejecutar();
    const t = setInterval(ejecutar, job.cadaMs);
    t.unref();
    timers.push(t);
  }
  return () => timers.forEach(clearInterval);
}
