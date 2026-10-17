/**
 * Centro de tiempo real: conexiones WebSocket, suscripciones por tema con
 * autorización, y manejadores de mensajes por tipo (terminal, latidos…).
 */
import { randomUUID } from "node:crypto";
import type { ClienteMensaje, ServidorMensaje } from "@mi-setup/shared";
import type { WebSocket } from "ws";
import type { AuthUser } from "../security/rbac.js";

export interface Conexion {
  readonly id: string;
  readonly socket: WebSocket;
  user: AuthUser | null;
  token: string | null;
  dispositivoId: string | null;
  readonly temas: Set<string>;
}

export type ConexionAutenticada = Conexion & { user: AuthUser };

type Autorizador = (user: AuthUser, tema: string) => boolean | Promise<boolean>;
type AlCambiar = (tema: string, activos: number) => void;
export type Manejador<T extends ClienteMensaje["tipo"] = ClienteMensaje["tipo"]> = (
  con: ConexionAutenticada,
  msg: Extract<ClienteMensaje, { tipo: T }>,
) => void | Promise<void>;

interface Regla {
  readonly prefijo: string;
  readonly autorizar: Autorizador;
  readonly alCambiar?: AlCambiar;
}

export class Hub {
  private readonly conexiones = new Map<string, Conexion>();
  private readonly suscriptores = new Map<string, Set<Conexion>>();
  private readonly reglas: Regla[] = [];
  private readonly manejadores = new Map<string, Manejador>();
  private readonly alCerrar: ((con: Conexion) => void)[] = [];

  registrarTema(prefijo: string, autorizar: Autorizador, alCambiar?: AlCambiar): void {
    this.reglas.push({ prefijo, autorizar, alCambiar });
    this.reglas.sort((a, b) => b.prefijo.length - a.prefijo.length);
  }

  registrarManejador<T extends ClienteMensaje["tipo"]>(tipo: T, fn: Manejador<T>): void {
    this.manejadores.set(tipo, fn as unknown as Manejador);
  }

  manejador(tipo: string): Manejador | undefined {
    return this.manejadores.get(tipo);
  }

  onCerrar(fn: (con: Conexion) => void): void {
    this.alCerrar.push(fn);
  }

  agregar(socket: WebSocket): Conexion {
    const con: Conexion = { id: randomUUID(), socket, user: null, token: null, dispositivoId: null, temas: new Set() };
    this.conexiones.set(con.id, con);
    return con;
  }

  quitar(con: Conexion): void {
    for (const tema of [...con.temas]) this.desuscribir(con, tema);
    this.conexiones.delete(con.id);
    for (const fn of this.alCerrar) fn(con);
  }

  private regla(tema: string): Regla | undefined {
    return this.reglas.find((r) => tema === r.prefijo || tema.startsWith(r.prefijo));
  }

  async suscribir(con: Conexion, tema: string): Promise<boolean> {
    if (!con.user) return false;
    const regla = this.regla(tema);
    if (!regla || !(await regla.autorizar(con.user, tema))) return false;
    if (con.temas.has(tema)) return true;
    con.temas.add(tema);
    const set = this.suscriptores.get(tema) ?? new Set<Conexion>();
    set.add(con);
    this.suscriptores.set(tema, set);
    if (set.size === 1) regla.alCambiar?.(tema, 1);
    return true;
  }

  desuscribir(con: Conexion, tema: string): void {
    if (!con.temas.delete(tema)) return;
    const set = this.suscriptores.get(tema);
    if (!set) return;
    set.delete(con);
    if (set.size === 0) {
      this.suscriptores.delete(tema);
      this.regla(tema)?.alCambiar?.(tema, 0);
    }
  }

  activos(tema: string): number {
    return this.suscriptores.get(tema)?.size ?? 0;
  }

  publicar(tema: string, datos: unknown): void {
    const set = this.suscriptores.get(tema);
    if (!set) return;
    const texto = JSON.stringify({ tipo: "evento", tema, datos } satisfies ServidorMensaje);
    for (const con of set) {
      if (con.socket.readyState === con.socket.OPEN) con.socket.send(texto);
    }
  }

  enviar(con: Conexion, msg: ServidorMensaje): void {
    if (con.socket.readyState === con.socket.OPEN) con.socket.send(JSON.stringify(msg));
  }

  deDispositivo(dispositivoId: string): Conexion[] {
    return [...this.conexiones.values()].filter((c) => c.dispositivoId === dispositivoId);
  }

  todas(): Conexion[] {
    return [...this.conexiones.values()];
  }
}
