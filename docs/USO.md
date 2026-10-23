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

## Correos temporales (Cloudflare Email Routing)

1. En Cloudflare → *Email* → *Email Routing*, activa el dominio `mexicanland.net`.
2. Crea un Worker con `deploy/cloudflare-email-worker.js` (`npm i postal-mime`, `wrangler deploy`).
3. En el Worker: variable `MI_SETUP_URL = https://setup.mexicanland.net` y secreto `MAIL_INBOUND_SECRET` (el **mismo** valor que en `/opt/mi-setup/.env`; genera uno con `openssl rand -hex 32`).
4. En *Email Routing → Routes*, la regla **catch-all** envía a ese Worker.
5. En la app, **Seguridad → Correos temporales → Dirección** crea `alias@mexicanland.net`. Los correos se borran a las 24 h salvo los que marques con **Guardar**.

## VPN (WireGuard)

1. Sube la versión nueva del código al VPS (el `.gz`).
2. Ejecuta una vez como root `bash /opt/mi-setup/app/deploy/host-install.sh` y luego `docker restart misetup-core`: instala WireGuard (`wg0`, red 10.8.0.0/24, puerto 51820/udp; si ya tienes `/etc/wireguard/wg0.conf` lo reutiliza), el ayudante `/usr/local/sbin/mi-setup-wg` y el servicio `mi-setup-wg-agent` que crea `/run/mi-setup/wg.sock`. La dirección pública que reciben los dispositivos está en `/etc/mi-setup/wg.env`.
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

## Versión 2: qué hay de nuevo y dónde

- **Ajustes** (pestañas): Cuenta (nombre, foto, contraseña), Apariencia (tema, fuente, zoom, fondo), Terminal (tema, letra), Voz e IA (modelo y voz), Seguridad, y **Servicios y claves** para poner las claves de API sin tocar el VPS (solo la cuenta maestra).
- **Terminal**: pega con Ctrl+V o clic derecho; escribe `/nombre` en la barra de abajo para un comando guardado; historial a la izquierda.
- **Gestor de contraseñas**: pestañas Mis contraseñas, Generador (no necesita abrir la bóveda) e Historial (últimas 10 contraseñas generadas, cifradas).
- **Cuentas y permisos → Roles**: roles tipo Discord (Fundador y Dev ya creados) con color y permisos.
- **IA**: adjunta fotos, PDF o archivos de texto; dicta con el micrófono; elige el modelo abajo del chat; la voz se configura en Ajustes.
- **Novedades**: clima con "Usar mi ubicación" y modo tiempo real, buscar juegos en tiendas (Steam, Epic, Eneba, G2A…), juegos gratis, y vigilante de RAM con guía y precio objetivo.
- **Nuevos apartados**: Noticias, Cripto, Inversiones y Cambio de monedas.
- **Discord**: tarjetas con vista previa, leer/editar/borrar/fijar mensajes, reacciones y lista de servidores. Para leer el texto de los mensajes activa *Message Content Intent* en discord.com/developers → tu app → Bot.
- **Inicio**: "Este equipo" con las características de la PC o del celular y su uso en vivo.
- Cada apartado tiene el botón **¿Cómo se usa?** arriba a la derecha.

## Versión 0.3: qué hay de nuevo

- **Terminal que no se corta**: si cambias de pantalla, de app o pierdes señal, el comando sigue corriendo en el servidor (hasta 30 minutos sin nadie mirando) y se retoma solo al volver, con lo último que salió. Botón **2FA** en la barra de pestañas: abre tus códigos de la bóveda y, al tocar uno, lo escribe en la terminal (útil cuando un script como `mexicanland-vault.sh` pide el código).
- **Chat**: botón **Privado** (elige otra cuenta y hablan solo ustedes dos) y **Grupo** (nombre y miembros). En un grupo, **Opciones del grupo** permite renombrarlo, agregar personas o salirte (si sale el último, el grupo se borra).
- **Tutorial de bienvenida**: la primera vez que entra una cuenta, un recorrido explica cada apartado que puede usar. Se repite en **Ajustes → Cuenta → Ver tutorial otra vez**.
- **Otra persona con la misma app**: ver `docs/OTRA-INSTALACION.md` (cuenta dentro de tu app o instalación propia). Las apps de celular y Windows tienen **Cambiar servidor** (en el inicio de sesión del celular y en **Archivo** de Windows).

### IA gratis local (Llama en tu VPS)

Para cosas básicas sin gastar los 10 USD. Corre en tu VPS con Ollama (no publica puertos).

1. En `/opt/mi-setup/.env` agrega:

   ```bash
   COMPOSE_PROFILES=ia-local
   OLLAMA_URL=http://misetup-ollama:11434
   OLLAMA_MODEL=llama3.2:3b
   ```

2. Despliega (`docker compose --env-file /opt/mi-setup/.env up -d --build`) y descarga el modelo una vez:

   ```bash
   docker exec misetup-ollama ollama pull llama3.2:3b
   ```

3. Úsala eligiendo **Llama local (gratis)** en el selector de modelo del chat, o deja que entre sola: cuando se llega al tope mensual (o no hay clave de Claude) responde la IA local y aparece un aviso.

La IA local **solo conversa**: no propone acciones ni ve fotos/PDF. `llama3.2:3b` necesita ~3 GB de RAM libres; con más RAM puedes usar `qwen2.5:7b` (mejor en español). Responde más lento que Claude porque usa el procesador del VPS.

### La IA ayuda con errores de servidores

