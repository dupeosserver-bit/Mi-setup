# Mi Setup

App personal (no pública) para PC (Windows) y celular (Android), vinculadas y con todo en la nube (VPS propio), para operar el hosting **MexicanLand**.

> Estado: **Versión 0.2.0** — Planes 1 a 12 más la versión 2 (Ajustes con temas y claves, roles, terminal mejorada, IA con archivos y voz, noticias, cripto, inversiones y divisas). Ver `docs/USO.md`.

## Qué incluye

| Área | Apartados |
|---|---|
| Inicio y productividad | Inicio con widgets, recordatorios (push), notas, chat privado entre dispositivos y cuentas |
| Equipos | Estado en vivo de la PC y el celular (CPU, RAM, disco, red), conectado/desconectado |
| VPS | Servidores con credenciales cifradas, terminal SSH (xterm), rendimiento en vivo, alertas de caída, comandos guardados con doble confirmación, archivos (SFTP), bots de Discord |
| Panel | Pterodactyl (nativo y web), vencimientos (dominios, SSL, VPS), clientes y cobros, finanzas con gráficas, ideas de negocio |
| Respaldos | Lista y descarga de respaldos de la base |
| Seguridad | Bóveda con cifrado de extremo a extremo, autenticador 2FA, generador, correos temporales, VPN WireGuard, navegador privado, registro de actividad, cuentas y permisos |
| IA | Asistente que **solo propone**; nada se ejecuta sin "Aprobar"; tope mensual |
| Redes | Streams (Twitch, YouTube, Kick), X con costo estimado, Discord por bot |
| Novedades | Clima, ofertas de videojuegos, vigilante de precios de RAM |
| Control remoto | RustDesk autoalojado (`rd.mexicanland.net`) |

## Estructura

```
apps/core/        Backend (Fastify + Drizzle + PostgreSQL), API y tareas programadas
apps/ui/          Interfaz (React + Vite + Tailwind), la misma para web, PC y Android
apps/desktop/     App de Windows (Electron): bandeja, agente de métricas, navegador privado
apps/mobile/      App de Android (Capacitor)
packages/shared/  Módulos, permisos y esquemas Zod compartidos
deploy/           Dockerfile, Caddyfile, Email Worker de Cloudflare, agente de WireGuard del host
docs/             USO, ARQUITECTURA, SEGURIDAD (checklist), SUPUESTOS
assets/branding/  icon.png: logo de MexicanLand (lo colocas tú)
```

## Requisitos

- Node.js 22 o superior y pnpm 9 (`npm i -g pnpm@9`)
- Docker en el VPS (en local es opcional: hay Postgres embebido para desarrollo)
- Para el APK: JDK 17+ y Android SDK

## Correr en local

```bash
pnpm install
cp .env.example .env    # en local basta JWT_SECRET y SERVER_ENC_KEY (32+ caracteres) y DB_EMBEBIDA=1
pnpm dev                # core en http://127.0.0.1:3000 y UI en http://localhost:5173
pnpm --filter @mi-setup/core crear-maestra
```

Comprueba: `curl http://127.0.0.1:3000/api/health` → `{"ok":true,"version":"0.1.0"}`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Backend y UI en modo desarrollo |
| `pnpm build` | Compila todos los paquetes |
| `pnpm typecheck` | TypeScript estricto en todo el monorepo |
| `pnpm test` | Pruebas (Vitest): cifrado, permisos, aprobación de la IA, HMAC del correo, OAuth, SSRF y más |
| `pnpm lint` | ESLint |
| `pnpm branding` | Genera los íconos desde `assets/branding/icon.png` |
| `pnpm --filter @mi-setup/core db:generate` | Nueva migración tras cambiar el esquema |
| `pnpm --filter @mi-setup/core crear-maestra` | Cuenta maestra con 2FA (una sola vez) |

## Despliegue

En el VPS, el script `mi-setup-vps.sh` clona este repo y ejecuta:

```bash
docker compose --env-file /opt/mi-setup/.env up -d --build --remove-orphans
```

Las migraciones se aplican solas al arrancar `core`. Cada variable está explicada en `docs/USO.md`; las que falten se muestran en la app como "Falta configurar: VARIABLE".

## Instaladores

1. Coloca el logo en `assets/branding/icon.png` y ejecuta `pnpm branding` (sin logo el instalador no se genera: no se usan íconos genéricos).
2. Windows: `pnpm --filter @mi-setup/desktop dist` → `apps/desktop/release/Mi Setup Setup <versión>.exe`.
3. Android: `pnpm --filter @mi-setup/mobile sincronizar` y luego `pnpm --filter @mi-setup/mobile apk` (depuración) o `apk:release` (firmado con `keystore.properties`; ver `docs/USO.md`).

## Documentación

- `docs/USO.md`: variables, despliegue y cómo usar cada apartado.
- `docs/ARQUITECTURA.md`: piezas y flujos (tiempo real, correo, VPN, IA, OAuth).
- `docs/SEGURIDAD.md`: modelo de amenazas y checklist de revisión.
- `docs/SUPUESTOS.md`: cada decisión tomada sin preguntar, con su motivo.
