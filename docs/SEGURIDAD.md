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
| Lectura de la bóveda por el servidor | Cifrado de extremo a extremo: Argon2id (3 pasadas, 64 MiB) + XChaCha20-Poly1305 en el cliente; el servidor guarda solo cifrado, sal y parámetros. ✅ |
| Robo de credenciales SSH | AES-256-GCM con `SERVER_ENC_KEY`; nunca se devuelven al cliente; huella del host verificada (TOFU). ✅ |
| Comandos destructivos | Lista de patrones peligrosos → doble confirmación + reautenticación fuerte, comprobado en el servidor. ✅ |
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

Revisado en el Plan 12. `[x]` = verificado en código y con prueba automática; `[~]` = verificado en código, sin prueba automática; `[ ]` = depende del despliegue (hazlo tú en el VPS).

**Secretos**
- [x] Ningún secreto en el código, logs, commits ni documentación (búsqueda de patrones de llaves: solo valores de prueba en `test/`).
- [x] `.env.example` con todos los secretos vacíos; `.env` y `.data/` en `.gitignore`.
- [x] Configuración validada al arrancar; en producción faltan `POSTGRES_PASSWORD`, `JWT_SECRET` o `SERVER_ENC_KEY` ⇒ no arranca. `DB_EMBEBIDA` prohibido en producción.
- [x] Tokens OAuth, credenciales SSH, secretos TOTP, contraseñas RustDesk: cifrados con AES-256-GCM (`SERVER_ENC_KEY`).
- [x] Bóveda y 2FA: cifrado de extremo a extremo (el servidor solo guarda texto cifrado).
- [x] La IA nunca recibe bóveda, 2FA, llaves SSH, tokens ni contraseñas.

**Autenticación y sesiones**
- [x] Argon2id para contraseñas y PIN; TOTP con anti-repetición en la cuenta maestra.
- [x] Bloqueo por intentos (correo e IP) y aviso push.
- [x] Access token de 15 min; refresh rotativo con detección de reutilización (revoca la sesión).
- [x] Reautenticación (PIN o fuerte) para acciones sensibles; fuerte para bóveda, cuentas, OAuth, control remoto, comandos peligrosos, exportar auditoría.
- [x] Desactivar una cuenta corta sus sesiones al momento.

**Permisos**
- [x] Guardia global: toda ruta `/api` declara su acceso (si falta, la app no arranca).
- [x] Permisos por módulo; los módulos solo-maestra no se pueden otorgar.
- [x] Temas del WebSocket autorizados por módulo y revalidados cada minuto.

**IA**
- [x] Solo propone; ejecuta únicamente con "Aprobar" (transición atómica, una sola vez).
- [x] Peligrosas: escribir `EJECUTAR` + reautenticación fuerte; permisos revisados al aprobar.
- [x] Tope mensual con tokens reales; bloquea sin llamar a la API.
- [x] Texto externo marcado como no confiable; auditoría de propuesta, aprobación, rechazo y resultado.

**Entradas externas**
- [x] Correo entrante: HMAC-SHA256 con ventana de ±5 min y comparación en tiempo constante.
- [x] OAuth: `state` de un solo uso, PKCE donde aplica.
- [x] Vigilante de precios: protección SSRF (sin red interna, límites de tiempo, tamaño y redirecciones).
- [x] Discord sin menciones masivas; X con costo confirmado.
- [x] Validación Zod en todas las entradas; errores en español sin trazas.

**Comandos y servidores**
- [x] Comandos peligrosos (`rm -rf`, `dd`, `mkfs`, `shutdown`, `iptables -F`…) con doble confirmación y reautenticación.
- [~] Agente de VPN: socket Unix con permisos 660, sin shell, argumentos validados.

**Web y clientes**
- [x] Helmet con CSP cerrada (scripts solo propios; imágenes `https:` por las portadas de ofertas), CORS con lista cerrada.
- [~] Electron: `contextIsolation`, sin `nodeIntegration`, IPC solo desde la app, enlaces externos con lista de esquemas, navegador privado con partición en memoria.
- [x] Auditoría inmutable (triggers que impiden UPDATE/DELETE/TRUNCATE); CSV con escape de fórmulas.

**Despliegue (pendiente en el VPS)**
- [ ] Solo los puertos 80/443 (Caddy) y los de RustDesk/WireGuard abiertos en el firewall.
- [ ] `.env` del VPS con permisos 600 y secretos generados con `openssl rand -base64 48`.
- [ ] Respaldos de la base funcionando (el script del VPS) y prueba de restauración.
- [ ] Rotar `JWT_SECRET` cierra todas las sesiones; rotar `SERVER_ENC_KEY` requiere volver a guardar los secretos cifrados.

## IA asistente (Plan 9)

- La llave `ANTHROPIC_API_KEY` solo existe en el servidor; los clientes nunca la ven.
- La IA **solo propone**: cada acción queda pendiente y se ejecuta únicamente con "Aprobar" (transición atómica, una sola ejecución). No hay modo automático.
- Peligrosas: escribir `EJECUTAR` + reautenticación fuerte. Permisos revisados al aprobar.
- Tope mensual (`AI_MONTHLY_BUDGET_USD`) con tokens reales; al llegar responde 402 sin llamar a la API.
- Nunca recibe bóveda, 2FA, llaves SSH, tokens ni contraseñas; el texto externo va marcado como no confiable.
- Auditoría: `ia_propuesta` y `ia_ejecutada` (actor ia), `ia_aprobada` y `ia_rechazada` (actor usuario).

## Redes, streams y novedades (Plan 10)

- OAuth en el servidor: `state` de un solo uso (hash, 10 min), PKCE en Kick y X, tokens cifrados con `SERVER_ENC_KEY`; los clientes nunca reciben tokens.
- Conectar o desconectar cuentas exige `administrar` y reautenticación fuerte; todo queda en auditoría (`cuenta_conectada`, `stream_actualizado`, `x_publicado`, `discord_enviado`).
- X: el costo estimado se confirma antes de cada publicación o lectura.
- Discord: sin menciones masivas y solo a canales donde está el bot.
- Vigilante de precios: protección SSRF (sin red interna), límites de tiempo, tamaño y redirecciones.

## Control remoto, cuentas y auditoría (Plan 11)

- Contraseñas de RustDesk cifradas; solo se entregan con reautenticación fuerte y quedan auditadas (`control_remoto_abierto`).
- Cuentas: solo la maestra; permisos solo-maestra no otorgables; desactivar revoca sesiones al momento; cambios con reautenticación fuerte.
- Auditoría inmutable (triggers); exportar CSV pide reautenticación y escapa fórmulas.