Dile qué falla ("el core no arranca", "el servidor de Minecraft se cae"). La IA propone **revisiones de solo lectura**: estado general, contenedores de Docker, últimos registros de un contenedor, servicios con fallas, errores del sistema, puertos, memoria, red, leer un archivo de configuración o código, y el estado de un servidor de Pterodactyl. Como siempre, nada corre hasta que tocas **Aprobar**. Al ejecutarse, en la tarjeta aparece **Ver salida** y **Analizar con la IA**, que le pasa el resultado para que te explique qué está mal y cómo arreglarlo (el arreglo vuelve a ser una propuesta). Nunca lee archivos de secretos (`.env`, llaves, contraseñas).

### Pterodactyl en el mismo VPS que Mi Setup

Caddy (de Mi Setup) ya ocupa los puertos 80 y 443, así que el instalador del panel **no** puede sacar su propio certificado. Caddy lo hace por él:

1. Instala o reinstala el panel **sin SSL / sin Let's Encrypt** y deja su Nginx escuchando en un puerto interno, por ejemplo `8081` (en `/etc/nginx/sites-available/pterodactyl.conf`: `listen 8081;`, y `sudo systemctl restart nginx`). No uses el 8080: es de Wings.
2. Crea el sitio para Caddy (vive fuera de la app y no se borra al actualizar):

   ```bash
   mkdir -p /opt/mi-setup/caddy
   printf 'panel.mexicanland.net {\n\treverse_proxy host.docker.internal:8081\n}\n' > /opt/mi-setup/caddy/panel.caddy
   ```

3. Aplica: `cd /opt/mi-setup/app && docker compose --env-file /opt/mi-setup/.env up -d` (y si ya estaba arriba: `docker exec misetup-caddy caddy reload --config /etc/caddy/Caddyfile`).
4. En el `.env` del panel (`/var/www/pterodactyl/.env`) pon `APP_URL=https://panel.mexicanland.net` y agrega `TRUSTED_PROXIES=*`.
5. Si usas `ufw`, deja que Docker llegue al puerto: `ufw allow from 172.16.0.0/12 to any port 8081`.

## Versión 0.4: qué hay de nuevo

- **Descargar apps** (Ajustes → Descargar apps): baja el APK o el instalador de Windows desde tu servidor, o copia el enlace para mandárselo a alguien. Para publicarlos, sube los archivos a `/opt/mi-setup/descargas/` del VPS (nombres que terminen en `.apk` o `.exe`).
- **APK firmado**: la app de Android ya se firma siempre con la misma llave (`C:\Users\<tú>\.mi-setup\misetup-release.jks`; **respáldala**: sin ella las actualizaciones no se instalan encima). Al pasar de la versión anterior (firmada en modo prueba) hay que **desinstalar una vez** la app vieja; tus datos están en el servidor y no se pierden.
- **Editor de archivos** (VPS → Archivos): el ícono de lápiz con hoja abre archivos de texto de hasta 1 MB. Al guardar deja una copia `.bak` con lo anterior.
- **Alertas de CPU** (VPS → Alertas de caída): además de RAM y disco. Al tocar el aviso en el celular se abre la IA con la pregunta lista para diagnosticar (no se envía sola).
- **Notificaciones del chat**: los mensajes privados y de grupo avisan a los demás miembros; a la cuenta maestra también le llega push aunque la app esté cerrada.
- **Instalador para otra persona**: `deploy/instalar.sh` (ver `docs/OTRA-INSTALACION.md`).

## Versión 0.5: qué hay de nuevo

Apartados nuevos en el menú (categorías **Herramientas**, **Entretenimiento** y **Casa**; lo demás va en su categoría de siempre). Cada uno tiene su guía en el botón **?** de la pantalla.

- **Herramientas**: QR con tu logo y colores (para la pastelería), emojis con mensaje oculto (solo se decodifica, nunca se ejecuta), vista previa de HTML/CSS, **acortador de enlaces** (`/l/codigo`), **compartir archivos** tipo Mega (`/s/codigo`, hasta 2 GB, con contraseña, días y límite de descargas; se borran solos al vencer), **portapapeles** compartido entre tus equipos, **documentos PDF** (unir, páginas, fotos a PDF, firmar) y **convertidor** (imágenes, audio/video con ffmpeg en el servidor, Excel/CSV/JSON).
- **Principal**: **calendario** (tus eventos + recordatorios, cobros, suscripciones y vencimientos), **mis finanzas** (movimientos, presupuestos, suscripciones con aviso antes del cobro, importar y exportar tu Excel) y **notas tipo Notion** (subpáginas, íconos, casillas y tablero de tareas; son las mismas del bloc de notas).
- **IA creativa**: biblioteca de prompts con variables, quitar fondo de fotos (en tu equipo) y resumir/traducir páginas web.
- **Modo streamer**: chats de Twitch y Kick juntos en vivo.
- **Mi casa**: prueba de velocidad contra tu VPS, cámaras (MJPEG o go2rtc) y accesos rápidos (módem, Alexa).
- **Entretenimiento**: **películas y series** (buscar, dónde verla en México, siguiente capítulo, lista "por ver"), **música** (control de Spotify y tu música subida) y **mis videos** (tu YouTube privado con "seguir donde te quedaste").
- **Seguridad del servidor** (VPS): calificación y arreglos de un botón (firewall ufw, fail2ban, actualizaciones automáticas, abrir/cerrar puertos). Todo pide tu contraseña o huella y escribir el nombre del servidor; el puerto de SSH nunca se cierra. En **Archivos** hay un botón para **enviar un archivo a otro servidor** (home lab ↔ VPS).
- **Ciberseguridad**: revisar tu sitio (certificado, cabeceras, SPF/DMARC), saber si una contraseña se filtró (sin enviarla) y lecciones.
- **Respaldos**: descargar los respaldos de la base (solo maestra) y **Descargar mis datos** (cada cuenta). Script nuevo `deploy/respaldo.sh` (base + archivos subidos, guarda 14 días). Para que corra cada día a las 4:15:

