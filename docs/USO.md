# Uso y configuración

## Variables de entorno

Plantilla completa en `.env.example`. En el VPS las genera `mi-setup-vps.sh` en `/opt/mi-setup/.env`.

| Variable | Obligatoria | Por defecto | Uso |
|---|---|---|---|
| `DOMAIN` | No | `mexicanland.net` | Dominio base |
| `APP_HOST` | No | `setup.mexicanland.net` | Host de la app y la API (Caddy + CORS) |
| `NTFY_HOST` | No | `ntfy.mexicanland.net` | Host de notificaciones push |
| `RD_HOST` | No | `rd.mexicanland.net` | Servidor RustDesk |
| `POSTGRES_USER` | No | `misetup` | Usuario de Postgres |
| `POSTGRES_DB` | No | `misetup` | Base de datos |
| `POSTGRES_PASSWORD` | **Sí** (producción) | — | Contraseña de Postgres |
| `POSTGRES_HOST` | No | `localhost` (en Docker: `misetup-db`) | Solo desarrollo local |
| `POSTGRES_PORT` | No | `5432` | Solo desarrollo local |
| `JWT_SECRET` | **Sí** (producción) | — | Firma de sesiones (fase 2) |
| `SERVER_ENC_KEY` | **Sí** (producción) | — | Cifrado de credenciales de infraestructura (fases 2 y 5) |
| `MAIL_INBOUND_SECRET` | No | vacío | HMAC del correo entrante (fase 8) |
| `NTFY_TOPIC` | No | vacío | Tema secreto de ntfy (avisos de seguridad) |
| `NTFY_URL` | No | `https://NTFY_HOST` (Docker: `http://ntfy`) | Dónde publica core los avisos |
| `ANTHROPIC_API_KEY` | No | vacío | IA asistente (fase 9) |
| `AI_MODEL` | No | `claude-sonnet-5-5` | Modelo de IA |
| `AI_MONTHLY_BUDGET_USD` | No | `10` | Tope mensual de la IA |
| `PTERO_URL` | No | `https://panel.mexicanland.org` | Panel Pterodactyl |
| `PTERO_CLIENT_KEY` / `PTERO_APP_KEY` | No | vacío | API de Pterodactyl (`ptlc_` / `ptla_`) |
| `DISCORD_BOT_TOKEN` | No | vacío | Bot de Discord |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_BEARER_TOKEN` | No | vacío | X (Twitter) |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | No | vacío | Twitch |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | vacío | YouTube |
| `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` | No | vacío | Kick |
| `LOG_LEVEL` | No | `info` | Nivel de log de core |
| `UI_DIR` | No | `apps/ui/dist` (Docker: `/app/public`) | Carpeta de la UI compilada que sirve core |
| `UPLOADS_DIR` | No | `.data/uploads` (Docker: `/data/uploads`, volumen) | Imágenes subidas en Ajustes → Apariencia |
| `DB_EMBEBIDA` | No | vacío | Solo desarrollo: `1` usa Postgres embebido en `.data/pglite` |

Generar secretos: `openssl rand -base64 48`.

## Despliegue en el VPS

1. DNS en Cloudflare: registros A de `setup.`, `ntfy.` y `rd.` al IP del VPS, **nube gris (solo DNS)**.
2. El script `mi-setup-vps.sh` prepara el servidor, clona el repo y ejecuta `docker compose --env-file /opt/mi-setup/.env up -d --build --remove-orphans`.
3. Verifica: `curl https://setup.mexicanland.net/api/health` → `{"ok":true,"version":"…"}`.

Datos persistentes en volúmenes con nombre: `misetup_pgdata`, `misetup_uploads`, `misetup_ntfy`, `misetup_caddy_data`, `misetup_caddy_config`.

Respaldo manual de la base: `docker exec misetup-db pg_dump -U misetup misetup > respaldo.sql`.

## Crear la cuenta maestra (una sola vez)

No hay registro público. Tras el primer despliegue:

```bash
docker exec -it misetup-core node dist/cli/crear-maestra.js
```

En local: `pnpm --filter @mi-setup/core crear-maestra`.

El comando pide correo, nombre y contraseña (mínimo 12 caracteres), y muestra una clave 2FA (y su enlace `otpauth://`) para tu app autenticadora (Aegis, Google Authenticator…). Confirma con un código de 6 dígitos y la cuenta queda creada. **Guarda la clave 2FA en un lugar seguro**: sin ella no podrás entrar.

## Inicio de sesión y seguridad (API)

| Ruta | Acceso | Uso |
|---|---|---|
| `POST /api/auth/login` | público | `{email, password, totp, dispositivo}` → `accessToken` (15 min) + `refreshToken` (30 días) |
| `POST /api/auth/refresh` | público | `{refreshToken}` → tokens nuevos (el anterior deja de valer) |
| `POST /api/auth/logout` | sesión | Cierra la sesión actual |
| `GET /api/auth/me` | sesión | Usuario, permisos por módulo, PIN configurado y reautenticación vigente |
| `POST /api/auth/reauth` | sesión | `{metodo:"password", password}` o `{metodo:"pin", pin}` → válido 5 min |
| `PUT /api/auth/pin` | sesión + contraseña reciente | `{pin}` de 6 a 12 dígitos |

- 5 intentos fallidos en 15 min bloquean el correo (20 bloquean la IP). Cada fallo envía un aviso push con el correo, la IP y el dispositivo.
- Reutilizar un refresh token viejo cierra la sesión y avisa ("posible robo de sesión").
- 5 fallos de PIN o contraseña al reautenticarse cierran la sesión.

## Marca (logo de MexicanLand)

1. Coloca el logo en `assets/branding/icon.png` (PNG 1024×1024).
2. Ejecuta `pnpm branding`: genera favicon, apple-touch-icon y logo del encabezado (web), `icon.ico` (Windows) y los íconos de Android.
3. Sin `icon.png` la app muestra "MexicanLand" en texto; no se usa ninguna imagen genérica.

Desde la app, **Ajustes → Apariencia** permite subir otro logo, un fondo y tu avatar (PNG/JPG/WEBP/SVG, máx. 5 MB). "Restablecer" vuelve al logo de MexicanLand.

## Desarrollo local

Ver `README.md`. Sin Docker: pon `DB_EMBEBIDA=1` en tu `.env` y crea la cuenta con `pnpm --filter @mi-setup/core crear-maestra`. Postgres local: `docker compose -f docker-compose.dev.yml up -d` (con `POSTGRES_PASSWORD=misetup-dev` en tu `.env`, o la que pongas en ambos).

## ntfy

- Servidor: `https://ntfy.mexicanland.net`. El tema es `NTFY_TOPIC` (secreto, largo y aleatorio; quien lo conozca puede leer y publicar).
- Android: instala la app oficial **ntfy**, agrega el servidor `https://ntfy.mexicanland.net` y suscríbete al tema `NTFY_TOPIC`.
- Avisos que llegan desde la fase 2: intento fallido de inicio de sesión, bloqueo temporal, posible robo de sesión y sesión cerrada por fallos de reautenticación.
- Las notificaciones vía Capacitor se documentan en la fase 4.

## Pendiente por fase

Instalador de Windows y APK (fase 4), RustDesk (fase 11), WireGuard (fase 8) y cada integración en su fase.
