import { Capacitor, registerPlugin } from "@capacitor/core";

export interface EstadoRemoto {
  sdk: boolean;
  instalado: boolean;
  conectado: boolean;
}

interface PluginSpotify {
  estado(): Promise<EstadoRemoto>;
  conectar(o: { clientId: string; retorno: string }): Promise<void>;
  reproducir(o: { uri: string }): Promise<void>;
  cola(o: { uri: string }): Promise<void>;
  pausar(): Promise<void>;
  reanudar(): Promise<void>;
  siguiente(): Promise<void>;
  anterior(): Promise<void>;
  desconectar(): Promise<void>;
}

const nativo = Capacitor.getPlatform() === "android" ? registerPlugin<PluginSpotify>("SpotifyRemoto") : null;

export async function estadoRemoto(): Promise<EstadoRemoto | null> {
  if (!nativo) return null;
  try {
    return await nativo.estado();
  } catch {
    return null;
  }
}

export async function conectarRemoto(clientId: string, retorno: string): Promise<boolean> {
  const e = await estadoRemoto();
  if (!nativo || !e?.sdk || !e.instalado) return false;
  if (e.conectado) return true;
  try {
    await nativo.conectar({ clientId, retorno });
    return true;
  } catch {
    return false;
  }
}

export type AccionRemota = { tipo: "reproducir" | "cola"; uri: string } | { tipo: "pausar" | "reanudar" | "siguiente" | "anterior" };

export async function enRemoto(a: AccionRemota): Promise<boolean> {
  if (!nativo) return false;
  try {
    if (a.tipo === "reproducir") await nativo.reproducir({ uri: a.uri });
    else if (a.tipo === "cola") await nativo.cola({ uri: a.uri });
    else await nativo[a.tipo]();
    return true;
  } catch {
    return false;
  }
}
