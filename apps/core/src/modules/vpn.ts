/**
 * VPN WireGuard. core corre en un contenedor y no puede ejecutar
 * /usr/local/sbin/mi-setup-wg en el host: lo hace un servicio mínimo del host
 * (deploy/wg-agent) que escucha en un socket Unix con solo tres operaciones
 * (estado, alta, baja). Nunca se monta el socket de Docker.
 * La llave privada se genera en el dispositivo y jamás llega al servidor.
 */
import { request as httpRequest } from "node:http";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { vpnDevices } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "./common.js";

const LLAVE = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$/;
const NOMBRE = /^[a-z0-9-]{1,32}$/;

export function llamarAgente<T>(socket: string, metodo: "GET" | "POST", ruta: string, cuerpo?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const datos = cuerpo === undefined ? undefined : JSON.stringify(cuerpo);
    const req = httpRequest(
      { socketPath: socket, path: ruta, method: metodo, headers: datos ? { "content-type": "application/json", "content-length": Buffer.byteLength(datos) } : {}, timeout: 25_000 },
      (res) => {
        let texto = "";
        res.setEncoding("utf8");
        res.on("data", (d: string) => (texto += d));
        res.on("end", () => {
          let json: unknown = null;
          try {
            json = texto ? JSON.parse(texto) : null;
          } catch {
            /* respuesta no JSON */
          }
          if ((res.statusCode ?? 500) >= 400) {
            const msg = (json as { error?: string } | null)?.error ?? `El servicio VPN respondió ${res.statusCode}`;
            return reject(new HttpError(502, msg, "vpn_error"));
          }
          resolve(json as T);
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("tiempo agotado")));
    req.on("error", () =>
      reject(new HttpError(503, "El servicio VPN del host no está disponible. Instálalo con deploy/host-install.sh.", "falta_configuracion", { variable: "VPN_SOCKET" })),
    );
    if (datos) req.write(datos);
    req.end();
  });
}

/** Respuesta de `mi-setup-wg add … --json`. Se aceptan varios nombres de campo. */
export function interpretarAlta(r: Record<string, unknown>) {
  const tomar = (...claves: string[]) => {
    for (const c of claves) if (typeof r[c] === "string" && r[c]) return r[c] as string;
    return null;
  };
  const direccion = tomar("address", "client_address", "ip", "direccion");
  const llaveServidor = tomar("server_public_key", "server_pubkey", "publickey_server", "llave_servidor");
  const endpoint = tomar("endpoint", "server_endpoint");
  if (!direccion || !llaveServidor || !endpoint) throw new HttpError(502, "mi-setup-wg no devolvió dirección, llave del servidor o endpoint", "vpn_error");
  return { direccion, llaveServidor, endpoint, dns: tomar("dns") ?? "1.1.1.1", ipsPermitidas: tomar("allowed_ips", "allowedips") ?? "0.0.0.0/0, ::/0" };
}

interface Par {
  llave: string;
  endpoint: string | null;
  ultimoSaludo: number;
  rx: number;
  tx: number;
}

export function vpnRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const socket = deps.config.env.VPN_SOCKET;
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vpn/dispositivos", { config: { acceso: { modulo: "vpn", nivel: "lectura" } } }, async (request) => {
      const user = currentUser(request);
      const filas = await db.select().from(vpnDevices).where(eq(vpnDevices.userId, user.id)).orderBy(asc(vpnDevices.createdAt));
      let pares: Par[] = [];
      let servicio = true;
      try {
        pares = await llamarAgente<Par[]>(socket, "GET", "/estado");
      } catch {
        servicio = false;
      }
      const ahora = deps.now().getTime() / 1000;
      return {
        servicio,
        dispositivos: filas.map((d) => {
          const p = pares.find((x) => x.llave === d.publicKey);
          return {
            id: d.id,
            nombre: d.name,
            direccion: d.address,
            conectado: Boolean(p && p.ultimoSaludo > 0 && ahora - p.ultimoSaludo < 180),
            ultimoSaludo: p?.ultimoSaludo ? new Date(p.ultimoSaludo * 1000).toISOString() : null,
            rx: p?.rx ?? 0,
            tx: p?.tx ?? 0,
          };
        }),
      };
    });

    app.post("/api/vpn/dispositivos", { config: { acceso: { modulo: "vpn", nivel: "escritura", reauth: "pin" } } }, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({
          nombre: z.string().trim().toLowerCase().regex(NOMBRE, "Usa minúsculas, números y guiones (máx. 32)"),
          llavePublica: z.string().regex(LLAVE, "Llave pública de WireGuard inválida"),
          psk: z.string().regex(LLAVE, "Llave precompartida inválida").optional(),
        })
        .parse(request.body);
      const [existe] = await db.select({ id: vpnDevices.id }).from(vpnDevices).where(eq(vpnDevices.name, d.nombre));
      if (existe) throw new HttpError(409, "Ya hay un dispositivo VPN con ese nombre");
      const r = interpretarAlta(await llamarAgente<Record<string, unknown>>(socket, "POST", "/alta", { nombre: d.nombre, llavePublica: d.llavePublica, ...(d.psk ? { psk: d.psk } : {}) }));
      const [nuevo] = await db.insert(vpnDevices).values({ userId: user.id, name: d.nombre, publicKey: d.llavePublica, address: r.direccion }).returning();
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "vpn_alta", module: "vpn", target: d.nombre, outcome: "ok", ...clientInfo(request) });
      return { id: nuevo?.id, ...r };
    });

    app.delete("/api/vpn/dispositivos/:id", { config: { acceso: { modulo: "vpn", nivel: "escritura", reauth: "pin" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const [d] = await db.select().from(vpnDevices).where(and(eq(vpnDevices.id, id), eq(vpnDevices.userId, user.id)));
      if (!d) throw new HttpError(404, "Dispositivo no encontrado");
      await llamarAgente(socket, "POST", "/baja", { nombre: d.name });
      await db.delete(vpnDevices).where(eq(vpnDevices.id, id));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "vpn_baja", module: "vpn", target: d.name, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });
  };
}
