/**
 * Ajustes → Servicios: claves de API y datos de servicios externos editables
 * desde la app (solo la cuenta maestra, con reautenticación fuerte). Se
 * guardan cifradas con SERVER_ENC_KEY y tienen prioridad sobre el .env; al
 * borrarlas vuelve a usarse el valor del .env. Las claves de arranque
 * (POSTGRES_PASSWORD, JWT_SECRET, SERVER_ENC_KEY) solo van en el .env.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { envBase, type Env } from "../config.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, requireCipher, type ModuleDeps } from "./common.js";
import { deleteSetting, getSetting, setSetting } from "./settings.js";
import { politicaDe } from "./claves-usuario.js";

export interface DefClave {
  readonly nombre: keyof Env & string;
  readonly etiqueta: string;
  readonly grupo: string;
  readonly secreto: boolean;
  readonly ayuda: string;
  /** Si el cambio solo se aplica al reiniciar el servidor. */
  readonly reinicio?: boolean;
}

export const CLAVES: readonly DefClave[] = [
  { nombre: "ANTHROPIC_API_KEY", etiqueta: "Clave de API de Claude", grupo: "IA", secreto: true, ayuda: "console.anthropic.com → API Keys → Create Key." },
  { nombre: "AI_MODEL", etiqueta: "Modelo por defecto", grupo: "IA", secreto: false, ayuda: "Ej. claude-sonnet-5-5. Cada usuario puede elegir otro en Ajustes → Voz e IA." },
  { nombre: "AI_MONTHLY_BUDGET_USD", etiqueta: "Tope mensual (USD)", grupo: "IA", secreto: false, ayuda: "Al llegar a este gasto la IA se bloquea hasta el mes siguiente." },
  { nombre: "OLLAMA_URL", etiqueta: "IA gratis local (Ollama)", grupo: "IA", secreto: false, ayuda: "Con el servicio ollama del docker-compose: http://misetup-ollama:11434. Se usa al elegir \"Llama local\" o al llegar al tope." },
  { nombre: "OLLAMA_MODEL", etiqueta: "Modelo local", grupo: "IA", secreto: false, ayuda: "Ej. llama3.2:3b (ligero, ~3 GB de RAM) o qwen2.5:7b (mejor, ~6 GB). Descárgalo con: docker exec misetup-ollama ollama pull llama3.2:3b" },
  { nombre: "PTERO_URL", etiqueta: "URL del panel", grupo: "Pterodactyl", secreto: false, ayuda: "Ej. https://panel.mexicanland.org", reinicio: true },
  { nombre: "PTERO_CLIENT_KEY", etiqueta: "Clave de cliente (ptlc_…)", grupo: "Pterodactyl", secreto: true, ayuda: "Panel → tu cuenta → API Credentials." },
  { nombre: "PTERO_APP_KEY", etiqueta: "Clave de aplicación (ptla_…)", grupo: "Pterodactyl", secreto: true, ayuda: "Panel de administración → Application API." },
  { nombre: "DISCORD_BOT_TOKEN", etiqueta: "Token del bot", grupo: "Discord", secreto: true, ayuda: "discord.com/developers → tu app → Bot → Reset Token." },
  { nombre: "X_CLIENT_ID", etiqueta: "Client ID", grupo: "X (Twitter)", secreto: false, ayuda: "developer.x.com → tu proyecto → Keys and tokens → OAuth 2.0." },
  { nombre: "X_CLIENT_SECRET", etiqueta: "Client Secret", grupo: "X (Twitter)", secreto: true, ayuda: "Mismo lugar que el Client ID." },
  { nombre: "X_BEARER_TOKEN", etiqueta: "Bearer token (opcional)", grupo: "X (Twitter)", secreto: true, ayuda: "Reservado; se usa la cuenta conectada." },
  { nombre: "X_COSTO_PUBLICAR_USD", etiqueta: "Costo estimado por publicación", grupo: "X (Twitter)", secreto: false, ayuda: "Revisa tu tarifa en developer.x.com." },
  { nombre: "X_COSTO_LECTURA_USD", etiqueta: "Costo estimado por mención leída", grupo: "X (Twitter)", secreto: false, ayuda: "Revisa tu tarifa en developer.x.com." },
  { nombre: "TWITCH_CLIENT_ID", etiqueta: "Client ID", grupo: "Twitch", secreto: false, ayuda: "dev.twitch.tv → Your Console → Applications." },
  { nombre: "TWITCH_CLIENT_SECRET", etiqueta: "Client Secret", grupo: "Twitch", secreto: true, ayuda: "Mismo lugar (New Secret)." },
  { nombre: "GOOGLE_CLIENT_ID", etiqueta: "Client ID", grupo: "YouTube", secreto: false, ayuda: "console.cloud.google.com → Credenciales → ID de cliente OAuth (web)." },
  { nombre: "GOOGLE_CLIENT_SECRET", etiqueta: "Client Secret", grupo: "YouTube", secreto: true, ayuda: "Mismo lugar." },
  { nombre: "KICK_CLIENT_ID", etiqueta: "Client ID", grupo: "Kick", secreto: false, ayuda: "kick.com → Settings → Developer." },
  { nombre: "KICK_CLIENT_SECRET", etiqueta: "Client Secret", grupo: "Kick", secreto: true, ayuda: "Mismo lugar." },
  { nombre: "TMDB_API_KEY", etiqueta: "Clave de TMDB", grupo: "Películas y series", secreto: true, ayuda: "Gratis: themoviedb.org → crea tu cuenta → Ajustes → API → Solicitar clave (tipo Developer). Copia la \"Clave de la API\"." },
  { nombre: "GEMINI_API_KEY", etiqueta: "Clave de Gemini", grupo: "IA creativa (Nano Banana)", secreto: true, ayuda: "aistudio.google.com → Get API key → Create API key. Sirve para crear y editar imágenes." },
  { nombre: "CLOUDFLARE_API_TOKEN", etiqueta: "Token de Cloudflare", grupo: "Cloudflare (subdominios)", secreto: true, ayuda: "dash.cloudflare.com → tu perfil → API Tokens → Create Token → plantilla «Edit zone DNS» → elige tu dominio. Con él, Mi Setup crea solo los registros DNS de tus sitios." },
  { nombre: "TIKTOK_CLIENT_KEY", etiqueta: "Client key", grupo: "TikTok (clips)", secreto: false, ayuda: "developers.tiktok.com → Manage apps → Connect app → agrega «Login Kit» y «Content Posting API». Redirect URI: https://TU-DOMINIO/api/redes/oauth/tiktok/callback. Mientras TikTok no apruebe tu app, los videos se publican solo como privados." },
  { nombre: "TIKTOK_CLIENT_SECRET", etiqueta: "Client secret", grupo: "TikTok (clips)", secreto: true, ayuda: "Mismo lugar que la Client key." },
  { nombre: "CURSEFORGE_API_KEY", etiqueta: "Clave de CurseForge", grupo: "Host local (mods)", secreto: true, ayuda: "console.curseforge.com → API keys (gratis, la aprueban en unos días). Sin ella, los mods se buscan en Modrinth." },
  { nombre: "BANXICO_TOKEN", etiqueta: "Token del SIE de Banxico", grupo: "Mis finanzas (rendimientos)", secreto: true, ayuda: "Gratis: banxico.org.mx/SieAPIRest/service/v1/token → escribe tu correo y copia el token. Con él, Rendimientos trae la tasa de CETES de cada día." },
  { nombre: "MERCADOLIBRE_CLIENT_ID", etiqueta: "App ID", grupo: "Mercado Libre", secreto: false, ayuda: "developers.mercadolibre.com.mx → Mis aplicaciones → Crear aplicación (gratis). Copia el App ID." },
  { nombre: "MERCADOLIBRE_CLIENT_SECRET", etiqueta: "Clave secreta", grupo: "Mercado Libre", secreto: true, ayuda: "Misma aplicación → Clave secreta." },
  { nombre: "SPOTIFY_CLIENT_ID", etiqueta: "Client ID", grupo: "Spotify", secreto: false, ayuda: "developer.spotify.com → Dashboard → Create app. Redirect URI: https://TU-DOMINIO/api/musica/spotify/callback" },
  { nombre: "SPOTIFY_CLIENT_SECRET", etiqueta: "Client Secret", grupo: "Spotify", secreto: true, ayuda: "Mismo lugar (Settings → View client secret)." },
  { nombre: "MAIL_INBOUND_SECRET", etiqueta: "Secreto del Email Worker", grupo: "Correos temporales", secreto: true, ayuda: "El mismo valor que pusiste en el Worker de Cloudflare (openssl rand -hex 32)." },
  { nombre: "NTFY_TOPIC", etiqueta: "Tema de ntfy", grupo: "Notificaciones", secreto: true, ayuda: "Tema largo y aleatorio; el mismo en la app ntfy del celular." },
  { nombre: "RD_HOST", etiqueta: "Servidor RustDesk", grupo: "Control remoto", secreto: false, ayuda: "Ej. rd.mexicanland.net" },
  { nombre: "RD_PUBLIC_KEY", etiqueta: "Clave pública de RustDesk", grupo: "Control remoto", secreto: false, ayuda: "Contenido de id_ed25519.pub de hbbs." },
];

