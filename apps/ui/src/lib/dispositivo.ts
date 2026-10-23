/**
 * Registro de este dispositivo y latido cada 15 s. Cuando alguien mira las
 * gráficas de este equipo, el servidor envía "interes" y se mandan métricas
 * cada 2 s mientras dure.
 */
import { HEARTBEAT_INTERVAL_MS } from "@mi-setup/shared";
import { api } from "./api";
import { huellaDispositivo, leerMetricas, nombrePorDefecto, sistemaDispositivo, tipoDispositivo } from "./plataforma";
import { CLAVE_DISPOSITIVO, tiempoReal } from "./tiempo-real";

export function dispositivoActual(): string | null {
  return localStorage.getItem(CLAVE_DISPOSITIVO);
}

export async function asegurarDispositivo(): Promise<string> {
  const existente = dispositivoActual();
  const huella = await huellaDispositivo().catch(() => undefined);
  const { id } = await api<{ id: string }>("/api/equipos/registrar", {
    cuerpo: { nombre: nombrePorDefecto(), tipo: tipoDispositivo(), plataforma: sistemaDispositivo(), huella, id: existente ?? undefined },
  });
  if (id !== existente) {
    localStorage.setItem(CLAVE_DISPOSITIVO, id);
    tiempoReal.autenticar();
  }
  return id;
}

export function olvidarDispositivo(): void {
  localStorage.removeItem(CLAVE_DISPOSITIVO);
}

let iniciado = false;

export function iniciarLatidos(): () => void {
  if (iniciado) return () => undefined;
  iniciado = true;
  let rapido: ReturnType<typeof setInterval> | null = null;

  const latido = async () => {
    const metricas = await leerMetricas().catch(() => ({}));
    tiempoReal.enviar({ tipo: "latido", metricas });
  };
  const enviarMetricas = async () => {
    const metricas = await leerMetricas().catch(() => null);
    if (metricas) tiempoReal.enviar({ tipo: "metricas", metricas });
  };

  const lento = setInterval(() => void latido(), HEARTBEAT_INTERVAL_MS);
  const offOk = tiempoReal.on("auth.ok", () => void latido());
  const offInteres = tiempoReal.on("interes", ({ activo }) => {
    if (activo && !rapido) rapido = setInterval(() => void enviarMetricas(), 2000);
    if (!activo && rapido) {
      clearInterval(rapido);
      rapido = null;
    }
  });

  return () => {
    iniciado = false;
    clearInterval(lento);
    if (rapido) clearInterval(rapido);
    offOk();
    offInteres();
  };
}