```bash
chmod +x /opt/mi-setup/app/deploy/respaldo.sh
(crontab -l 2>/dev/null; echo "15 4 * * * /opt/mi-setup/app/deploy/respaldo.sh >> /var/log/misetup-respaldo.log 2>&1") | crontab -
```

- **Cuentas**: verificación en dos pasos para cualquier cuenta (Ajustes → Mi cuenta), **pasar la cuenta maestra** a otra persona (necesita su 2FA activa y escribir su correo) y **eliminar cuentas** que no sean la maestra.
- **Personalizar**: cada instalación cambia el nombre de la app, el logo y el fondo (Ajustes → Apariencia).
- **Novedades**: juegos gratis y ofertas con páginas, clima de 10 días y estadísticas de Steam ("¿me corre el juego?").
- **Actualizaciones**: la app de PC se actualiza sola; la de Android muestra un aviso y baja el APK nuevo (Android no deja instalar sin preguntarte). Ajustes → Descargar apps → Actualizaciones.
- **Widget de Android**: mantén presionada la pantalla de inicio → Widgets → Mi Setup (reloj, fecha y accesos a IA, notas, finanzas, agenda y VPS). Al mantener presionado el ícono de la app también salen accesos.

### Claves nuevas (opcionales; sin ellas la pantalla dice "Falta configurar")

Se ponen en Ajustes → Servicios y claves (o en el `.env`):

| Variable | Para qué | Cómo conseguirla |
|---|---|---|
| `TMDB_API_KEY` | Películas y series | Cuenta gratis en themoviedb.org → Ajustes → API → "API Key" (o el token de lectura largo). |
| `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` | Controlar Spotify | developer.spotify.com → Create app → Redirect URI `https://TU-DOMINIO/api/musica/spotify/callback` (y `misetup://spotify` para el celular) → Web API y Android. Controlar la música necesita Premium. Ver «Música con Spotify» abajo. |
| `ARCHIVOS_DIR` | Dónde se guardan los archivos subidos | Ya viene en Docker: `/data/archivos` (volumen `misetup_archivos`). |

### Publicar la versión 0.5 en el VPS

La imagen de Docker ahora incluye **ffmpeg** (convertidor) y un volumen nuevo para archivos; `docker compose up -d --build` lo crea solo. Para que la app de PC se actualice sola sube **los tres** archivos de `apps/desktop/release/` a `/opt/mi-setup/descargas/`: `MiSetup-0.5.0.exe`, `MiSetup-0.5.0.exe.blockmap` y `latest.yml`; y el `MiSetup.apk` para Android.

### Lo que no se pudo (y por qué)

- **Ícono del celular distinto por persona**: Android no deja cambiar el ícono de una app instalada desde la propia app; sí cambian el nombre, logo y fondo dentro de la app.
- **Alexa**: Amazon no deja controlarla desde apps de otros (solo con "skills" propias); hay accesos directos a su página.
- **Chat de YouTube** en modo streamer: su API cobra por cuota; ábrelo en otra ventana.
- **Panel para clientes de MexicanLand** (que ellos entren a ver sus servidores): queda para una versión siguiente; por ahora tú los administras en Clientes y cobros.

## Versión 0.5.1

- **Terminal de tu PC** (solo app de Windows): en VPS → Terminal se abre **PowerShell** por defecto y la tarjeta *Esta PC* abre PowerShell 7 (si lo tienes), PowerShell o CMD. Las pestañas siguen vivas aunque cambies de pantalla; la X las cierra. Los comandos guardados (`/nombre`) también funcionan ahí; lo que escribes en tu PC no se guarda en el historial del servidor.
- **VPN**: `deploy/host-install.sh` ahora instala WireGuard completo (ver sección VPN).

## Versiones 0.6 y 0.7

- **Novedades en un solo lugar**: clima, noticias, compras, ofertas, juegos gratis, Steam, vigilar precios, cripto, inversiones y cambio de monedas son pestañas de Novedades (ya no salen sueltas en el menú; sus enlaces viejos siguen funcionando).
- **Compras**: busca un producto y ábrelo en Mercado Libre, Amazon, Walmart, Liverpool, Coppel, Cyberpuerta, AliExpress o eBay. Con una app gratis de Mercado Libre (`MERCADOLIBRE_CLIENT_ID` y `MERCADOLIBRE_CLIENT_SECRET`, de developers.mercadolibre.com.mx) los productos salen dentro de Mi Setup con botón **Vigilar precio**.
- **Nano Banana** (IA creativa → Crear imágenes): crea imágenes desde texto o edita/combina hasta 3 fotos. Necesita `GEMINI_API_KEY` (aistudio.google.com → Get API key). Google puede cobrar por imagen según tu plan.
- **Películas**: tráiler dentro de la app, opciones **gratis con anuncios** en "dónde ver", la tarjeta **Ver gratis y legal** (Pluto TV, Tubi, ViX, Canela, Plex, YouTube) y **Ver ahora** si ya la subiste a Mis videos.
- **Programación → Código** (app de Windows): editor tipo VS Code con tus carpetas, plantillas (plugin de Paper/Spigot, mod de Fabric, datapack, web, Python, Node), comprimir/descomprimir y **Compilar** en su terminal. Para plugins y mods instala Java 21 (Microsoft) y Gradle con un botón, una sola vez (se guardan dentro de Mi Setup, ~300 MB). Solo toca carpetas que tú elijas y borrar manda a la Papelera.
- **Programación → Ejercicios**: 30 retos (10 fáciles, 10 medios, 10 difíciles) en JavaScript, Python y HTML/CSS. Se califican solos, tienen pistas y "Pedir ayuda a la IA". Tu avance se guarda en tu cuenta. Python se descarga la primera vez (unos segundos).
- **vpsm**: si mueves `mexicanland-vault.sh` de carpeta, al abrirlo una vez (`/root/Sh/mexicanland-vault.sh`) arregla solo los lanzadores `vpsm` y `vpsm-cron`.

