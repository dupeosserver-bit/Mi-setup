/**
 * Explorador SFTP: ver carpetas, descargar, subir, crear carpetas, renombrar y
 * borrar archivos. En servidores con
 * usuario root se exige reautenticación fuerte.
 */
import { posix } from "node:path";
import { reauthSatisfies } from "@mi-setup/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "../common.js";
import type { Servidores } from "./servidores.js";
import { abrirSftp, citar, ejecutar } from "./ssh.js";

const MAX_SUBIDA = 100 * 1024 * 1024;

const rutaSchema = z.object({
  ruta: z
    .string()
    .max(4096)
    .default("/")
    // Sin la barra final ("/etc/" → "/etc"), para que las carpetas protegidas se reconozcan siempre.
    .transform((r) => posix.normalize(r.startsWith("/") ? r : `/${r}`).replace(/(.)\/+$/, "$1")),
});

export function archivosRoutes(deps: ModuleDeps, servidores: Servidores) {
  const exigirRoot = async (request: FastifyRequest, servidorId: string) => {
    const servidor = await servidores.obtener(servidorId);
    if (servidor.username === "root" && !reauthSatisfies(currentUser(request), "fuerte", deps.now())) {
      throw new HttpError(403, "Servidor root: confirma con contraseña o huella", "reauth_requerida", { metodo: "fuerte" });
    }
  };

  return async function (app: FastifyInstance): Promise<void> {
    app.get(
      "/api/vps/servidores/:id/archivos",
      { config: { acceso: { modulo: "vps_archivos", nivel: "lectura" } } },
      async (request) => {
        const { id } = idParams.parse(request.params);
        const { ruta } = rutaSchema.parse(request.query);
        await exigirRoot(request, id);
        return servidores.usar(id, async (cliente) => {
          const sftp = await abrirSftp(cliente);
          const lista = await new Promise<import("ssh2").FileEntryWithStats[]>((resolve, reject) =>
            sftp.readdir(ruta, (err, l) => (err ? reject(new HttpError(400, `No se pudo leer ${ruta}: ${err.message}`)) : resolve(l))),
          );
          return {
            ruta,
            entradas: lista
              .map((e) => ({
                nombre: e.filename,
                tipo: e.attrs.isDirectory() ? "carpeta" : e.attrs.isSymbolicLink() ? "enlace" : "archivo",
                tamano: e.attrs.size,
                modificado: new Date(e.attrs.mtime * 1000).toISOString(),
                permisos: (e.attrs.mode & 0o777).toString(8).padStart(3, "0"),
              }))
              .sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre) : a.tipo === "carpeta" ? -1 : 1)),
          };
        });
      },
    );

    app.get(
      "/api/vps/servidores/:id/archivos/descargar",
      { config: { acceso: { modulo: "vps_archivos", nivel: "lectura" } } },
      async (request, reply) => {
        const { id } = idParams.parse(request.params);
        const { ruta } = rutaSchema.parse(request.query);
        await exigirRoot(request, id);
        const servidor = await servidores.obtener(id);
        const cliente = await servidores.conectar(servidor);
        const sftp = await abrirSftp(cliente);
        const stat = await new Promise<import("ssh2").Stats>((resolve, reject) =>
          sftp.stat(ruta, (err, s) => (err ? reject(new HttpError(404, "Archivo no encontrado")) : resolve(s))),
        ).catch((err: unknown) => {
          cliente.end();
          throw err;
        });
        if (!stat.isFile()) {
          cliente.end();
          throw new HttpError(400, "Solo se pueden descargar archivos");
        }
        await deps.audit.record({
          actorType: "usuario",
          actorUserId: currentUser(request).id,
          action: "archivo_descargado",
          module: "vps_archivos",
          target: `${servidor.name}:${ruta}`,
          outcome: "ok",
          ...clientInfo(request),
        });
        const flujo = sftp.createReadStream(ruta);
        flujo.on("close", () => cliente.end());
        flujo.on("error", () => cliente.end());
        const nombre = posix.basename(ruta).replace(/[^\w.-]/g, "_");
        return reply
          .header("content-type", "application/octet-stream")
          .header("content-length", String(stat.size))
          .header("content-disposition", `attachment; filename="${nombre}"`)
          .send(flujo);
      },
    );

    app.post(
      "/api/vps/servidores/:id/archivos/subir",
      { config: { acceso: { modulo: "vps_archivos", nivel: "escritura" } } },
      async (request) => {
        const { id } = idParams.parse(request.params);
        const { ruta } = rutaSchema.parse(request.query);
        await exigirRoot(request, id);
        const archivo = await request.file({ limits: { fileSize: MAX_SUBIDA, files: 1 } });
        if (!archivo) throw new HttpError(400, "Falta el archivo");
        const nombre = posix.basename(archivo.filename);
        if (!nombre || nombre === "." || nombre === "..") throw new HttpError(400, "Nombre de archivo inválido");
        const destino = posix.join(ruta, nombre);
        return servidores.usar(id, async (cliente, servidor) => {
          const sftp = await abrirSftp(cliente);
          await new Promise<void>((resolve, reject) => {
            const salida = sftp.createWriteStream(destino);
            salida.on("close", () => resolve());
            salida.on("error", (err: Error) => reject(new HttpError(400, `No se pudo escribir: ${err.message}`)));
            archivo.file.pipe(salida);
          });
          if (archivo.file.truncated) throw new HttpError(413, "El archivo supera 100 MB");
          await deps.audit.record({
            actorType: "usuario",
            actorUserId: currentUser(request).id,
            action: "archivo_subido",
            module: "vps_archivos",
            target: `${servidor.name}:${destino}`,
            outcome: "ok",
            ...clientInfo(request),
          });
          return { ok: true, ruta: destino };
        });
      },
    );

    const registrar = (request: FastifyRequest, action: string, target: string) =>
      deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action, module: "vps_archivos", target, outcome: "ok", ...clientInfo(request) });

    app.post(
      "/api/vps/servidores/:id/archivos/carpeta",
      { config: { acceso: { modulo: "vps_archivos", nivel: "escritura" } } },
      async (request) => {
        const { id } = idParams.parse(request.params);
        const { ruta } = rutaSchema.parse(request.body ?? {});
        await exigirRoot(request, id);
        return servidores.usar(id, async (cliente, servidor) => {
          const sftp = await abrirSftp(cliente);
          await new Promise<void>((resolve, reject) =>
            sftp.mkdir(ruta, (err) => (err ? reject(new HttpError(400, `No se pudo crear la carpeta: ${err.message}`)) : resolve())),
          );
          await registrar(request, "carpeta_creada", `${servidor.name}:${ruta}`);
          return { ok: true, ruta };
        });
      },
    );

    app.post(
      "/api/vps/servidores/:id/archivos/renombrar",
      { config: { acceso: { modulo: "vps_archivos", nivel: "escritura" } } },
      async (request) => {
        const { id } = idParams.parse(request.params);
        const { de, a } = z.object({ de: rutaSchema.shape.ruta, a: rutaSchema.shape.ruta }).parse(request.body);
        if (RUTAS_PROTEGIDAS.has(de)) throw new HttpError(400, "Esa carpeta del sistema no se puede mover");
        await exigirRoot(request, id);
        return servidores.usar(id, async (cliente, servidor) => {
          const sftp = await abrirSftp(cliente);
          await new Promise<void>((resolve, reject) =>
            sftp.rename(de, a, (err) => (err ? reject(new HttpError(400, `No se pudo renombrar: ${err.message}`)) : resolve())),
          );
          await registrar(request, "archivo_renombrado", `${servidor.name}:${de} → ${a}`);
          return { ok: true, ruta: a };
        });
      },
    );

    /**
     * Borrar: un archivo se borra directo; una carpeta (con todo lo de adentro)
     * pide reautenticación fuerte y escribir su nombre. Las carpetas del sistema
     * nunca se pueden borrar.
     */
    app.delete(
      "/api/vps/servidores/:id/archivos",
      { config: { acceso: { modulo: "vps_archivos", nivel: "escritura" } } },
      async (request) => {
        const { id } = idParams.parse(request.params);
        const { ruta } = rutaSchema.parse(request.query);
        const { confirmacion } = z.object({ confirmacion: z.string().max(300).optional() }).parse(request.body ?? {});
        if (RUTAS_PROTEGIDAS.has(ruta)) throw new HttpError(400, "Esa carpeta del sistema no se puede borrar");
        await exigirRoot(request, id);
        return servidores.usar(id, async (cliente, servidor) => {
          const sftp = await abrirSftp(cliente);
          const stat = await new Promise<import("ssh2").Stats>((resolve, reject) =>
            sftp.lstat(ruta, (err, s) => (err ? reject(new HttpError(404, "No existe")) : resolve(s))),
          );
          if (stat.isDirectory()) {
            if (!reauthSatisfies(currentUser(request), "fuerte", deps.now())) {
              throw new HttpError(403, "Borrar una carpeta: confirma con contraseña o huella", "reauth_requerida", { metodo: "fuerte" });
            }
            if (confirmacion !== posix.basename(ruta)) {
              throw new HttpError(400, `Escribe "${posix.basename(ruta)}" para confirmar`, "doble_confirmacion");
            }
            const r = await ejecutar(cliente, `rm -rf -- ${citar(ruta)}`, { timeoutMs: 300_000 });
            if (r.codigo !== 0) throw new HttpError(400, `No se pudo borrar: ${r.error.trim() || `código ${r.codigo}`}`);
          } else {
            await new Promise<void>((resolve, reject) =>
              sftp.unlink(ruta, (err) => (err ? reject(new HttpError(400, `No se pudo borrar: ${err.message}`)) : resolve())),
            );
          }
          await registrar(request, stat.isDirectory() ? "carpeta_borrada" : "archivo_borrado", `${servidor.name}:${ruta}`);
          return { ok: true };
        });
      },
    );
  };
}

/** Carpetas del sistema que nunca se borran ni se mueven desde la app. */
const RUTAS_PROTEGIDAS = new Set(
  ["/", "/root", "/home", "/etc", "/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/boot", "/var", "/opt", "/srv", "/proc", "/sys", "/dev", "/run", "/tmp", "/snap", "/var/lib", "/var/lib/docker", "/var/www", "/opt/mi-setup"],
);
