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

## Plan 3 — Interfaz base

| # | Decisión | Motivo | Cómo cambiarla |
|---|---|---|---|
| 37 | `core` sirve la UI compilada (en Docker, `/app/public`); cualquier GET fuera de `/api` devuelve `index.html`. | Un solo dominio, sin CORS ni otro servidor. | `static-ui.ts`, `UI_DIR`. |
| 38 | Fuentes Inter y Montserrat empaquetadas (`@fontsource`), no desde Google Fonts. | Privacidad y CSP estricta. | `apps/ui/src/main.tsx`. |
| 39 | CSP: solo recursos propios, `wasm-unsafe-eval` (cifrado de la bóveda) y `frame-src` del panel Pterodactyl. | Mínimo necesario. | `app.ts` (helmet). |
| 40 | En PC, por debajo de 1280 px las categorías se agrupan en un menú "Apartados"; desde 1280 px cada categoría es su propio menú. | Que la barra superior no se parta en pantallas medianas. | `Layout.tsx`. |
| 41 | La sincronización entre dispositivos usa el tema `usuario:<id>` del WebSocket: el servidor avisa qué recurso cambió y la UI lo vuelve a pedir. | Simple y sin duplicar datos. | `modules/common.ts` (`sync`). |
| 42 | Las imágenes subidas se sirven en `/uploads/<tipo>-<uuid>.<ext>` sin sesión (nombre imposible de adivinar), con CSP `sandbox`. Logo y fondo también se exponen en `/api/apariencia/publica` para la pantalla de login. | Las etiquetas `<img>` no envían el token; el login necesita el logo. | `apariencia.ts`, `static-ui.ts`. |
| 43 | SVG "saneado" = se rechaza cualquier SVG con scripts, eventos `on*`, `foreignObject`, enlaces externos o entidades. | Es más seguro rechazar que intentar limpiar. | `validarImagen` en `apariencia.ts`. |
| 44 | El refresh token y el usuario se guardan en `localStorage`; el access token solo en memoria. | Funciona igual en web, Electron y Capacitor. | `apps/ui/src/lib/sesion.ts`. |
| 45 | Modo de desarrollo `DB_EMBEBIDA=1`: Postgres embebido (PGlite) en `.data/pglite`, prohibido en producción. | Poder usar `pnpm dev` completo sin Docker. | `db/open.ts`, `config.ts`. |
| 46 | El "+" flotante del celular ofrece crear nota, recordatorio o mensaje. | Acciones rápidas más comunes. | `BotonMas` en `Layout.tsx`. |
| 47 | Los navegadores web también se registran como equipo (`web`), además de PC y celular. | Ver desde dónde hay sesiones abiertas. | `lib/dispositivo.ts`. |

## Plan 4 — Apps de PC y celular

| # | Decisión | Motivo | Cómo cambiarla |
|---|---|---|---|
| 48 | La app de PC (Electron) carga la UI desde `https://setup.mexicanland.net` (configurable con `MI_SETUP_URL`); no la empaqueta. | Mismo origen que la API: sin CORS y siempre actualizada. | `apps/desktop/src/main.ts`. |
| 49 | En PC el menú superior es el **nativo** de Electron (Archivo · categorías · Ver · Ventana · Ayuda) y se construye con los apartados permitidos; la UI oculta su menú HTML dentro de Electron. | Barra superior nativa estilo LP, sin menús duplicados. | `construirMenu` en `main.ts`, `Layout.tsx`. |
| 50 | El agente de la PC vive en el proceso principal (`systeminformation`); la UI envía el latido cada 15 s y las métricas cada 2 s solo mientras alguien mira las gráficas. Al cerrar la ventana, la app queda en la bandeja y sigue latiendo. | Sin un servicio aparte. | `metricas.ts`, `lib/dispositivo.ts`. |
| 51 | Sin `build/icon.png` (de `pnpm branding`) no se crea ícono de bandeja y `pnpm --filter @mi-setup/desktop dist` se detiene con un aviso. | Nunca usar el ícono genérico de Electron. | `verificar-icono.ts`. |
| 52 | La app de Android (Capacitor) empaqueta la UI (`build:movil`) y habla con `https://setup.mexicanland.net` (o `MI_SETUP_API` al compilar). | Abre rápido y funciona aunque el servidor tarde. | `apps/ui/vite.config.ts`, `capacitor.config.ts`. |
| 53 | Huella o rostro: al activarla (requiere contraseña reciente), el servidor entrega una llave aleatoria que se guarda en el almacén seguro de Android (`capacitor-native-biometric`); para usarla hay que pasar la huella. El servidor solo guarda su SHA-256. Cuenta como reautenticación **fuerte**. | La biometría vive en el teléfono; el servidor necesita algo verificable. | `lib/biometria.ts`, `AuthService.reauth`. |
| 54 | Los recordatorios se revisan cada 30 s; al vencer se envían por ntfy y por WebSocket (notificación local en PC/Android). Los repetidos pasan a la siguiente fecha; uno mensual del día 31 cae en el último día del mes. | Lo pide el prompt. | `modules/recordatorios.ts`. |
| 55 | Cada cuenta tiene un canal de chat personal "Mis dispositivos"; los mensajes que son solo una URL se marcan como enlace, y un mensaje puede crear un recordatorio. | Chat entre celular y PC; el modelo ya admite grupos. | `modules/chat.ts`. |
| 56 | El APK de depuración se firma con la llave de depuración de Android; el de release se firma si existe `android/keystore.properties` (no se sube al repo). | APK "firmable" sin guardar secretos en el repo. | `apps/mobile/android/app/build.gradle`. |