## Versiones 0.8 y 0.9

### Servidores en mi PC (Host local)

Funciona en la app de Windows. Menú → Host local → Servidores en mi PC → **Nuevo servidor**: eliges Paper, Purpur, Folia, Fabric, Quilt, Forge, NeoForge, Mohist, Arclight, Vanilla, Velocity o un comando propio, la versión, la RAM y el puerto, y aceptas la EULA de Minecraft. Java se descarga solo.

- **Consola:** iniciar, detener y mandar comandos.
- **Mods / plugins:** busca en Modrinth. Para CurseForge pon `CURSEFORGE_API_KEY` en el `.env` del VPS.
- **Compartir:** usa playit.gg para que tus amigos entren sin abrir puertos.
- **Pasar a mi VPS:** sube el servidor (o solo el mundo) a un servidor de Pterodactyl. Si pesa más de 100 MB, sube `upload_limit` en `/etc/pterodactyl/config.yml` de Wings y reinicia Wings.

### Sitios y apps

Menú → Sitios web → **Nuevo sitio**. Puedes partir de una plantilla o pedírselo a la IA. Después:

1. Arrastra bloques en el editor.
2. Toca **Publicar**.

Cada pestaña sirve para algo:

- **Imágenes:** recortar, quitar el fondo y crear imágenes con IA.
- **Mensajes y pedidos:** los formularios y los pedidos que te mandan.
- **Datos:** tablas para listas en tu sitio.
- **Cuentas:** visitantes que pueden iniciar sesión.
- **Estadísticas:** visitas y clics.
- **Ajustes:** dirección, dominio, SEO, WhatsApp, app instalable, historial y exportar ZIP.

Para que funcionen las direcciones `tusitio.mexicanland.net`:

1. En Cloudflare crea un registro **A** con nombre `*` hacia la IP del VPS, con la **nube gris** (solo DNS).
2. Para un dominio propio, el dueño crea un registro **A** hacia la misma IP y lo escribe en Ajustes.
3. El certificado HTTPS se pide solo la primera vez que alguien abre el sitio.

Caddy **no recarga solo** el Caddyfile: después de actualizar corre `docker compose restart caddy` (o usa el comando completo de actualización de abajo).

### Versión con letra (0.9.0b)

Desde ahora la versión lleva una letra al final:

- **b** = beta: la que estamos probando.
- **a** = la que ya sale al público.

Para cambiarla, edita `"etapa"` en los `package.json` (y `versionName` en `apps/mobile/android/app/build.gradle`). El número (`"version"`) sigue igual porque el instalador de Windows lo necesita así. El celular avisa de actualización también cuando pasa de `0.9.0b` a `0.9.0a`.

### Más programas en «Servidores en mi PC»

- **Plugins:** Paper, Purpur, Folia.
- **Mods:** Fabric, Quilt, Forge, NeoForge.
- **Mods y plugins juntos:** Mohist, Arclight. La pestaña «Mods y plugins» tiene las dos listas.
- **Otros:** Vanilla y Velocity (proxy para unir varios servidores; se configura en `velocity.toml`).

Magma no se agregó: su página de descargas ya no responde y sus últimas versiones son de 2022. Mohist y Arclight hacen lo mismo. Spigot tampoco: hay que compilarlo con BuildTools y sus plugins funcionan igual en Paper o Purpur.


## Versión 0.10.0b

El número queda **0.10.0** y la letra **b** (beta). Incluye todo lo de la 0.9.0b, que no se había subido.

### Arreglos

- **Fotos en el celular:** tu foto de perfil, el logo y el fondo ya se ven en la app de Android (antes buscaban el archivo dentro del propio celular).
- **Control remoto:** en el celular ahora abre RustDesk (`rustdesk://connection/new/ID`). Si no abre, instala RustDesk en el celular.
- **Sitios que no abrían:** el Caddyfile nuevo no se recargaba. El comando de actualización ahora reinicia Caddy, y cada sitio publicado tiene la tarjeta **«¿Abre desde internet?»** que revisa publicación, DNS y HTTPS y te dice qué falta.
- **Pasar a mi VPS** rechazaba el nombre del archivo; corregido.

### Cloudflare (subdominios y dominios)

1. En Cloudflare: perfil → API Tokens → Create Token → plantilla «Edit zone DNS» → tu dominio.
2. Pégalo en Ajustes → Servicios y claves → Cloudflare (`CLOUDFLARE_API_TOKEN`).
3. En el sitio → «¿Abre desde internet?» → **Crear el registro «\*»** (o el de tu dominio propio). Usa la nube gris.

### Mis finanzas

- El concepto se escribe a mano («Préstamo Coppel»…) con sugerencias de lo que ya usaste.
- **Tarjetas:** solo apodo y últimos 4 dígitos. «Pagar» anota el gasto con esa tarjeta, muestra un aviso antes y exige confirmar. Mi Setup **no cobra dinero real**.
- **Tarjetas de prueba:** usan los números públicos de pruebas de Stripe (no sirven para compras reales). Son para probar tus propias páginas.

### Respaldos

«Crear respaldo» (solo cuenta maestra): una carpeta, todo Pterodactyl, la base de Mi Setup, el VPS completo o un servidor de juego. Se guardan en `/opt/mi-setup/respaldos-manuales` y corren en segundo plano. Se pueden descargar y borrar. Necesita más de 2 GB libres.

### Servidores en mi PC desde el celular

La app de Windows sube la lista de tus servidores cada 20 segundos. En el celular los ves y cambias nombre, RAM, puerto y opciones; los cambios se aplican cuando tu PC tiene Mi Setup abierto. Encender y apagar es solo en la PC. Nuevos tipos: Purpur, Folia, Quilt, NeoForge, Mohist, Arclight y Velocity (reinstala el EXE para tenerlos). Magma y Spigot no se incluyen.

