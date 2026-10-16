# Supuestos y decisiones

Decisiones tomadas sin preguntar, con su motivo y cómo cambiarlas.

## Plan 1 — Cimientos

| # | Decisión | Motivo | Cómo cambiarla |
|---|---|---|---|
| 1 | pnpm fijado en `9.15.9` (`packageManager`). Node 22 en Docker; en local, Node ≥ 22. | Versión estable con `pnpm deploy` sin configuración extra. | Cambiar `packageManager` en `package.json` y `deploy/Dockerfile`. |
| 2 | `@mi-setup/shared` exporta `src/` con la condición `development` y `dist/` por defecto. | `pnpm dev`, typecheck y pruebas funcionan sin compilar shared; producción usa JS compilado. | `exports` en `packages/shared/package.json` y `customConditions` en `tsconfig.base.json`. |
| 3 | La columna `module` de permisos es texto (no enum de Postgres), validada con Zod. | Agregar módulos nuevos no requiere migración. | Cambiar a `pgEnum` en `apps/core/src/db/schema.ts`. |
| 4 | Niveles de permiso acumulativos: `ninguno < lectura < escritura < administrar`. `ninguno` = sin fila (denegar por defecto). | Modelo simple y seguro. | `PERMISSION_LEVELS` en `packages/shared/src/permissions.ts`. |
| 5 | Módulos solo-maestra (no delegables): bóveda, autenticador 2FA, terminal, rendimiento, comandos y archivos del VPS, auditoría, cuentas y control remoto. | El prompt pide bóveda, 2FA y accesos al VPS solo para la maestra; auditoría, cuentas y control remoto se suman por seguridad. | `masterOnly` en `packages/shared/src/modules.ts`. |
| 6 | Solo puede existir una cuenta maestra (índice único parcial). | Uso personal: un único dueño. | Quitar `users_una_maestra` del esquema y generar migración. |
| 7 | Auditoría inmutable mediante triggers que rechazan UPDATE/DELETE/TRUNCATE. Las cuentas con historial se desactivan, no se borran (FK sin `ON DELETE`). | "Inmutable desde la app" y además desde SQL. | Migración `0001_auditoria_inmutable.sql`. |
| 8 | En desarrollo `core` arranca aunque no haya base de datos (avisa en el log); en producción termina con error. | Poder correr `pnpm dev` sin Docker. | `apps/core/src/index.ts`. |
| 9 | En producción son obligatorias `POSTGRES_PASSWORD`, `JWT_SECRET` y `SERVER_ENC_KEY`. | Nunca arrancar con secretos vacíos. | `apps/core/src/config.ts`. |
| 10 | ntfy protegido por **tema secreto** (`NTFY_TOPIC`), sin cuentas, interfaz web desactivada, caché 24 h. | Es lo que define el prompt y es lo más simple para Android. | Para más seguridad: `NTFY_AUTH_DEFAULT_ACCESS=deny-all` + token de acceso en `docker-compose.yml`. |
| 11 | Dos redes Docker: `datos` (interna, sin salida: Postgres + core) y `web` (Caddy, core, ntfy). | Postgres nunca alcanzable desde fuera; core sí necesita salir a APIs externas. | `networks` en `docker-compose.yml`. |
| 12 | CORS cerrado: solo `https://APP_HOST`; en desarrollo también `http://localhost:5173`. Los orígenes de Electron/Capacitor se añaden en la fase 4. | CORS cerrado. | `loadConfig` en `apps/core/src/config.ts`. |
| 13 | Nombres concretos para las familias `X_*`, `TWITCH_*`, `GOOGLE_*`, `KICK_*`: `*_CLIENT_ID`, `*_CLIENT_SECRET` y `X_BEARER_TOKEN`. | El contrato solo da prefijos. | `.env.example` y `docker-compose.yml`. |
| 14 | `docker-compose.dev.yml` levanta Postgres solo en `127.0.0.1:5432` para desarrollo. No lo carga el despliegue. | Desarrollo local sin exponer la base. | Borrar el archivo si no se usa. |
| 15 | Imágenes: `postgres:16-alpine`, `caddy:2-alpine`, `binwiederhier/ntfy:v2.11.0`, `node:22-alpine`. | Versiones estables y ligeras. | `docker-compose.yml` y `deploy/Dockerfile`. |
| 16 | `trustProxy: true` en Fastify. | `core` solo es accesible a través de Caddy en la red interna; así se registra la IP real. | `apps/core/src/app.ts`. |
| 17 | `core` servirá la UI compilada a partir de la fase 3. | La UI aún no existe. | — |
| 18 | La integración con `/usr/local/sbin/mi-setup-wg` (VPN) se decide e implementa en la fase 8. | Fuera del alcance del Plan 1. | — |
| 19 | El commit usa la identidad git ya configurada en esta PC. | No se cambia la configuración del usuario. | `git config user.name` / `user.email`. |
