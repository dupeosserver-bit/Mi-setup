# Mi Setup

App personal (no pública) para PC (Windows) y celular (Android), vinculadas y con todo en la nube (VPS propio), para operar el hosting **MexicanLand**: terminal SSH, métricas en vivo, panel Pterodactyl, bóveda de contraseñas, 2FA, correos temporales, VPN, IA asistente con aprobación obligatoria y más.

> Estado: **Plan 6 — Pterodactyl y negocio** (panel nativo y web, vencimientos, clientes y cobros, finanzas, respaldos).

## Estructura

```
apps/core/        Backend (Fastify + Drizzle + PostgreSQL)
packages/shared/  Módulos, permisos y esquemas Zod compartidos
deploy/           Dockerfile de core y Caddyfile
docs/             SUPUESTOS, ARQUITECTURA, SEGURIDAD, USO
assets/branding/  icon.png (logo MexicanLand, lo coloca el usuario)
```

`apps/ui`, `apps/desktop` y `apps/mobile` se agregan en las fases 3 y 4.

## Requisitos

- Node.js 22 o superior
- pnpm 9 (`npm i -g pnpm@9`)
- Docker (opcional en local, para la base de datos)

## Correr en local

```bash
pnpm install
cp .env.example .env              # rellena POSTGRES_PASSWORD (cualquier valor en local)
docker compose -f docker-compose.dev.yml up -d   # Postgres solo en 127.0.0.1
pnpm dev                          # core en http://127.0.0.1:3000
```

Comprueba: `curl http://127.0.0.1:3000/api/health` → `{"ok":true,"version":"0.1.0"}`.

Sin base de datos, `pnpm dev` arranca igual y avisa en el log (solo en desarrollo).

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Backend en modo desarrollo con recarga |
| `pnpm build` | Compila todos los paquetes |
| `pnpm typecheck` | Revisión de tipos (TypeScript estricto) |
| `pnpm test` | Pruebas (Vitest) |
| `pnpm lint` | ESLint |
| `pnpm --filter @mi-setup/core db:generate` | Genera una migración tras cambiar el esquema |
| `pnpm --filter @mi-setup/core crear-maestra` | Crea la cuenta maestra con 2FA (una sola vez) |

## Despliegue

En el VPS, el script `mi-setup-vps.sh` clona este repo y ejecuta:

```bash
docker compose --env-file /opt/mi-setup/.env up -d --build --remove-orphans
```

Las migraciones se aplican solas al arrancar `core`. Ver `docs/USO.md`.

## Instaladores

El instalador de Windows (`.exe`) y el APK de Android se agregan en la fase 4.