### Fondo transparente

Ajustes → «Fondo transparente»: transparencia de los paneles y cuánto se oscurece la imagen.

### Notas

Estilo Discord (`**negrita**`, `__subrayado__`, `||spoiler||`, `-# pequeño`…), fotos, archivos, dibujo a mano y color de la nota.

### Estudio creativo

- **Editor de fotos:** capas, texto, formas, pincel, filtros y recorte; guarda proyectos y exporta PNG, JPG o WebP.
- **Editor de video:** línea de tiempo con cortes, velocidad, volumen, textos y música; exporta en tiempo real en MP4 si el navegador lo permite, o WebM.

### Clips de stream y TikTok

Streams → «Clips y TikTok»: trae tu transmisión por enlace (Twitch, Kick, YouTube) o sube un video; la IA propone momentos por picos de audio con título y hashtags; se cortan con ffmpeg (vertical 9:16, cuadrado u original). Para publicar en TikTok pon `TIKTOK_CLIENT_KEY` y `TIKTOK_CLIENT_SECRET` (developers.tiktok.com; URL de retorno `https://TU-DOMINIO/api/redes/oauth/tiktok/callback`). Mientras TikTok no apruebe tu app solo se publican videos privados. Reconecta Twitch para el permiso `clips:edit`. Las fuentes se borran solas a los 2 días. Usa solo tus propios streams. Si yt-dlp falla, reconstruye: `docker compose build --no-cache core`.

### Bots de Discord

Menú → «Bots de Discord (creador)». En discord.com/developers crea la aplicación, activa *Server Members Intent* y *Message Content Intent*, copia el token y pégalo en «Nuevo bot». Módulos: bienvenida, moderación, niveles, economía, tickets, roles con botones, comandos propios, registros y mensajes programados. Para venderlo: cliente, fecha de vencimiento (el bot se apaga solo) y un **enlace** con el que su dueño lo configura, enciende, apaga y reinicia sin ver tu cuenta ni el token.

### Tienda de hosting (Sitios)

Plantilla «Tienda de hosting»: planes editables, botón «Contratar», instrucciones de pago en Ajustes del sitio, y en Mensajes y pedidos el botón **«Crear cliente y cobro»**. No cobra ni crea servidores solo: tú confirmas el pago y creas el servidor en Pterodactyl.

### Actualizar el VPS

```bash
tar -xzf /root/mi-setup.tar.gz -C /opt/mi-setup/app && cd /opt/mi-setup/app && docker compose --env-file /opt/mi-setup/.env up -d --build --remove-orphans && docker compose --env-file /opt/mi-setup/.env restart caddy
```


## Versión 0.11.0b

### Menú más ordenado

- **Bots de Discord**: «Crear y vender bots» y «Bots en mi VPS» son una sola entrada con pestañas.
- **Negocio y cobros** (en Panel): clientes y cobros, vencimientos, gastos e ingresos e ideas de mejoras, en pestañas.
- **Contraseñas y 2FA** (en Seguridad): gestor de contraseñas, autenticador y correos temporales.
- **Respaldos** pasó a la sección VPS. Nuevo en VPS: **Agentes de IA**.
- Se quitaron la **VPN** y las **tarjetas** de Mis finanzas. Si instalaste la VPN en el VPS, puedes quitarla con `systemctl disable --now wg-quick@wg0 mi-setup-wg-agent` (no afecta a nada más).

### Mis finanzas

- **Gasto con ticket**: foto del ticket → la IA lee tienda, total e IVA → revisas y se guarda con la foto.
- **Pagos divididos**: Netflix, renta… entre varias personas, con su lista, «pagado», «debe» y mensaje para cobrar.
- **Impuestos**: IVA (16 %, 8 %, 0 %), ISR de sueldo (tarifa del art. 96, 2025) y RESICO; IVA del mes según tus tickets. Es orientativo.

### Notas y chat

- Notas de voz, **dictado en vivo** (celular: reconocimiento de Android; navegador: Web Speech; PC: trozos de audio pasados a texto con Gemini, `GEMINI_API_KEY`).
- **Compartir** una nota por el chat, con otras apps (con sus fotos) o con un enlace de solo lectura (`/n/…`, puede vencer).
- Guardar adjuntos en el dispositivo (celular: Documentos/MiSetup).
- **Chat**: fotos, archivos (hasta 25 MB), bloques de código y notas de voz; borrar tus mensajes.

### Servidores, archivos y respaldos

- Mods y plugins con **páginas**; **modpacks de Modrinth** (.mrpack) en Fabric/Quilt/Forge/NeoForge; editar **todo server.properties**. Reinstala el EXE para tenerlo.
- Archivos del VPS: **buscar** por nombre, **organizar** por tipo y **limpiar basura**.
- Respaldos: **restaurar** (aparte o en su lugar) y **automáticos** (diario o semanal, guarda los últimos N).

### Seguridad

- **Alertas de entrada**: aviso cuando entras desde un lugar nuevo (cuenta maestra) y, si lo activas por servidor, cada vez que alguien entra por SSH.
- Seguridad del servidor: swap, earlyoom (contra cuelgues), límites de logs, SSH solo con llave y «Pedir ayuda a la IA».
- Ciberseguridad: sesiones abiertas, entradas recientes, **cuentas de Gmail** (varias): filtraciones, correos peligrosos y enviar revisando antes.
  - Activa la **Gmail API** en tu proyecto de Google (el mismo de YouTube) y agrega la URL de retorno `https://TU-DOMINIO/api/google/correo/callback`. Mientras la app esté en «Prueba», agrega tu correo como usuario de prueba (Google pide volver a conectar cada 7 días en ese modo).
