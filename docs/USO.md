# Uso y configuración

## Variables de entorno

Plantilla completa en `.env.example`. En el VPS las genera `mi-setup-vps.sh` en `/opt/mi-setup/.env`.

| Variable | Obligatoria | Por defecto | Uso |
|---|---|---|---|
| `DOMAIN` | No | `mexicanland.net` | Dominio base |
| `APP_HOST` | No | `setup.mexicanland.net` | Host de la app y la API (Caddy + CORS) |
| `NTFY_HOST` | No | `ntfy.mexicanland.net` | Host de notificaciones push |
| `RD_HOST` | No | `rd.mexicanland.net` | Servidor RustDesk |
| `RD_PUBLIC_KEY` | No | vacío | Clave pública de RustDesk (`id_ed25519.pub` de hbbs) para mostrarla en Control remoto |
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
| `ANTHROPIC_API_KEY` | No | vacío | IA asistente (console.anthropic.com → API Keys). Solo vive en el servidor |
| `AI_MODEL` | No | `claude-sonnet-5-5` | Modelo de IA |
| `AI_MONTHLY_BUDGET_USD` | No | `10` | Tope mensual de la IA en USD; al llegar se bloquea hasta el mes siguiente |
| `PTERO_URL` | No | `https://panel.mexicanland.org` | Panel Pterodactyl |
| `PTERO_CLIENT_KEY` / `PTERO_APP_KEY` | No | vacío | API de Pterodactyl (`ptlc_` / `ptla_`) |
| `DISCORD_BOT_TOKEN` | No | vacío | Bot de Discord |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_BEARER_TOKEN` | No | vacío | X (Twitter). Se usa la cuenta conectada por OAuth; el bearer queda reservado |
| `X_COSTO_PUBLICAR_USD` / `X_COSTO_LECTURA_USD` | No | `0.01` / `0.005` | Costo estimado por publicación y por mención leída |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | No | vacío | Twitch |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | vacío | YouTube |
| `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` | No | vacío | Kick |
| `LOG_LEVEL` | No | `info` | Nivel de log de core |
| `BACKUP_HOST_DIR` | No | `/opt/mi-setup/backups` | Carpeta del VPS con los respaldos de la base (se monta de solo lectura) |
| `BACKUP_DIR` | No | Docker: `/data/respaldos` | Dónde core lee esos respaldos |
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

## VPS (terminal, rendimiento, alertas, comandos, archivos, bots)

1. **VPS → Terminal → Servidor**: nombre, host, puerto, usuario y la **llave privada** (recomendado) o contraseña. Se guardan cifradas y no se vuelven a mostrar.
2. La primera conexión acepta la huella del servidor. Si algún día cambia, la app no se conecta y te avisa; acepta la nueva solo si reinstalaste el VPS.
3. **Rendimiento** muestra CPU, RAM, red, carga y discos en vivo mientras la pantalla está abierta.
4. **Alertas de caída**: activa "Vigilar" y, si quieres, umbrales de RAM/disco. Agrega monitores TCP (servidores de juego) o HTTP (páginas).
5. **Comandos guardados**: crea botones como `bash /root/vps-manager.sh backup`. Los peligrosos piden escribir el nombre del botón y tu contraseña o huella.
6. **Bots de Discord**: indica si corre como servicio systemd, proceso pm2 o contenedor Docker. Si el usuario SSH no es root, permite `sudo -n systemctl restart <bot>` y `sudo -n docker …` en sudoers.

## Panel (Pterodactyl y negocio)

- **Pterodactyl**: en el panel, *Cuenta → API Credentials* crea una llave de cliente (`ptlc_…`) → `PTERO_CLIENT_KEY`. Para administración (ver todos los servidores, suspender), *Admin → Application API* crea una llave (`ptla_…`) → `PTERO_APP_KEY`. Sin llaves, la pestaña **Panel web** sigue disponible (en la PC se abre en su propia ventana con la sesión guardada).
- **Vencimientos**: dominios (RDAP, sin claves), certificados SSL (conexión TLS al puerto 443) y VPS (fecha manual). Se revisan cada 6 h.
- **Clientes y cobros**: al marcar "Pagado" se registra el ingreso en *Gastos e ingresos* y el cobro pasa a la siguiente fecha.
- **Respaldos**: si el script del VPS guarda los respaldos en otra carpeta, cambia `BACKUP_HOST_DIR`.

## App de Windows (Electron)

Requisitos: haber ejecutado `pnpm branding` (ícono de MexicanLand).

```bash
pnpm --filter @mi-setup/desktop dist
```

El instalador queda en `apps/desktop/release/Mi Setup Setup <versión>.exe`. La app carga `https://setup.mexicanland.net`; para probar contra otro servidor: variable `MI_SETUP_URL` (por ejemplo `http://localhost:5173` con `pnpm --filter @mi-setup/desktop dev`). Al cerrar la ventana queda en la bandeja y sigue enviando el estado de la PC; "Salir" la cierra del todo.

