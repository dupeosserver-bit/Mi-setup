# Seguridad

## Principios

- Uso personal: sin registro público; solo la cuenta maestra crea cuentas.
- Denegar por defecto: sin permiso explícito no hay acceso.
- La IA solo propone; nada se ejecuta sin aprobación (fase 9).
- Secretos solo en variables de entorno; nunca en código, logs ni commits.

## Modelo de amenazas (base)

| Amenaza | Mitigación (estado en el Plan 1) |
|---|---|
| Acceso directo a la base de datos | Postgres sin puertos publicados, en la red Docker `datos` (interna, sin salida). ✅ |
| Exposición de servicios internos | Solo Caddy publica 80/443. ✅ |
| Escalada de privilegios entre cuentas | RBAC por módulo en `shared` + `requirePermission` en core; módulos solo-maestra no delegables. ✅ |
| Borrado de rastros | Auditoría inmutable con triggers en Postgres. ✅ |
| Fuga de secretos en logs | Redacción en pino (`authorization`, `cookie`, `password`, `token`, `secret`) y en detalles de auditoría. ✅ |
| Arranque con configuración insegura | En producción, core no arranca sin `POSTGRES_PASSWORD`, `JWT_SECRET`, `SERVER_ENC_KEY`. ✅ |
| Peticiones de otros orígenes | CORS cerrado al host de la app. ✅ |
| Cabeceras HTTP | helmet (nosniff, frame-ancestors, HSTS en producción, etc.). ✅ |
| Robo de sesión / fuerza bruta | Fase 2: JWT cortos, refresh rotativo, límite de intentos, aviso push. ⏳ |
| Lectura de la bóveda por el servidor | Fase 7: cifrado de extremo a extremo (Argon2id + XChaCha20-Poly1305). ⏳ |
| Robo de credenciales de infraestructura | Fase 5: AES-256-GCM con `SERVER_ENC_KEY`, nunca devueltas en claro. ⏳ |
| Inyección contra la IA | Fase 9: texto externo marcado como no confiable, sin herramientas que lean secretos. ⏳ |

## Qué ve cada parte

| Dato | Cliente | core | Base de datos | IA |
|---|---|---|---|---|
| Contraseña de login | La escribe | Solo para verificar hash | Hash Argon2id | Nunca |
| Bóveda / 2FA | En claro (tras desbloquear) | Solo cifrado | Solo cifrado | Nunca |
| Credenciales SSH / tokens de API | Nunca en claro | En memoria al usar | Cifradas (AES-256-GCM) | Nunca |
| Auditoría | Lectura (maestra) | Inserta | Solo inserción | Nunca la modifica |

## Permisos

- Roles: `maestra` (todo) y `usuario` (solo lo asignado).
- Niveles por módulo: `lectura`, `escritura`, `administrar` (acumulativos).
- Cuenta desactivada = sin acceso a nada.

## Checklist de revisión

Se completa en la fase 12.
