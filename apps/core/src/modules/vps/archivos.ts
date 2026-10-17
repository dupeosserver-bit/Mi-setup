/**
 * Explorador SFTP: ver carpetas, descargar y subir archivos. En servidores con
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
import { abrirSftp } from "./ssh.js";

const MAX_SUBIDA = 100 * 1024 * 1024;

const rutaSchema = z.object({
  ruta: z
    .string()
    .max(4096)
    .default("/")
    .transform((r) => posix.normalize(r.startsWith("/") ? r : `/${r}`)),
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
  };
}