## App de Android (Capacitor)

Requisitos: JDK 17+ y Android SDK (Android Studio).

```bash
pnpm --filter @mi-setup/mobile sincronizar
pnpm --filter @mi-setup/mobile apk
```

El APK de depuración queda en `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Para un APK de release firmado crea `apps/mobile/android/keystore.properties` (no se sube al repo):

```
storeFile=../mi-setup.jks
storePassword=…
keyAlias=mi-setup
keyPassword=…
```

Genera la llave con `keytool -genkey -v -keystore mi-setup.jks -alias mi-setup -keyalg RSA -keysize 2048 -validity 10000` y compila con `gradlew assembleRelease`. Para otro servidor: `MI_SETUP_API=https://… pnpm --filter @mi-setup/ui build:movil`.

Huella o rostro: en la app de Android, **Ajustes → Seguridad → Activar huella** (pide tu contraseña antes). Las notificaciones locales necesitan aceptar el permiso la primera vez.

## Pendiente por fase

Instalador de Windows y APK (fase 4), RustDesk (fase 11), WireGuard (fase 8) y cada integración en su fase.

## Correos temporales (Cloudflare Email Routing)

1. En Cloudflare → *Email* → *Email Routing*, activa el dominio `mexicanland.net`.
2. Crea un Worker con `deploy/cloudflare-email-worker.js` (`npm i postal-mime`, `wrangler deploy`).
3. En el Worker: variable `MI_SETUP_URL = https://setup.mexicanland.net` y secreto `MAIL_INBOUND_SECRET` (el **mismo** valor que en `/opt/mi-setup/.env`; genera uno con `openssl rand -hex 32`).
4. En *Email Routing → Routes*, la regla **catch-all** envía a ese Worker.
5. En la app, **Seguridad → Correos temporales → Dirección** crea `alias@mexicanland.net`. Los correos se borran a las 24 h salvo los que marques con **Guardar**.

## VPN (WireGuard)

1. El script del VPS ya configura `wg0` (10.66.66.0/24, 51820/udp) y `/usr/local/sbin/mi-setup-wg`.
2. Ejecuta una vez como root `bash deploy/host-install.sh` (el script del VPS puede hacerlo): instala el servicio `mi-setup-wg-agent` que crea `/run/mi-setup/wg.sock`.
3. En la app, **Seguridad → VPN → Dispositivo**: escribe un nombre; la app genera las llaves y te muestra un QR y un `.conf` **una sola vez**.
4. En el celular: app **WireGuard** → `+` → *Escanear desde código QR*. En Windows: WireGuard → *Importar túnel desde archivo*.
5. Activa o desactiva el túnel desde la app de WireGuard ("Abrir WireGuard").

## IA asistente

1. Pon `ANTHROPIC_API_KEY` en `/opt/mi-setup/.env` y vuelve a desplegar.
2. Abre el botón flotante (destello) o el apartado **IA**. Pide algo: "recuérdame renovar el dominio el viernes a las 10".
3. La IA responde con **propuestas**. Revisa el detalle y toca **Aprobar** (o **Rechazar**). Nada se ejecuta sin ese toque.
4. Si la propuesta es peligrosa (comando destructivo, apagar a la fuerza) se pide escribir `EJECUTAR` y tu contraseña o huella.
5. En **IA → Pendientes / Historial** ves la cola; el gasto del mes aparece arriba. Todo queda en el registro de actividad.