- Gestor de contraseñas: **abrir con huella (celular) o PIN (PC)**, **revisar** contraseñas filtradas/repetidas/débiles y **autocompletar** en otras apps de Android (como Samsung Pass).
- **Agentes de IA** en el VPS: Claude Code, Gemini CLI, Aider, Llama/Qwen locales, Open WebUI, n8n, Flowise, AnythingLLM y Langflow con un botón; más en GitHub con ayuda de la IA.

### Novedades e IA

- Clima hora por hora; noticias **Populares** y fuentes sugeridas; compras con **foto** y muchas tiendas; ofertas en tu **moneda** y **Steam por región**; Steam populares/con más gente/mejor valorados/para ti; vigilar precios en más tiendas; **explorar** cripto y acciones por páginas (con la calificación de analistas, sin ser recomendación).
- IA: **Deudas y negociaciones** (derechos en México, plan y mensaje humano), **detector de texto de IA** y **hacer más natural**.

### Cuentas, claves y código abierto

- Cada persona puede poner **sus propias claves** (Ajustes → Mis claves) y compartirlas con aviso. La cuenta maestra decide por persona si usa las del servidor y si puede ver Servicios y claves.
- Las apps recuerdan **varios servidores** de Mi Setup con su sesión.
- El proyecto queda listo para publicarse como **código abierto** (licencia MIT, `README.md`, `CONTRIBUTING.md`, `.env.example` completo). Nadie recibe tus claves: cada instalación pone las suyas.

### Arreglos

- El fondo de pantalla se **adapta** (en PC ya no se corta) y puedes poner uno para la PC.
- Los botones flotantes del celular se **esconden al escribir**, se pueden **mover** y apagar (Ajustes → Apariencia).
- Tablero de tareas: tocar una tarea abre sus opciones; en PC se arrastra entre columnas.
- Control remoto: opción oficial **Escritorio remoto de Chrome**.
- Sitios: se acomodan solos en el celular; al **borrar** un sitio se borra su DNS en Cloudflare (solo lo que creó Mi Setup).

### Actualizar el VPS

```bash
tar -xzf /root/mi-setup.tar.gz -C /opt/mi-setup/app && cd /opt/mi-setup/app && docker compose --env-file /opt/mi-setup/.env up -d --build --remove-orphans && docker compose --env-file /opt/mi-setup/.env restart caddy
```

## Versión 0.11.1

- **Descargas en el celular**: todos los botones de descargar (fotos a PDF, convertidor, editor de fotos y video, QR, respaldos, «Descargar mis datos», bóveda, adjuntos) guardan en **Documentos/MiSetup**. Si Android no deja, se abre la hoja de compartir para guardarlo en Archivos o Drive. Compartir (pagos divididos, mensajes de la IA) usa la hoja de compartir del sistema.
- **Huella y PIN**: el PIN o la huella confirman cualquier acción, también las sensibles (5 PIN mal seguidos cierran la sesión). Si tienes la huella activada, el diálogo la pide solo; en el celular, al confirmar con PIN puedes activarla ahí mismo. La huella se detecta con la librería nueva de Android (hay que reinstalar el APK).
- **Sitios**: al publicar se crea solo el registro DNS del sitio en Cloudflare (si no lo cubre ya el comodín «*») y se borra al borrar el sitio. «¿No abre? Revisar» crea el registro de ese sitio.
- **Pterodactyl → Administración**: Servidores (crear, suspender, eliminar), Cuentas (ver, crear, eliminar), Nodos (crear, puertos, config de Wings), Eggs (ver e importar .json) y Blueprint (ver extensiones y quitarlas). Importar eggs y Blueprint se hacen por SSH en el VPS del panel (`/var/www/pterodactyl`).
- **Agentes como IA del asistente**: en el selector de modelo salen los modelos de Ollama que tengas descargados y Claude Code / Gemini CLI instalados en el VPS (VPS → Agentes; entra una vez con `claude` o `gemini` en la terminal). Los agentes solo responden: no corren comandos ni editan archivos, y no cuentan para el tope de IA.
- **Pagos divididos**: «Tomar de» un gasto que ya anotaste o de una suscripción que ya tienes.
- **Respaldo de la base**: si sale «Atrasado», el botón «Respaldar ahora y cada día» corre `deploy/respaldo.sh` y lo deja en el cron del VPS (4:15).
- **Servidores VPS con llave privada** (de 0.11.0b): la llave se valida al guardarla y «Probar» dice si la rechazaron o si no hubo conexión.

## Versión 0.11.2b

### Arreglos (fase 1)

- **Huella** con el aviso propio de Android (como el del banco); la bóveda abre sola con huella o PIN. Hay que reinstalar el APK.
- El fondo ya no sale doble al abrir el teclado; el chat de la IA baja directo al último mensaje.
- **Pagos divididos**: editar el pago y sus personas, quitar o editar una persona.
- Organizar archivos del VPS: si ya existe, agrega -2, -3… en vez de no moverlo.
- Bloc de notas: «Guardar todo» baja un solo .zip con la nota y sus adjuntos.
- **Descargas**: solo la versión nueva y las 2 anteriores. En el VPS, `deploy/limpiar-descargas.py` borra las viejas de `/opt/mi-setup/descargas`.
- Listas largas con páginas 1, 2, 3…; selector propio en toda la app; vista previa HTML en ventana flotante.

### Mis finanzas (fase 2)

- Resumen con los gastos de la semana (lunes a domingo) y gráfica de gastos, ingresos y ahorro.
- Pagos divididos: partes iguales, por monto o por porcentaje; enlace de solo lectura e imagen con la lista de cada persona.
- **Rendimientos**: calculadora con tasas de CETES y bancos (Nu, Mercado Pago, Ualá, Revolut, Klar, Hey, BBVA, BanCoppel, GBM). CETES sale de Banxico: pon `BANXICO_TOKEN` (opcional) en el `.env` o en Ajustes → Servicios y claves; sin él se usa la última tasa guardada. Se revisan solas cada día y avisan si no se pudieron actualizar.
- Acciones y cripto: ficha completa y botones a sitios confiables para invertir.

