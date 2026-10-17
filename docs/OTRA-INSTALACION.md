# La misma app para otra persona (con sus propios datos)

Hay dos maneras. Elige según cuánto quieras separar las cosas.

## Opción 1 — Una cuenta dentro de tu app (lo más fácil)

Tu primo entra a **tu** servidor con su propia cuenta.

1. En la app: **Seguridad → Cuentas y permisos → Nueva cuenta** (correo, nombre y contraseña inicial de 12+ caracteres).
2. Elige qué apartados puede usar y con qué nivel (Ver / Editar / Administrar).
3. Le pasas el APK o el instalador de Windows y entra con su correo.

Qué es **solo suyo**: recordatorios, notas, chat (puede escribirte por privado), conversaciones con la IA, ajustes y apariencia.

Qué **comparten**: los servidores VPS, el panel de Pterodactyl, las claves de API y el tope mensual de la IA (los 10 USD se reparten entre todos). Los apartados solo de la cuenta maestra (VPS, bóveda, 2FA, auditoría, cuentas…) no se le pueden dar.

Úsala si confías en él y solo quiere sus notas, recordatorios, chat, novedades, etc.

## Opción 2 — Su propia instalación (todo separado)

Él tiene su propio servidor, su propia base de datos, su propia cuenta maestra y sus propias claves. Usa **el mismo APK y el mismo instalador de Windows** que tú: solo cambia el servidor al iniciar sesión.

### Qué necesita

- Un VPS propio con Ubuntu/Debian, 2 GB de RAM o más (4 GB si también quiere la IA gratis local) y Docker instalado (`curl -fsSL https://get.docker.com | sh`).
- Un dominio (o subdominio) suyo, con registros **A** de `setup.`, `ntfy.` y `rd.` apuntando a la IP de su VPS (en Cloudflare con **nube gris**).

> No se recomienda ponerla en tu mismo VPS: ambas instalaciones usarían los puertos 80/443 y los mismos nombres de contenedor.

### Pasos en su VPS

1. Sube el paquete `mi-setup.tar.gz` (el mismo que usas tú) a `/root/` y descomprímelo:

   ```bash
   mkdir -p /opt/mi-setup/app && tar -xzf /root/mi-setup.tar.gz -C /opt/mi-setup/app
   ```

2. Crea su archivo de configuración a partir del ejemplo:

   ```bash
   cp /opt/mi-setup/app/.env.example /opt/mi-setup/.env
   nano /opt/mi-setup/.env
   ```

   Cambia como mínimo:

   - `DOMAIN`, `APP_HOST`, `NTFY_HOST`, `RD_HOST` → los de **su** dominio.
   - `POSTGRES_PASSWORD`, `JWT_SECRET`, `SERVER_ENC_KEY` → valores nuevos, cada uno con `openssl rand -base64 48`.
   - `NTFY_TOPIC` → un texto largo y aleatorio (`openssl rand -hex 24`).
   - Sus propias claves (Claude, Pterodactyl, Discord…). Se pueden poner después desde **Ajustes → Servicios y claves**.

   **Nunca** copies tu `.env`: así sus datos y los tuyos no se pueden mezclar ni descifrar entre sí.

3. Enciende todo:

   ```bash
   cd /opt/mi-setup/app && docker compose --env-file /opt/mi-setup/.env up -d --build
   ```

4. Crea su cuenta maestra (pide correo, nombre, contraseña y muestra su código 2FA):

   ```bash
   docker exec -it misetup-core node dist/cli/crear-maestra.js
   ```

5. Comprueba: `curl https://setup.SU-DOMINIO/api/health` debe responder `{"ok":true,…}`.

### Conectar las apps a su servidor

- **Celular:** en la pantalla de inicio de sesión toca **Cambiar servidor**, escribe `https://setup.SU-DOMINIO` y **Usar este servidor**.
- **Windows:** copia `https://setup.SU-DOMINIO`, abre **Archivo → Cambiar servidor…** y elige **Usar …**. La app se reinicia en su servidor.
- **Navegador:** solo abre `https://setup.SU-DOMINIO`.

Para volver al tuyo: la misma opción → **Volver al predeterminado**.

### Actualizar su instalación

Igual que la tuya: le pasas el nuevo `mi-setup.tar.gz` y ejecuta

```bash
rm -rf /opt/mi-setup/app && mkdir -p /opt/mi-setup/app && tar -xzf /root/mi-setup.tar.gz -C /opt/mi-setup/app
cd /opt/mi-setup/app && docker compose --env-file /opt/mi-setup/.env up -d --build
```

Sus datos viven en los volúmenes de Docker de su VPS y no se tocan al actualizar.