## Redes y streams

URL de retorno (pégala en cada portal de desarrolladores): `https://setup.mexicanland.net/api/redes/oauth/<plataforma>/callback`, con `<plataforma>` = `twitch`, `youtube`, `kick` o `x`. En local: `http://localhost:3000/api/redes/oauth/<plataforma>/callback`.

| Plataforma | Dónde crear la app | Permisos |
|---|---|---|
| Twitch | dev.twitch.tv → Your Console → Applications | `channel:manage:broadcast` |
| YouTube | console.cloud.google.com → YouTube Data API v3 → credenciales OAuth (aplicación web) | `https://www.googleapis.com/auth/youtube` |
| Kick | kick.com → Settings → Developer | `user:read channel:read channel:write` |
| X | developer.x.com → proyecto con OAuth 2.0 (cliente confidencial) | `tweet.read tweet.write users.read offline.access` |

1. Pon las variables en `/opt/mi-setup/.env`, despliega y entra a **Redes → Streams** o **X** → **Conectar** (pide contraseña o huella). Autoriza en el navegador y vuelve a la app.
2. Streams: cambia título y juego (en YouTube solo el título de la transmisión en vivo o programada).
3. X: antes de publicar o leer menciones se muestra el costo estimado y hay que confirmarlo.
4. Discord: crea un bot en discord.com/developers, invítalo a tu servidor con permiso de enviar mensajes y pon `DISCORD_BOT_TOKEN`. Las menciones masivas se desactivan siempre.
5. La IA puede redactar un post, un mensaje o un cambio de título: aparece como propuesta y solo se publica al tocar **Aprobar**.

## Novedades

- **Clima:** busca tu ciudad (Open-Meteo, sin clave). Cada usuario guarda la suya.
- **Ofertas:** CheapShark (sin clave); filtra por tienda y precio máximo.
- **Precios (RAM):** agrega la URL del producto y el selector CSS del precio (en el navegador: clic derecho → Inspeccionar). Se revisa cada 3 horas y, si cambia, llega un push. Si una tienda falla se muestra el error y se reintenta después. Solo se permiten URLs públicas (no la red interna).

## Control remoto (RustDesk)

En el VPS el script ya levanta hbbs/hbbr en `rd.mexicanland.net`. La clave pública está en el volumen de hbbs (`id_ed25519.pub`); ponla en `RD_PUBLIC_KEY` para verla en la app.

1. En cada dispositivo instala RustDesk → Ajustes → Red → **Servidor de ID** `rd.mexicanland.net`, **Servidor de relay** `rd.mexicanland.net`, **Clave** = contenido de `id_ed25519.pub`.
2. En la PC pon una **contraseña permanente** (Ajustes → Seguridad).
3. En Mi Setup → **Control remoto** → Agregar equipo: ID, contraseña (se guarda cifrada) y, opcionalmente, el dispositivo vinculado para ver si la PC está encendida.
4. **Conectar** pide huella o contraseña, copia la contraseña (se borra del portapapeles a los 20 s) y abre `rustdesk://<ID>`. Si no se abre, instala RustDesk y repite el paso 1.

## Cuentas y permisos

Solo la cuenta maestra. **Seguridad → Cuentas y permisos → Nueva cuenta**: correo, nombre, contraseña inicial (mín. 12) y nivel por módulo (Sin acceso, Ver, Editar, Administrar). Los apartados solo-maestra (bóveda, 2FA, VPS, control remoto, auditoría, cuentas…) no se pueden otorgar. Desactivar corta sus sesiones al momento; las cuentas no se borran para conservar el historial. Cada cambio pide contraseña o huella.

## Registro de actividad

**Seguridad → Registro de actividad**: filtra por módulo, acción, actor (usuario, IA, sistema) y resultado. Es de solo inserción (nadie puede editarlo ni borrarlo). **Exportar CSV** pide reautenticación.

## Navegador privado

En la app de PC: **Seguridad → Navegador privado** (o menú Ver / bandeja). Ventana aislada en memoria: al cerrarla se borra todo. Bloquea rastreadores conocidos y niega cámara, micrófono, ubicación y notificaciones. No oculta tu IP: usa la VPN para eso.
