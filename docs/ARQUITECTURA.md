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

- `src/auth/service.ts`: login, bloqueo, sesiones, refresh rotativo, reautenticación, PIN.
- `src/auth/{password,totp,tokens}.ts`: Argon2id, TOTP, JWT y refresh tokens.
- `src/notify/notifier.ts`: avisos push a ntfy.
- `src/cli/crear-maestra.ts`: alta de la cuenta maestra por consola.

### Flujo de una petición protegida

```
petición → helmet/CORS → guardia global (preHandler) según config.acceso de la ruta
   publico                → handler
   autenticado / modulo   → Bearer JWT → sesión vigente + usuario activo (BD)
        sin sesión válida → 401
        sin permiso       → 403 + auditoría "acceso_denegado"
        reauth requerida y vencida → 403 codigo "reauth_requerida"
        permitido         → handler (validación Zod) → respuesta
```

### Flujo de inicio de sesión

```
login {correo, contraseña, totp}
  ¿bloqueado? (fallos en 15 min) ─ sí → 429 + aviso push
  Argon2id + TOTP (anti-repetición)
     falla → intento registrado + auditoría + aviso push → 401
     ok    → sesión nueva (refresh hash) → accessToken 15 min + refreshToken
refresh {token} → rota el secreto; token viejo reutilizado → revoca sesión + aviso
```

## Base de datos

- `users`: cuentas. Una sola `maestra` (índice único parcial). Email único sin distinguir mayúsculas.
- `user_module_permissions`: (usuario, módulo) → nivel. Sin fila = sin acceso.
- `audit_log`: solo inserción. Triggers impiden UPDATE/DELETE/TRUNCATE.
- `sessions`: una por dispositivo; hash del refresh actual y del anterior, reautenticación y fallos.
- `login_attempts`: intentos de login para el bloqueo temporal (se purgan a los 30 días).

## Tiempo real (WebSocket único `/api/ws`)

```
cliente ──{tipo:"auth", token, dispositivoId}──▶ core   (≤10 s, si no se cierra)
        ◀─{tipo:"auth.ok", dispositivo:true|false}─
cliente ──{tipo:"sub", tema}──▶ autorización por tema (permisos del módulo)
core    ──{tipo:"evento", tema, datos}──▶ suscriptores
dispositivo ──{tipo:"latido"} cada 15 s──▶ presencia (desconectado a los 45 s)
core ──{tipo:"interes", activo}──▶ dispositivo (alguien mira sus gráficas → métricas cada 2 s)
```

Temas: `dispositivos`, `equipo:<id>:metricas`, `usuario:<id>` (sincronización), `chat:<canal>`, `vps:<id>:metricas`, `ptero:<id>:consola`, `apariencia`. La sesión del socket se revalida cada minuto; el cliente reenvía `auth` cuando renueva su token.

## UI (`apps/ui`)

React + Vite + Tailwind. Una sola UI para web, Electron y Capacitor. `src/modulos.tsx` registra cada apartado (ruta, ícono, página); el menú se construye con los permisos de `/api/auth/me`. Las peticiones pasan por `lib/api.ts`, que renueva el token y abre el diálogo de reautenticación cuando el servidor responde `reauth_requerida`.

## Flujos pendientes (se documentan en su fase)

- WebSocket multiplexado (fases 3–4), SSH/terminal (fase 5), correo entrante con HMAC y VPN (fase 8), IA con cola de propuestas (fase 9).
