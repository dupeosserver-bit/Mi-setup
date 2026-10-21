/**
 * Mis finanzas → Rendimientos: tasa de hoy de cada opción para invertir.
 * - CETES: SIE de Banxico (fuente oficial; necesita BANXICO_TOKEN, gratis).
 * - Bancos y apps: se intenta leer el % de su página oficial. Muchas páginas
 *   se arman con JavaScript y no se pueden leer: entonces se queda el último
 *   dato conocido con su fecha y se avisa que no se pudo actualizar.
 * Se actualiza solo una vez al día. Cada cuenta puede corregir una tasa a mano.
 */
import { PRODUCTOS_RENDIMIENTO, tasaEnTexto, type TasaVigente } from "@mi-setup/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import type { ModuleDeps } from "./common.js";
import { descargarTextoSeguro } from "./red-segura.js";
import { pedirJson } from "./redes/oauth.js";
import { getSetting, setSetting } from "./settings.js";

const CLAVE = "rendimientos:tasas";
const DIA = 24 * 60 * 60_000;

interface Leida {
  tasa: number;
  fecha: string;
  fuente: string;
}
interface Guardado {
  actualizado: string;
  leidas: Record<string, Leida>;
  errores: Record<string, string>;
  tasaObjetivo?: Leida;
}

interface RespuestaSie {
  bmx: { series: { idSerie: string; datos?: { fecha: string; dato: string }[] }[] };
}

/** "21/10/2026" → "2026-10-21" */
export function fechaSie(f: string): string {
  const [d, m, a] = f.split("/");
  return `${a}-${m}-${d}`;
}

/** Lee las series del SIE (último dato de cada una). */
export function interpretarSie(r: RespuestaSie): Map<string, { tasa: number; fecha: string }> {
  const mapa = new Map<string, { tasa: number; fecha: string }>();
  for (const s of r.bmx?.series ?? []) {
    const d = s.datos?.at(-1);
    const n = d ? Number(d.dato.replace(",", "")) : Number.NaN;
    if (d && Number.isFinite(n)) mapa.set(s.idSerie, { tasa: n, fecha: fechaSie(d.fecha) });
  }
  return mapa;
}

export async function actualizarTasas(deps: ModuleDeps, forzar = false): Promise<Guardado> {
  const previo = (await getSetting<Guardado>(deps.db, CLAVE)) ?? { actualizado: "", leidas: {}, errores: {} };
  if (!forzar && previo.actualizado && deps.now().getTime() - new Date(previo.actualizado).getTime() < 20 * 60 * 60_000) return previo;
  const nuevo: Guardado = { actualizado: deps.now().toISOString(), leidas: { ...previo.leidas }, errores: {}, ...(previo.tasaObjetivo ? { tasaObjetivo: previo.tasaObjetivo } : {}) };

  // CETES y tasa objetivo: Banxico.
  const token = deps.config.env.BANXICO_TOKEN;
  const series = PRODUCTOS_RENDIMIENTO.filter((p) => p.serieBanxico);
  if (token) {
    try {
      const ids = [...series.map((p) => p.serieBanxico!), "SF61745"].join(",");
      const r = await pedirJson<RespuestaSie>("Banxico", `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${ids}/datos/oportuno`, { headers: { "Bmx-Token": token, accept: "application/json" } });
      const datos = interpretarSie(r);
      for (const p of series) {
        const d = datos.get(p.serieBanxico!);
        if (d) nuevo.leidas[p.id] = { ...d, fuente: "Banxico (SIE)" };
        else nuevo.errores[p.id] = "Banxico no mandó el dato";
      }
      const objetivo = datos.get("SF61745");
      if (objetivo) nuevo.tasaObjetivo = { ...objetivo, fuente: "Banxico (SIE)" };
    } catch (err) {
      for (const p of series) nuevo.errores[p.id] = `Banxico no respondió: ${err instanceof Error ? err.message.slice(0, 120) : "error"}`;
    }
  } else {
    for (const p of series) nuevo.errores[p.id] = "Falta BANXICO_TOKEN (gratis) en Ajustes → Servicios y claves";
  }

  // Bancos y apps: página oficial, solo si sabemos dónde está el % en la página.
  const paginas = new Map<string, Promise<string>>();
  for (const p of PRODUCTOS_RENDIMIENTO) {
    if (p.serieBanxico) continue;
    if (!p.patron) {
      nuevo.errores[p.id] = "Su página no publica la tasa en un formato que se pueda leer solo";
      continue;
    }
    try {
      if (!paginas.has(p.url)) paginas.set(p.url, descargarTextoSeguro(p.url));
      const tasa = tasaEnTexto(await paginas.get(p.url)!, p.patron);
      if (tasa === null) throw new Error("no se encontró el % en la página");
      nuevo.leidas[p.id] = { tasa, fecha: nuevo.actualizado.slice(0, 10), fuente: "Página oficial" };
    } catch (err) {
      nuevo.errores[p.id] = `No se pudo leer su página oficial (${err instanceof Error ? err.message.slice(0, 100) : "error"})`;
    }
  }
  await setSetting(deps.db, CLAVE, nuevo, deps.now());
  return nuevo;
}

