/**
 * Claves propias de cada persona (Ajustes → Mis claves).
 *
 * Quien usa tu Mi Setup puede poner su propia clave de Claude, Gemini, TMDB o
 * CurseForge: se usa en lugar de la del servidor y se guarda cifrada (ni la
 * cuenta maestra la puede leer). Si la comparte, las demás personas la usan
 * cuando no tienen la suya (con aviso: gastan su cuota).
 *
 * La cuenta maestra decide por persona si puede usar las claves del servidor y
 * si puede ver (enmascarado) Ajustes → Servicios y claves.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config.js";
import { HttpError } from "../http-error.js";
import { currentUser, type AuthUser } from "../security/rbac.js";
import { clientInfo, idParams, requireCipher, type ModuleDeps } from "./common.js";
import { deleteSetting, getSetting, setSetting } from "./settings.js";

export const CLAVES_PERSONALES = [
  { nombre: "ANTHROPIC_API_KEY", etiqueta: "Clave de Claude (IA)", ayuda: "console.anthropic.com → API Keys → Create Key. La IA usa tu clave y tu saldo." },
  { nombre: "GEMINI_API_KEY", etiqueta: "Clave de Gemini (IA creativa)", ayuda: "aistudio.google.com → Get API key." },
  { nombre: "TMDB_API_KEY", etiqueta: "Clave de TMDB (películas)", ayuda: "themoviedb.org → Ajustes → API." },
  { nombre: "CURSEFORGE_API_KEY", etiqueta: "Clave de CurseForge (mods)", ayuda: "console.curseforge.com → API keys." },
] as const satisfies readonly { nombre: keyof Env & string; etiqueta: string; ayuda: string }[];

export type ClavePersonal = (typeof CLAVES_PERSONALES)[number]["nombre"];
const NOMBRES = new Set<string>(CLAVES_PERSONALES.map((c) => c.nombre));

interface GuardadoClave {
  cifrado: string;
  compartida: boolean;
  fin: string;
}
type ClavesDeUsuario = Partial<Record<ClavePersonal, GuardadoClave>>;

export interface PoliticaClaves {
  /** Puede usar las claves de Ajustes → Servicios (por defecto sí). */
  usarDelServidor: boolean;
  /** Puede ver Ajustes → Servicios y claves, enmascaradas y sin editar. */
  verServicios: boolean;
}
const POLITICA_BASE: PoliticaClaves = { usarDelServidor: true, verServicios: false };

const claveMias = (userId: string) => `claves-usuario:${userId}`;
const clavePolitica = (userId: string) => `politica-claves:${userId}`;
/** Índice de quién compartió cada clave (para no recorrer todas las cuentas). */
const CLAVE_COMPARTIDAS = "claves-compartidas";

export async function politicaDe(deps: Pick<ModuleDeps, "db">, userId: string): Promise<PoliticaClaves> {
  return { ...POLITICA_BASE, ...((await getSetting<Partial<PoliticaClaves>>(deps.db, clavePolitica(userId))) ?? {}) };
}

async function misClaves(deps: Pick<ModuleDeps, "db">, userId: string): Promise<ClavesDeUsuario> {
  return (await getSetting<ClavesDeUsuario>(deps.db, claveMias(userId))) ?? {};
}

function descifrar(deps: Pick<ModuleDeps, "cipher">, g: GuardadoClave | undefined): string | null {
  if (!g || !deps.cipher) return null;
  try {
    return deps.cipher.decrypt(g.cifrado);
  } catch {
    return null;
  }
}

export type OrigenClave = "propia" | "servidor" | "compartida";

/**
 * Qué clave usar para esta persona: la suya, la del servidor (si se lo
 * permiten) o una que otra persona compartió. null = no hay ninguna.
 */
export async function claveEfectiva(
  deps: Pick<ModuleDeps, "db" | "cipher" | "config">,
  usuario: Pick<AuthUser, "id" | "role"> | null,
  nombre: ClavePersonal,
): Promise<{ valor: string; origen: OrigenClave } | null> {
  const servidor = deps.config.env[nombre];
  if (!usuario) return servidor ? { valor: String(servidor), origen: "servidor" } : null;
  const propia = descifrar(deps, (await misClaves(deps, usuario.id))[nombre]);
  if (propia) return { valor: propia, origen: "propia" };
  const politica = usuario.role === "maestra" ? POLITICA_BASE : await politicaDe(deps, usuario.id);
  if (servidor && politica.usarDelServidor) return { valor: String(servidor), origen: "servidor" };
  const indice = (await getSetting<Partial<Record<ClavePersonal, string[]>>>(deps.db, CLAVE_COMPARTIDAS)) ?? {};
  for (const otro of indice[nombre] ?? []) {
    if (otro === usuario.id) continue;
    const g = (await misClaves(deps, otro))[nombre];
    if (!g?.compartida) continue;
    const valor = descifrar(deps, g);
    if (valor) return { valor, origen: "compartida" };
  }
  return null;
}