## Plan 5 — VPS

| # | Decisión | Motivo | Cómo cambiarla |
|---|---|---|---|
| 57 | Las credenciales SSH (llave o contraseña, y la frase de la llave) se cifran con AES-256-GCM (`SERVER_ENC_KEY`); la API nunca las devuelve, ni siquiera al editar (campo vacío = conservar). | Nivel B de seguridad. | `modules/vps/servidores.ts`. |
| 58 | Huella del host: se acepta y guarda en la primera conexión (TOFU); si cambia, se rechaza la conexión, se avisa por push y la UI permite aceptar la nueva **solo** escribiendo el nombre del servidor y con reautenticación fuerte. Cambiar host o puerto borra la huella guardada. | Equivalente a `StrictHostKeyChecking`. | `ssh.ts`, `servidores.ts`. |
| 59 | Alta, edición y borrado de servidores: solo la cuenta maestra (módulo Terminal, nivel administrar) y con reautenticación fuerte. | Son las llaves del VPS. | `servidoresRoutes`. |
| 60 | En servidores con usuario `root`, la terminal y el explorador de archivos piden reautenticación fuerte (5 min). | Lo pide el prompt para root; los archivos dan el mismo poder. | `terminal.ts`, `archivos.ts`. |
| 61 | Métricas del VPS: un solo comando por SSH cada 3 s (`/proc/stat`, `meminfo`, `df`, `net/dev`, `loadavg`, `uptime`), solo mientras alguien está suscrito; la conexión se cierra al irse el último. | Sin agentes en el VPS ni historial. | `metricas.ts`, `parse.ts`. |
| 62 | Alertas: cada 60 s se prueba el puerto SSH de cada VPS (TCP) y cada monitor (TCP o HTTP; HTTP "arriba" = respuesta < 500). Solo se avisa en los cambios; el primer resultado no avisa. Umbrales de RAM/disco opcionales, con aviso como máximo cada 30 min. | Evita avisos repetidos. | `alertas.ts`. |
| 63 | Comandos peligrosos (lista en `packages/shared/src/danger.ts`): doble confirmación (escribir el nombre exacto del botón) + reautenticación fuerte; el servidor lo vuelve a comprobar aunque la UI ya lo pida. | No basta con la UI. | `comandos.ts` (`ejecutarSeguro`). |
| 64 | Salida de comandos limitada a 512 KB y 2 min. Subidas por SFTP de hasta 100 MB. | Proteger memoria y tiempo del servidor. | `ssh.ts`, `archivos.ts`. |
| 65 | Bots: el nombre del servicio, proceso o contenedor se valida (`[A-Za-z0-9_.@:-]`) y se pasa entre comillas; si el usuario SSH no es root se usa `sudo -n` para systemd y Docker (debe estar permitido sin contraseña). pm2 se ejecuta como el propio usuario. | Nunca se concatena texto libre en un comando. | `bots.ts`. |
