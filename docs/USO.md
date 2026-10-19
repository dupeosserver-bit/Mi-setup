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
| `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` | Controlar Spotify | developer.spotify.com → Create app → Redirect URI `https://TU-DOMINIO/api/musica/spotify/callback` → Web API. Controlar la música necesita Premium. |
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

Funciona en la app de Windows. Menú → Host local → Servidores en mi PC → **Nuevo servidor**: eliges Paper, Fabric, Forge, Vanilla o un comando propio, la versión, la RAM y el puerto, y aceptas la EULA de Minecraft. Java se descarga solo.

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

El `docker compose up -d --build` recarga el Caddyfile nuevo.