### Pterodactyl, VPS e IA (fase 3)

- **Blueprint**: subir un `.blueprint` (se revisa su `conf.yml` y la compatibilidad) y tienda de extensiones gratis; todo con confirmación y PIN o huella.
- Seguridad del servidor: reiniciar el VPS, Docker y Mi Setup; encender, apagar o reiniciar servicios y contenedores (SSH y Mi Setup protegidos).
- IA gratis: bajar y borrar modelos de Ollama.
- Chat de la IA estilo Claude: proyectos con instrucciones, memoria, skills (`SKILL.md`), mover, renombrar, exportar e importar chats. Migración **0024**.

### Herramientas, estudio y host local (fase 4)

- QR con puntos de figuras y revisión de que se lea; firmar PDF o fotos donde quieras.
- Editor de fotos estilo Photoshop y editor de video con transiciones, efectos, 480p a 4K y 24/30/60 fps.
- Servidores en mi PC: «Semillas» (mapa de biomas) y servidor desde un modpack. Código: abrir y guardar archivos del equipo.

### Sitios y apps (fase 5)

- Editor usable en el celular; los botones piden a dónde llevan (página, enlace o archivo).
- **Exportar todo** (para otro Mi Setup) e **Importar sitio** (.zip de Mi Setup, .zip con .html o un .html suelto). Lo importado llega como borrador.

### Idiomas, tutorial y edición pública (fase 6)

- La interfaz se traduce a **inglés, portugués, francés, alemán e italiano** (Ajustes → Apariencia, o al entrar). Para ver textos sin traducir: `pnpm --filter @mi-setup/ui i18n`.
- El tutorial enseña las **novedades** de cada versión, solo de lo que la persona tiene permitido.
- **Edición** (variable `EDICION` del `.env`, se usa al compilar la imagen):
  - `personal` (la tuya, la de siempre): todo.
  - `publica`: la que se comparte. No trae Pterodactyl, Redes y streams, Discord, bots, Servidores en mi PC, Mi casa ni Control remoto (ni su código). Para compilar las apps públicas: `pnpm --filter @mi-setup/desktop dist:publica` y `pnpm --filter @mi-setup/mobile sincronizar:publica`.

### Sitio oficial, demo y comunidad (fase 7)

- **Sitio oficial**: al arrancar, si eres la cuenta maestra, se crea en Sitios y apps «Mi Setup (página oficial)» con la dirección `misetup.mexicanland.net`, **sin publicar**. Tiene Inicio, Funciones, Descargas, Instalar, Wiki, Demo y Comunidad, con el aviso «Hecho con IA · El autor no pide créditos · Esta es la página oficial». Revísalo en el editor y toca **Publicar** cuando quieras (crea el DNS solo, como cualquier sitio). Mientras no lo edites, se regenera con cada versión nueva (wiki y capturas al día); si lo editas, ya no se toca.
- Solo muestra cosas de la edición pública. Las capturas salen de la demo (`apps/ui/scripts/capturas-sitio.mjs`) y la wiki de la ayuda de la app (`apps/core/scripts/wiki-sitio.ts`).
- **Demo**: copia de la app (edición pública) con datos de ejemplo, sin servidor ni VPS. Se compila sola en la imagen de Docker en cada versión y se ve en `/demo` del sitio oficial. Nada se guarda. Para regrabar sus datos: `apps/core/scripts/demo-servidor.ts` y `apps/ui/scripts/demo-grabar.mjs`.
- **Descargas** en el sitio: bloque «Descargas» (la nueva y las 2 anteriores de `/opt/mi-setup/descargas`). Solo funciona en sitios de la cuenta maestra.
- **Comunidad** (cualquier sitio, en Ajustes del sitio → Comunidad): los visitantes suben su versión (enlace de GitHub o .zip de hasta 50 MB) y comentan, con nombre o como anónimos. Se bloquean insultos y groserías (aunque los escriban con números o letras repetidas). El nombre oficial (**JokeerYT**) está reservado: solo sale cuando respondes desde la pestaña «Comunidad», con la marca «Oficial». Los proyectos esperan tu aprobación.
- **Antivirus (ClamAV)**: cada .zip y cada repositorio de GitHub se revisa antes de poder aprobarlo; si trae virus, el archivo se borra. Usa ~1 GB de RAM, por eso se enciende aparte: agrega `COMPOSE_PROFILES=comunidad` al `.env` (con la IA local: `COMPOSE_PROFILES=ia-local,comunidad`). La primera vez tarda unos minutos en bajar su base de virus. Sin él, los proyectos quedan «Sin revisar» y no se pueden aprobar.
- Migración **0025** (comunidad). Las migraciones 0023, 0024 y 0025 se aplican solas al arrancar.

### Actualizar el VPS

Igual que siempre (`docker compose --env-file /opt/mi-setup/.env up -d --build --remove-orphans`). Después sube `MiSetup-0.11.2.exe`, su `.blockmap`, `latest.yml` y `MiSetup-0.11.2b.apk` a `/opt/mi-setup/descargas/` y corre `python3 /opt/mi-setup/app/deploy/limpiar-descargas.py`.

## Versión 0.11.3b