async function actualizarIndice(deps: Pick<ModuleDeps, "db" | "now">, nombre: ClavePersonal, userId: string, compartida: boolean): Promise<void> {
  const indice = (await getSetting<Partial<Record<ClavePersonal, string[]>>>(deps.db, CLAVE_COMPARTIDAS)) ?? {};
  const lista = new Set(indice[nombre] ?? []);
  if (compartida) lista.add(userId);
  else lista.delete(userId);
  indice[nombre] = [...lista];
  await setSetting(deps.db, CLAVE_COMPARTIDAS, indice, deps.now());
}

export const AVISO_COMPARTIR =
  "Al compartirla, las demás personas de este Mi Setup que no tengan su propia clave usarán la tuya: el gasto se cobra a tu cuenta del servicio. Nadie puede ver la clave (ni la cuenta maestra) y puedes dejar de compartirla cuando quieras.";

export function clavesUsuarioRoutes(deps: ModuleDeps) {
  const autenticado = { config: { acceso: { autenticado: true as const } } };
  const conPin = { config: { acceso: { autenticado: true as const, reauth: "pin" as const } } };

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/mis-claves", autenticado, async (request) => {
      const user = currentUser(request);
      const mias = await misClaves(deps, user.id);
      const politica = user.role === "maestra" ? POLITICA_BASE : await politicaDe(deps, user.id);
      const claves = [];
      for (const c of CLAVES_PERSONALES) {
        const g = mias[c.nombre];
        const efectiva = await claveEfectiva(deps, user, c.nombre);
        claves.push({
          nombre: c.nombre,
          etiqueta: c.etiqueta,
          ayuda: c.ayuda,
          propia: Boolean(g),
          final: g?.fin ?? null,
          compartida: Boolean(g?.compartida),
          // De dónde sale la clave que se usa ahora (nunca el valor).
          enUso: efectiva?.origen ?? null,
        });
      }
      return { claves, politica, aviso: AVISO_COMPARTIR };
    });

    app.put("/api/mis-claves/:nombre", conPin, async (request) => {
      const user = currentUser(request);
      const { nombre } = z.object({ nombre: z.string() }).parse(request.params);
      if (!NOMBRES.has(nombre)) throw new HttpError(404, "Esa clave no se puede poner aquí");
      const d = z
        .object({
          valor: z.string().trim().min(8, "Pega la clave completa").max(500).optional(),
          compartir: z.boolean().default(false),
          entiendo: z.boolean().optional(),
        })
        .parse(request.body);
      if (d.compartir && d.entiendo !== true) throw new HttpError(400, AVISO_COMPARTIR, "confirmar_compartir");
      const mias = await misClaves(deps, user.id);
      const actual = mias[nombre as ClavePersonal];
      if (!d.valor && !actual) throw new HttpError(400, "Pega tu clave");
      mias[nombre as ClavePersonal] = d.valor
        ? { cifrado: requireCipher(deps).encrypt(d.valor), compartida: d.compartir, fin: d.valor.slice(-4) }
        : { ...actual!, compartida: d.compartir };
      await setSetting(deps.db, claveMias(user.id), mias, deps.now());
      await actualizarIndice(deps, nombre as ClavePersonal, user.id, d.compartir);
      await deps.audit.record({
        actorType: "usuario",
        actorUserId: user.id,
        action: d.compartir ? "clave_propia_compartida" : "clave_propia_guardada",
        module: "ajustes",
        target: nombre,
        outcome: "ok",
        ...clientInfo(request),
      });
      return { ok: true };
    });

    app.delete("/api/mis-claves/:nombre", conPin, async (request) => {
      const user = currentUser(request);
      const { nombre } = z.object({ nombre: z.string() }).parse(request.params);
      if (!NOMBRES.has(nombre)) throw new HttpError(404, "Esa clave no existe");
      const mias = await misClaves(deps, user.id);
      delete mias[nombre as ClavePersonal];
      if (Object.keys(mias).length) await setSetting(deps.db, claveMias(user.id), mias, deps.now());
      else await deleteSetting(deps.db, claveMias(user.id));
      await actualizarIndice(deps, nombre as ClavePersonal, user.id, false);
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "clave_propia_borrada", module: "ajustes", target: nombre, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    // ---- lo que decide la cuenta maestra por persona
    app.get("/api/cuentas/:id/politica-claves", { config: { acceso: { modulo: "cuentas", nivel: "lectura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      return politicaDe(deps, id);
    });

    app.put("/api/cuentas/:id/politica-claves", { config: { acceso: { modulo: "cuentas", nivel: "administrar", reauth: "fuerte" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = z.object({ usarDelServidor: z.boolean(), verServicios: z.boolean() }).parse(request.body);
      await setSetting(deps.db, clavePolitica(id), d, deps.now());
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "politica_claves", module: "cuentas", target: id, outcome: "ok", details: d, ...clientInfo(request) });
      return d;
    });
  };
}