/** Tasa a usar: la que escribiste > la leída > la de referencia. */
export function tasasVigentes(guardado: Guardado | null, manuales: Record<string, number>, hoy: string): TasaVigente[] {
  return PRODUCTOS_RENDIMIENTO.map((p) => {
    const error = guardado?.errores[p.id];
    if (manuales[p.id] !== undefined) return { id: p.id, tasa: manuales[p.id]!, fecha: null, fuente: "La escribiste tú", estado: "manual" as const };
    const leida = guardado?.leidas[p.id];
    const ref = p.referencia;
    // La más nueva entre lo leído y la referencia.
    const usar = leida && (!ref || leida.fecha >= ref.fecha) ? leida : ref;
    if (!usar) return { id: p.id, tasa: null, fecha: null, fuente: "", estado: "sin-dato" as const, aviso: error ?? "Sin dato todavía" };
    const deHoy = usar === leida && leida.fecha === hoy;
    const vieja = Date.parse(hoy) - Date.parse(usar.fecha) > 7 * DIA;
    return {
      id: p.id,
      tasa: usar.tasa,
      fecha: usar.fecha,
      fuente: usar.fuente,
      estado: usar === leida ? ("actualizada" as const) : ("referencia" as const),
      ...(!deHoy && (error || vieja) ? { aviso: `No se pudo actualizar hoy${error ? `: ${error}` : ""}. Es el dato del ${usar.fecha}; confírmalo en su app.` } : {}),
    };
  });
}

export function rendimientosRoutes(deps: ModuleDeps) {
  const leer = { config: { acceso: { modulo: "finanzas_personales" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "finanzas_personales" as const, nivel: "escritura" as const } } };
  const manualesDe = async (userId: string) => (await getSetting<Record<string, number>>(deps.db, `rendimientos-manual:${userId}`)) ?? {};

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/rendimientos", leer, async (request) => {
      const user = currentUser(request);
      const guardado = await getSetting<Guardado>(deps.db, CLAVE);
      return {
        actualizado: guardado?.actualizado ?? null,
        banxico: Boolean(deps.config.env.BANXICO_TOKEN),
        tasaObjetivo: guardado?.tasaObjetivo ?? null,
        productos: PRODUCTOS_RENDIMIENTO,
        tasas: tasasVigentes(guardado, await manualesDe(user.id), deps.now().toISOString().slice(0, 10)),
      };
    });

    app.post("/api/rendimientos/actualizar", escribir, async () => {
      const previo = await getSetting<Guardado>(deps.db, CLAVE);
      // Una vez cada 10 minutos como máximo, para no abusar de las fuentes.
      if (previo?.actualizado && deps.now().getTime() - new Date(previo.actualizado).getTime() < 10 * 60_000) return { actualizado: previo.actualizado, omitido: true };
      const r = await actualizarTasas(deps, true);
      return { actualizado: r.actualizado, omitido: false };
    });

    app.put("/api/rendimientos/manual/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = z.object({ id: z.string().max(40) }).parse(request.params);
      if (!PRODUCTOS_RENDIMIENTO.some((p) => p.id === id)) throw new HttpError(404, "Esa opción no existe");
      const { tasa } = z.object({ tasa: z.number().min(0).max(100).nullable() }).parse(request.body);
      const manuales = await manualesDe(user.id);
      if (tasa === null) delete manuales[id];
      else manuales[id] = tasa;
      await setSetting(deps.db, `rendimientos-manual:${user.id}`, manuales, deps.now());
      return { ok: true };
    });
  };
}
