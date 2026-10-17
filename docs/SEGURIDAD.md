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
| Fuerza bruta en el login | Argon2id, 5 fallos/correo o 20/IP en 15 min → bloqueo temporal, aviso push en cada fallo, mismo error para correo, contraseña o código incorrectos. ✅ |
| Contraseña robada | 2FA (TOTP) obligatorio para la maestra, con anti-repetición de códigos. ✅ |
| Robo de tokens | accessToken de 15 min; refresh rotativo con detección de reutilización (revoca la sesión y avisa). ✅ |
| Dispositivo desbloqueado en manos de otro | Reautenticación de 5 min para acciones sensibles; el PIN no basta para las fuertes; 5 fallos cierran la sesión. ✅ |
| Ruta olvidada sin permisos | Toda ruta `/api` debe declarar `config.acceso`, o core no arranca. ✅ |
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

## Autenticación

- Contraseña: Argon2id (19 MiB, t=2, p=1). Correo inexistente: se verifica contra un hash de relleno para que tarde lo mismo.
- 2FA de la app: TOTP RFC 6238; el secreto se guarda cifrado (AES-256-GCM, clave HKDF de `SERVER_ENC_KEY`).
- Sesiones en la tabla `sessions`: solo se guarda el SHA-256 del refresh token.
- Reautenticación: `pin` (PIN, contraseña o huella) o `fuerte` (contraseña o huella), válida 5 min.

## Permisos

- Roles: `maestra` (todo) y `usuario` (solo lo asignado).
- Niveles por módulo: `lectura`, `escritura`, `administrar` (acumulativos).
- Cuenta desactivada = sin acceso a nada.

## Checklist de revisión

Se completa en la fase 12.
