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
| `NTFY_TOPIC` | No | vacío | Tema secreto de ntfy (fase 2 en adelante) |
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

Generar secretos: `openssl rand -base64 48`.

## Despliegue en el VPS

1. DNS en Cloudflare: registros A de `setup.`, `ntfy.` y `rd.` al IP del VPS, **nube gris (solo DNS)**.
2. El script `mi-setup-vps.sh` prepara el servidor, clona el repo y ejecuta `docker compose --env-file /opt/mi-setup/.env up -d --build --remove-orphans`.
3. Verifica: `curl https://setup.mexicanland.net/api/health` → `{"ok":true,"version":"…"}`.

Datos persistentes en volúmenes con nombre: `misetup_pgdata`, `misetup_uploads`, `misetup_ntfy`, `misetup_caddy_data`, `misetup_caddy_config`.

Respaldo manual de la base: `docker exec misetup-db pg_dump -U misetup misetup > respaldo.sql`.

## Desarrollo local

Ver `README.md`. Postgres local: `docker compose -f docker-compose.dev.yml up -d` (con `POSTGRES_PASSWORD=misetup-dev` en tu `.env`, o la que pongas en ambos).

## ntfy

- Servidor: `https://ntfy.mexicanland.net`. El tema es `NTFY_TOPIC` (secreto, largo y aleatorio; quien lo conozca puede leer y publicar).
- Android: instala la app oficial **ntfy**, agrega el servidor `https://ntfy.mexicanland.net` y suscríbete al tema `NTFY_TOPIC`.
- Las notificaciones vía Capacitor se documentan en la fase 4.

## Pendiente por fase

Instalador de Windows y APK (fase 4), RustDesk (fase 11), WireGuard (fase 8) y cada integración en su fase.