const clave = (nombre: string) => `clave:${nombre}`;
const POR_NOMBRE = new Map(CLAVES.map((c) => [c.nombre, c]));

/** Valores originales del .env (para volver a ellos al borrar una clave). */
let originales: Partial<Env> | null = null;

function escribirEnv(deps: ModuleDeps, nombre: keyof Env, valor: unknown): void {
  (deps.config.env as Record<string, unknown>)[nombre] = valor;
}

/** Al arrancar: aplica las claves guardadas en la base sobre la configuración. */
export async function aplicarClavesGuardadas(deps: ModuleDeps): Promise<void> {
  originales ??= Object.fromEntries(CLAVES.map((c) => [c.nombre, deps.config.env[c.nombre]])) as Partial<Env>;
  if (!deps.cipher) return;
  for (const c of CLAVES) {
    const guardado = await getSetting<{ cifrado: string }>(deps.db, clave(c.nombre));
    if (!guardado?.cifrado) continue;
    try {
      const texto = deps.cipher.decrypt(guardado.cifrado);
      escribirEnv(deps, c.nombre, envBase.shape[c.nombre].parse(texto));
    } catch {
      /* clave corrupta o cifrada con otra SERVER_ENC_KEY: se ignora y queda la del .env */
    }
  }
}

function enmascarar(valor: string): string {
  return valor.length <= 8 ? "••••" : `••••${valor.slice(-4)}`;
}

