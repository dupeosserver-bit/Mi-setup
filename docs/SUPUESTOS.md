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

## Plan 2 — Autenticación y seguridad

| # | Decisión | Motivo | Cómo cambiarla |
|---|---|---|---|
| 20 | La cuenta maestra se crea solo con el comando `crear-maestra` (consola del servidor), nunca por HTTP. | Sin registro público; no existe una pantalla de alta que se pueda atacar. | `apps/core/src/cli/crear-maestra.ts`. |
| 21 | El código 2FA va en la misma petición de login (campo `totp`). Si falta o es incorrecto, el error es el mismo que una contraseña incorrecta. | No revela si la contraseña era correcta. La UI muestra siempre el campo "Código 2FA". | `AuthService.login`. |
| 22 | Para cuentas que no son la maestra, el TOTP es opcional (si la cuenta lo tiene, se exige). | El prompt lo exige solo para la maestra. La gestión de cuentas llega en la fase 11. | `AuthService.login`. |
| 23 | Un código TOTP solo se acepta una vez (se guarda el último paso usado) y se aceptan ±30 s de desfase. | Evita reutilizar un código visto por alguien. | `verifyTotp` y `users.totp_last_step`. |
| 24 | Bloqueo: 5 fallos por correo o 20 por IP en 15 min → 429 hasta que se libere la ventana. Los intentos bloqueados no cuentan como fallos nuevos. | Frena la fuerza bruta sin bloquear al dueño para siempre. | `LOCKOUT` en `apps/core/src/auth/service.ts`. |
| 25 | Avisos push por ntfy en cada login fallido, bloqueo, posible robo de sesión y cierre por fallos de reautenticación. | Lo pide el prompt; ntfy llega a todos los dispositivos suscritos. | `AuthService` + `notify/notifier.ts`. |
| 26 | accessToken JWT HS256 de 15 min; refresh token de 30 días, opaco (`idSesión.secreto`), rotado en cada uso. Reutilizar uno viejo revoca la sesión. | Tokens cortos + detección de robo. | `auth/tokens.ts`. |
| 27 | El access token va en la cabecera `Authorization: Bearer`. No se usan cookies. | Funciona igual en web, Electron y Capacitor sin CSRF. | `security/rbac.ts`. |
| 28 | Un login correcto (contraseña + 2FA) cuenta como reautenticación fuerte durante 5 min. | Acabas de demostrar tu identidad. | `AuthService.login` (`reauthAt`). |
| 29 | Reautenticación: "fuerte" = contraseña o biometría; "pin" = cualquier método. La biometría (Android) llega en la fase 4. | Lo exige el prompt para bóveda, root y control remoto. | `REAUTH_*` en `packages/shared/src/auth.ts`. |
| 30 | PIN de 6 a 12 dígitos, guardado con Argon2id. Para configurarlo hace falta reautenticación fuerte. 5 fallos seguidos de reautenticación cierran la sesión. | Un PIN corto necesita un límite de intentos estricto. | `AuthService.reauth` / `setPin`. |
| 31 | Toda ruta `/api` debe declarar `config.acceso`; si falta, core no arranca. | Ninguna ruta queda sin permisos por olvido. | `registerAccessGuard` en `security/rbac.ts`. |
| 32 | Argon2id con `@node-rs/argon2` (19 MiB, 2 iteraciones, 1 hilo: mínimo de OWASP). | Binario precompilado, también para Alpine. | `auth/password.ts`. |
| 33 | El secreto TOTP se cifra con AES-256-GCM; la clave sale de `SERVER_ENC_KEY` mediante HKDF-SHA256. `JWT_SECRET` y `SERVER_ENC_KEY` deben tener ≥ 32 caracteres. | Funciona con cualquier formato de clave que genere el script. | `security/crypto.ts`, `config.ts`. |
| 34 | Nueva variable `NTFY_URL` (por defecto `https://NTFY_HOST`; en Docker `http://ntfy` por la red interna). | Publicar sin salir a internet. | `.env.example`, `docker-compose.yml`. |
| 35 | Las pruebas usan PGlite (Postgres 17 embebido) con las mismas migraciones. | Pruebas reales de SQL sin Docker. | `apps/core/test/helpers.ts`. |
| 36 | Cada día se borran los intentos de login y las sesiones vencidas o revocadas con más de 30 días. La auditoría no se borra nunca. | Que esas tablas no crezcan sin límite. | `AuthService.purge`. |
