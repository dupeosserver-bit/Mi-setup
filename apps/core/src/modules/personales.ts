/**
 * Apartados que solo trae la edición personal: Pterodactyl, Redes y streams
 * (X, Discord, streams, clips, bots), Servidores en mi PC, Mi casa y Control
 * remoto. app.ts carga este archivo solo si EDICION no es "publica"; la imagen
 * pública borra este archivo y los módulos que importa (scripts/edicion-publica.mjs).
 */
import type { FastifyInstance } from "fastify";
import type { Job } from "../jobs.js";
import type { ClienteIa } from "./ia/servicio.js";
import type { ModuleDeps } from "./common.js";
import type { Servidores } from "./vps/servidores.js";
import { botsDiscordModule, type FabricaMotor, type ValidarToken } from "./bots-discord/index.js";
import { casaRoutes } from "./casa.js";
import { clipsRoutes, limpiarFuentes } from "./clips.js";
import { controlRemotoRoutes } from "./control-remoto.js";
import { hostLocalRoutes } from "./hostlocal.js";
import { pteroAdminRoutes } from "./ptero-admin.js";
import { pteroRoutes } from "./ptero.js";
import { redesModule } from "./redes/index.js";
import { botsRoutes } from "./vps/bots.js";

export async function registrarPersonales(
  app: FastifyInstance,
  deps: ModuleDeps,
  jobs: Job[],
  opciones: { servidores: Servidores; clienteIa?: ClienteIa; fabricaBots?: FabricaMotor; validarTokenBot?: ValidarToken },
) {
  await app.register(hostLocalRoutes(deps));
  await app.register(casaRoutes(deps));
  await app.register(clipsRoutes(deps, opciones.clienteIa));
  jobs.push({ nombre: "limpiar-clips", cadaMs: 6 * 60 * 60_000, alInicio: false, run: () => limpiarFuentes(deps) });
  const bots = botsDiscordModule(deps, { ...(opciones.fabricaBots ? { fabrica: opciones.fabricaBots } : {}), ...(opciones.validarTokenBot ? { validarToken: opciones.validarTokenBot } : {}) });
  await app.register(bots.routes);
  app.addHook("onClose", async () => bots.gestor.detenerTodos());
  jobs.push(
    { nombre: "bots-encender", cadaMs: 24 * 60 * 60_000, alInicio: true, run: () => bots.gestor.encenderPendientes() },
    { nombre: "bots-vencimiento", cadaMs: 5 * 60_000, alInicio: true, run: async () => void (await bots.gestor.apagarVencidos()) },
  );
  await app.register(botsRoutes(deps, opciones.servidores));
  const ptero = pteroRoutes(deps);
  await app.register(ptero.routes);
  await app.register(pteroAdminRoutes(deps, ptero.ptero, opciones.servidores));
  const redes = redesModule(deps);
  await app.register(redes.routes);
  await app.register(controlRemotoRoutes(deps));
  return { ptero: ptero.ptero, herramientas: redes.herramientas, contextos: [redes.contexto], gestorBots: bots.gestor };
}