export function clavesRoutes(deps: ModuleDeps) {
  const soloMaestra = (request: Parameters<typeof currentUser>[0]) => {
    const user = currentUser(request);
    if (user.role !== "maestra") throw new HttpError(403, "Solo la cuenta maestra configura los servicios", "sin_permiso");
    return user;
  };

  return async function (app: FastifyInstance): Promise<void> {
    // Verlas (enmascaradas): la cuenta maestra o quien tenga permiso «ver servicios» en Cuentas y permisos.
    app.get("/api/claves", { config: { acceso: { autenticado: true } } }, async (request) => {
      const yo = currentUser(request);
      const soloLectura = yo.role !== "maestra";
      if (soloLectura && !(await politicaDe(deps, yo.id)).verServicios) throw new HttpError(403, "Sin permiso para ver los servicios", "sin_permiso");
      const resultado = [];
      for (const c of CLAVES) {
        const enBase = Boolean((await getSetting<{ cifrado: string }>(deps.db, clave(c.nombre)))?.cifrado);
        const actual = deps.config.env[c.nombre];
        const texto = actual === undefined || actual === null ? "" : String(actual);
        resultado.push({
          nombre: c.nombre,
          etiqueta: c.etiqueta,
          grupo: c.grupo,
          secreto: c.secreto,
          ayuda: c.ayuda,
          reinicio: Boolean(c.reinicio),
          configurada: texto !== "",
          origen: enBase ? "ajustes" : texto !== "" ? "env" : null,
          // Los secretos nunca se devuelven: solo los últimos 4 caracteres (y nada a quien solo puede ver).
          valor: c.secreto ? (texto && !soloLectura ? enmascarar(texto) : "") : texto,
          soloLectura,
        });
      }
      return resultado;
    });

    app.put("/api/claves/:nombre", { config: { acceso: { modulo: "ajustes", nivel: "administrar", reauth: "fuerte" } } }, async (request) => {
      const user = soloMaestra(request);
      const { nombre } = z.object({ nombre: z.string() }).parse(request.params);
      const def = POR_NOMBRE.get(nombre as keyof Env & string);
      if (!def) throw new HttpError(404, "Esa variable no se puede editar desde la app");
      const { valor } = z.object({ valor: z.string().trim().min(1, "Escribe un valor").max(4000) }).parse(request.body);
      const parseado = envBase.shape[def.nombre].safeParse(valor);
      if (!parseado.success) throw new HttpError(400, `Valor inválido para ${def.etiqueta}: ${parseado.error.issues[0]?.message ?? "revisa el formato"}`);
      originales ??= Object.fromEntries(CLAVES.map((c) => [c.nombre, deps.config.env[c.nombre]])) as Partial<Env>;
      await setSetting(deps.db, clave(def.nombre), { cifrado: requireCipher(deps).encrypt(valor) }, deps.now());
      escribirEnv(deps, def.nombre, parseado.data);
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "clave_configurada", module: "ajustes", target: def.nombre, outcome: "ok", ...clientInfo(request) });
      return { ok: true, reinicio: Boolean(def.reinicio) };
    });

    app.delete("/api/claves/:nombre", { config: { acceso: { modulo: "ajustes", nivel: "administrar", reauth: "fuerte" } } }, async (request) => {
      const user = soloMaestra(request);
      const { nombre } = z.object({ nombre: z.string() }).parse(request.params);
      const def = POR_NOMBRE.get(nombre as keyof Env & string);
      if (!def) throw new HttpError(404, "Esa variable no se puede editar desde la app");
      await deleteSetting(deps.db, clave(def.nombre));
      escribirEnv(deps, def.nombre, originales?.[def.nombre]);
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "clave_borrada", module: "ajustes", target: def.nombre, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });
  };
}
