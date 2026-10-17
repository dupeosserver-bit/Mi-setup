/**
 * Cliente del WebSocket único (/api/ws): autenticación, suscripciones por
 * tema, reconexión con espera creciente y re-suscripción automática.
 */
import type { ClienteMensaje, ServidorMensaje } from "@mi-setup/shared";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { API_BASE, refrescar } from "./api";
import { useSesion } from "./sesion";

type Callback = (datos: unknown) => void;
type Oyente = (msg: ServidorMensaje) => void;
export type EstadoConexion = "desconectado" | "conectando" | "conectado";

const CLAVE_DISPOSITIVO = "mi-setup.dispositivo";

class TiempoReal {
  private ws: WebSocket | null = null;
  private activo = false;
  private autenticado = false;
  private intentos = 0;
  private reconexion: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private readonly temas = new Map<string, Set<Callback>>();
  private readonly oyentes = new Map<string, Set<Oyente>>();
  private readonly cambios = new Set<() => void>();
  estado: EstadoConexion = "desconectado";

  private fijarEstado(e: EstadoConexion) {
    this.estado = e;
    this.cambios.forEach((fn) => fn());
  }

  onEstado = (fn: () => void) => {
    this.cambios.add(fn);
    return () => this.cambios.delete(fn);
  };

  iniciar() {
    if (this.activo) return;
    this.activo = true;
    this.conectar();
  }

  detener() {
    this.activo = false;
    if (this.reconexion) clearTimeout(this.reconexion);
    this.ws?.close();
    this.ws = null;
    this.fijarEstado("desconectado");
  }

  private url(): string {
    const base = API_BASE || window.location.origin;
    return `${base.replace(/^http/, "ws")}/api/ws`;
  }

  private async conectar() {
    if (!this.activo || this.ws) return;
    if (!useSesion.getState().accessToken && !(await refrescar())) {
      this.programar();
      return;
    }
    this.fijarEstado("conectando");
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => this.autenticar();
    ws.onmessage = (ev) => {
      let msg: ServidorMensaje;
      try {
        msg = JSON.parse(String(ev.data)) as ServidorMensaje;
      } catch {
        return;
      }
      if (msg.tipo === "auth.ok") {
        this.autenticado = true;
        this.intentos = 0;
        this.fijarEstado("conectado");
        for (const tema of this.temas.keys()) this.enviarCrudo({ tipo: "sub", tema });
      } else if (msg.tipo === "evento") {
        this.temas.get(msg.tema)?.forEach((cb) => cb(msg.datos));
      }
      this.oyentes.get(msg.tipo)?.forEach((fn) => fn(msg));
    };
    ws.onclose = (ev) => {
      this.ws = null;
      this.autenticado = false;
      if (this.ping) clearInterval(this.ping);
      this.fijarEstado("desconectado");
      if (ev.code === 4401) void refrescar().finally(() => this.programar());
      else this.programar();
    };
    this.ping = setInterval(() => this.enviarCrudo({ tipo: "ping" }), 25_000);
  }

  private programar() {
    if (!this.activo) return;
    const espera = Math.min(30_000, 1000 * 2 ** this.intentos++);
    this.reconexion = setTimeout(() => void this.conectar(), espera);
  }

  /** Se llama al abrir y cada vez que se renueva el token. */
  autenticar() {
    const token = useSesion.getState().accessToken;
    if (!token || this.ws?.readyState !== WebSocket.OPEN) return;
    const dispositivoId = localStorage.getItem(CLAVE_DISPOSITIVO) ?? undefined;
    this.enviarCrudo({ tipo: "auth", token, ...(dispositivoId ? { dispositivoId } : {}) });
  }

  private enviarCrudo(msg: ClienteMensaje) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Envía un mensaje si hay sesión en el WebSocket; devuelve si se envió. */
  enviar(msg: ClienteMensaje): boolean {
    if (!this.autenticado) return false;
    this.enviarCrudo(msg);
    return true;
  }

  suscribir(tema: string, cb: Callback): () => void {
    const set = this.temas.get(tema) ?? new Set<Callback>();
    set.add(cb);
    this.temas.set(tema, set);
    if (set.size === 1 && this.autenticado) this.enviarCrudo({ tipo: "sub", tema });
    return () => {
      set.delete(cb);
      if (set.size === 0) {
        this.temas.delete(tema);
        if (this.autenticado) this.enviarCrudo({ tipo: "unsub", tema });
      }
    };
  }

  on<T extends ServidorMensaje["tipo"]>(tipo: T, fn: (msg: Extract<ServidorMensaje, { tipo: T }>) => void) {
    const set = this.oyentes.get(tipo) ?? new Set<Oyente>();
    set.add(fn as Oyente);
    this.oyentes.set(tipo, set);
    return () => {
      set.delete(fn as Oyente);
    };
  }
}

export const tiempoReal = new TiempoReal();

// Reenviar el token al WebSocket cada vez que se renueva.
useSesion.subscribe((s, previo) => {
  if (s.accessToken && s.accessToken !== previo.accessToken) tiempoReal.autenticar();
});

/** Suscripción a un tema mientras el componente está montado. */
export function useTema<T = unknown>(tema: string | null, cb: (datos: T) => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!tema) return;
    return tiempoReal.suscribir(tema, (d) => ref.current(d as T));
  }, [tema]);
}

export function useEstadoConexion(): EstadoConexion {
  return useSyncExternalStore(tiempoReal.onEstado, () => tiempoReal.estado);
}

export { CLAVE_DISPOSITIVO };