- **Bloc de notas**: «En vivo» también en el celular vertical (arriba escribes, abajo ves la página). La nota de voz ya no pide permiso cuando ya se dio (faltaba el permiso `MODIFY_AUDIO_SETTINGS` en Android: hay que instalar el APK nuevo).
- **Fondo de pantalla**: al girar el celular sigue llenando la pantalla (en «Automático» los celulares siempre llenan; la imagen completa con relleno queda para la PC).
- **IA**: crear o editar un proyecto en el celular ya no queda detrás de la lista de chats.
- **Páginas 1, 2, 3…**: al cambiar de página la pantalla se queda donde estaba.
- **Semillas**: ver el Nether ya no da el error «Cannot read properties of undefined».
- **Encendido y servicios**: el buscador se ve con el celular vertical.
- **Letras más legibles** (Ajustes → Apariencia): contraste de las explicaciones, color de las letras (tema, blanco, crema, celeste o negro) y sombra suave. Las barras de transparencia ya se mueven fluidas (se guarda solo lo último, un momento después de soltar).
- **Vigilar precios**: las páginas grandes (Amazon y otras) se leen hasta 10 MB; si pasan, se usa lo leído en vez de dar «La página es demasiado grande».
- **Logo nuevo** en la web, Windows y Android (`assets/branding/icon.png`, generado con `pnpm branding`).
- **iPhone (base)**: la web se instala desde Safari → Compartir → **Agregar a inicio** y abre a pantalla completa (manifest y etiquetas de Apple). Instrucciones en Ajustes → Descargar apps → iPhone y iPad. La app nativa queda preparada para hacerse en una Mac (ver abajo).

### iPhone como app nativa (para después, necesita una Mac)

En una Mac con Xcode:

```bash
pnpm install
pnpm --filter @mi-setup/mobile ios:preparar
pnpm --filter @mi-setup/mobile ios:sincronizar
pnpm --filter @mi-setup/mobile ios:abrir
```

Para que otras personas la instalen hace falta una cuenta de Apple Developer (99 USD al año) y publicarla en TestFlight o la App Store. La huella (Face ID) y las notificaciones necesitan ajustes propios de iOS.

## Música con Spotify (0.11.4b)

Cada dueño de Mi Setup usa su propia app de Spotify (en modo desarrollo Spotify deja hasta 5 personas por app).

1. Entra a developer.spotify.com → **Create app**.
2. En **Redirect URIs** agrega `https://TU-DOMINIO/api/musica/spotify/callback` y, para el celular, `misetup://spotify`.
3. Marca **Web API** y **Android**. En Android pon el paquete `net.mexicanland.misetup` y la huella SHA1 de la llave con la que firmas el APK (`keytool -list -v -keystore TU-LLAVE`).
4. Copia el Client ID y el Client Secret en **Ajustes → Servicios y claves** (`SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET`). El secret es opcional: sin él la conexión usa solo PKCE.
5. En **Música** toca **Conectar Spotify** y acepta.

Qué hace la pantalla:

- **Dónde suena** (botón de la laptop): pasa la música entre tu celular, la PC (con la app oficial de Spotify abierta), consolas y bocinas con Spotify Connect.
- **Varita**: busca canciones parecidas a la que suena y las mete a la cola. Si Spotify no da recomendaciones a tu app, usa las más escuchadas del mismo artista.
- **Corazón**: guarda o quita la canción de tu biblioteca; cambia de color al momento y regresa si Spotify falla.
- **Mis playlists** con portadas y **Reproducir todo**, **Escuchado hace poco** y **Tu Top 50** (si todavía no hay, se muestra el Top 50 México).
- **Tu música**: tus MP3 y MP4 del servidor, de 6 en 6 con páginas.

### Que suene en el celular sin abrir Spotify (Android)

La app de Android trae un puente para el **Spotify App Remote SDK**: la música suena en segundo plano con la app de Spotify instalada y cuenta Premium, sin sacarte de Mi Setup. La primera vez Spotify pide permiso una sola vez.

Spotify no publica ese SDK en Maven, así que se agrega a mano antes de compilar el APK:

1. Baja `spotify-app-remote-release-X.Y.Z.aar` de https://github.com/spotify/android-sdk/releases (la más reciente que conocemos es la 0.8.0; usa la más nueva que aparezca).
2. Cópialo a `apps/mobile/android/app/libs/`.
3. Compila el APK como siempre (`pnpm --filter @mi-setup/mobile apk`).

Si el archivo no está, el APK compila igual y la música se controla con Spotify Connect (el celular tiene que tener Spotify abierto).

## Versión 0.11.4b

Restauración completa con el diseño nuevo en toda la app. La lista de cambios por fase y lo que queda pendiente está en `docs/CAMBIOS-0.11.4b.md`.

### Subirla al VPS (apartado por versión)

Cada versión se guarda en `/opt/mi-setup/versiones/<versión>/` con el paquete, la lista de cambios y un respaldo de la base y de `/opt/mi-setup/.env` hecho antes de instalar.

En tu PC, dentro de la carpeta del proyecto:

```powershell
git archive --format=tar -o mi-setup-0.11.4b.tar version-0.11.4b
scp mi-setup-0.11.4b.tar root@TU-VPS:/root/
```

En el VPS:

```bash
tar -xOf /root/mi-setup-0.11.4b.tar deploy/instalar-version.sh > /root/instalar-version.sh
bash /root/instalar-version.sh 0.11.4b /root/mi-setup-0.11.4b.tar
```

Si tu app vive en otra carpeta, ponla antes: `APP_DIR=/ruta/de/tu/app bash /root/instalar-version.sh …`.

Para regresar la base al estado de antes, el script imprime el comando de `pg_restore` con la ruta del respaldo.

### Quién ve qué

- **Panel** (Pterodactyl, Negocio y cobros): el dueño y los roles a los que les des permiso.
- **Host local**: solo el dueño.
- **Redes y streams**: el dueño y quien tenga el rol «Invitado» (Ajustes → Cuentas y permisos).
- **Negocio y cobros** para los demás usuarios aparece en Sitios web.
