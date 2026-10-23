/**
 * Rendimiento en vivo del VPS: se sondea por SSH cada 3 s SOLO mientras haya
 * alguien suscrito a `vps:<id>:metricas`. No se guarda historial.
 */
import { can, temas } from "@mi-setup/shared";
import type { Client } from "ssh2";
import type { ModuleDeps } from "../common.js";
import { parsearMetricas, SCRIPT_METRICAS, type Muestra } from "./parse.js";
import type { Servidores } from "./servidores.js";
import { ejecutar } from "./ssh.js";

interface Sondeo {
  activo: boolean;
  cliente: Client | null;
  previa: Muestra | null;
  temporizador: ReturnType<typeof setTimeout> | null;
}

export function registrarMetricasVps(deps: ModuleDeps, servidores: Servidores): void {
  const sondeos = new Map<string, Sondeo>();

  const detener = (id: string) => {
    const s = sondeos.get(id);
    if (!s) return;
    s.activo = false;
    if (s.temporizador) clearTimeout(s.temporizador);
    s.cliente?.end();
    sondeos.delete(id);
  };

  const ciclo = async (id: string) => {
    const s = sondeos.get(id);
    if (!s?.activo) return;
    const tema = temas.metricasVps(id);
    try {
      if (!s.cliente) {
        const servidor = await servidores.obtener(id);
        s.cliente = await servidores.conectar(servidor);
        s.cliente.on("close", () => {
          s.cliente = null;
        });
      }
      const r = await ejecutar(s.cliente, SCRIPT_METRICAS, { timeoutMs: 10_000, maxBytes: 128 * 1024 });
      const primera = !s.previa;
      const { metricas, muestra } = parsearMetricas(r.salida, Date.now(), s.previa);
      s.previa = muestra;
      deps.hub.publicar(tema, metricas);
      // Procesador e Internet se calculan entre dos lecturas: la segunda va al segundo para no dejar «—».
      s.temporizador = setTimeout(() => void ciclo(id), primera ? 1_000 : 3_000);
    } catch (err) {
      deps.hub.publicar(tema, { t: Date.now(), error: err instanceof Error ? err.message : "Error al leer métricas" });
      s.cliente?.end();
      s.cliente = null;
      s.temporizador = setTimeout(() => void ciclo(id), 10_000);
    }
  };

  deps.hub.registrarTema(
    "vps:",
    (user, tema) => tema.endsWith(":metricas") && can(user, "vps_rendimiento", "lectura"),
    (tema, activos) => {
      const id = tema.split(":")[1] ?? "";
      if (activos > 0 && !sondeos.has(id)) {
        sondeos.set(id, { activo: true, cliente: null, previa: null, temporizador: null });
        void ciclo(id);
      } else if (activos === 0) {
        detener(id);
      }
    },
  );
}
