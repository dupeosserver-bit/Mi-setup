# Arquitectura

## Vista general

```
                Internet
                   │  80/443 (único punto expuesto)
             ┌─────▼─────┐
             │   Caddy   │  HTTPS automático
             └──┬─────┬──┘
   setup.mexicanland.net   ntfy.mexicanland.net
                │     │
         red "web"    │
          ┌─────▼──┐ ┌▼──────┐
          │  core  │ │ ntfy  │  push
          └───┬────┘ └───────┘
   red "datos" (interna, sin salida)
          ┌───▼────────┐
          │ misetup-db │  PostgreSQL 16
          └────────────┘

 rd.mexicanland.net → RustDesk hbbs/hbbr (los levanta el script del VPS, fuera de este compose)
 wg0 10.66.66.0/24  → WireGuard en el host (script del VPS)
```

Clientes: app de PC (Electron) y de celular (Capacitor) cargan la misma UI (React) y hablan con `core` por HTTPS y un WebSocket autenticado (a partir de las fases 2 a 4).

## Monorepo

| Paquete | Rol |
|---|---|
| `packages/shared` | Catálogo de módulos, modelo de permisos (RBAC), esquemas Zod. Sin dependencias de servidor. |
| `apps/core` | API Fastify, migraciones Drizzle, auditoría, chequeo de permisos. |

## core

- `src/config.ts`: variables de entorno validadas con Zod.
- `src/app.ts`: arma Fastify (helmet, CORS cerrado, errores en español, rutas).
- `src/db/schema.ts`: tablas `users`, `user_module_permissions`, `audit_log`.
- `src/db/migrate.ts`: aplica `drizzle/*.sql` al arrancar (idempotente, tabla `drizzle.__drizzle_migrations`).
- `src/security/rbac.ts`: `requirePermission(modulo, nivel)` para cada ruta protegida.
- `src/audit/audit.ts`: inserta eventos de auditoría con detalles redactados.

### Flujo de una petición protegida (desde la fase 2)

```
petición → helmet/CORS → autenticación (fase 2: rellena request.authUser)
        → requirePermission(modulo, nivel)
             sin usuario  → 401
             sin permiso  → 403 + auditoría "denegado"
             permitido    → handler (validación Zod) → respuesta
```

## Base de datos

- `users`: cuentas. Una sola `maestra` (índice único parcial). Email único sin distinguir mayúsculas.
- `user_module_permissions`: (usuario, módulo) → nivel. Sin fila = sin acceso.
- `audit_log`: solo inserción. Triggers impiden UPDATE/DELETE/TRUNCATE.

## Flujos pendientes (se documentan en su fase)

- WebSocket multiplexado (fases 3–4), SSH/terminal (fase 5), correo entrante con HMAC y VPN (fase 8), IA con cola de propuestas (fase 9).
