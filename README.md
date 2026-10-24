# Mi Setup

**Tu servidor, tus apps y tu día en un solo lugar.**

Mi Setup se instala en tu propio VPS y lo usas desde la **PC (Windows)**, el **celular (Android)** o el **navegador**: terminal, archivos, sitios web, finanzas, notas e IA. Tus datos se quedan contigo.

> Versión actual: **0.11.6b** · Código abierto (MIT) · Guía completa en [`docs/USO.md`](docs/USO.md)

<p align="center">
  <img src="apps/core/sitio-oficial/video/recorrido.png" alt="Mi Setup en la PC y en el celular" width="100%">
</p>

> 🎬 En la [página oficial](https://misetup.mexicanland.net) hay un video del recorrido y la app para usar en el navegador, sin descargar nada.

> 🤖 **Hecho con inteligencia artificial.** El código de Mi Setup fue escrito con ayuda de IA (Claude). El autor no pide créditos por él. Este es el repositorio **oficial**: descarga solo desde aquí o desde la página oficial, que tiene una **demo en vivo** (datos de ejemplo, nada se guarda), una **wiki** y la **comunidad**.

## Por qué Mi Setup

- 🔒 **Privado de verdad:** corre en tu VPS. Contraseñas cifradas, 2FA, huella y avisos de inicio de sesión.
- 📱 **PC, celular y web:** app de Windows, app de Android y navegador, todo sincronizado.
- 🤖 **IA que solo propone:** la IA te ayuda, pero nada se ejecuta en tu servidor hasta que tocas «Aprobar».
- 🧩 **Abierto:** licencia MIT. Mejóralo y compártelo.

## Funciones

Cada persona ve solo los apartados que le das en **Cuentas y permisos**.

| Apartado | Qué hace |
|---|---|
| 🖥️ **VPS** | Terminal, rendimiento, alertas de caída, comandos aprobados, archivos, seguridad y respaldos |
| 🌐 **Sitios y apps** | Editor visual, dominio propio, DNS automático en Cloudflare, pedidos, cuentas, estadísticas, comunidad e importar/exportar |
| 🤖 **IA asistente** | Claude, modelos gratis en tu VPS (Ollama) y agentes; solo propone, tú apruebas |
| 💰 **Mis finanzas** | Gastos con foto del ticket, suscripciones, pagos divididos, impuestos y rendimientos |
| 📝 **Notas y calendario** | Notas con fotos, voz y dictado, recordatorios, tareas y calendario |
| 🔐 **Contraseñas y 2FA** | Bóveda cifrada, códigos 2FA y autocompletado en Android |
| 🛡️ **Ciberseguridad** | Filtraciones de tu correo, correos peligrosos y avisos de inicio de sesión |
| 🎨 **Estudio** | Editor de fotos y video, convertidor, PDF, firma y códigos QR |
| 💼 **Negocio** | Clientes y cobros, vencimientos, gastos e ingresos |
| 🌎 **Idiomas** | Español, inglés, portugués, francés, alemán e italiano |
| 💬 **Chat** | Canales con fotos, archivos, código y notas de voz |

## Así se ve

| | |
|---|---|
| ![Calendario](apps/core/sitio-oficial/capturas/calendario.png) | ![Bloc de notas](apps/core/sitio-oficial/capturas/notas.png) |
| **Calendario** | **Bloc de notas** |
| ![Sitios y apps](apps/core/sitio-oficial/capturas/sitios.png) | ![Editor de fotos](apps/core/sitio-oficial/capturas/editor-fotos.png) |
| **Sitios y apps** | **Editor de fotos** |

<p align="center"><img src="apps/core/sitio-oficial/capturas/finanzas-celular.png" alt="Finanzas en el celular" width="260"></p>

*Capturas con datos de ejemplo.*

## Requisitos

Para tenerla encendida **24/7** necesitas un VPS. También puedes instalarla en tu PC, pero solo funciona mientras la PC esté prendida y conectada.

| | |
|---|---|
| **Mínimo** | 2 vCPU · 4 GB RAM · 40 GB de disco · Ubuntu 22.04/24.04 · Docker |
| **Recomendado** | 4 vCPU · 8 GB RAM · 100 GB de disco (para la IA gratis, el antivirus de la comunidad y los respaldos) |
| **Dominio** | Un dominio con DNS en Cloudflare (gratis) para el HTTPS y los sitios |

## Descargas

En [Releases](https://github.com/dupeosserver-bit/Mi-setup/releases) están la versión nueva y las 2 anteriores:

- 🪟 **Windows:** `MiSetup-0.11.6.exe` (Windows 10/11)
- 🤖 **Android:** `MiSetup-0.11.6b.apk` (Android 8 o más nuevo)
- 🍎 **iPhone / iPad:** abre tu Mi Setup en Safari → Compartir → **Agregar a inicio** (se usa como app)
- 🖥️ **Servidor:** este repositorio (Docker)

## Instalar tu propio Mi Setup

1. Renta un VPS (Contabo, Hetzner, DigitalOcean…) con Ubuntu y entra por SSH.
2. En Cloudflare apunta `setup.TUDOMINIO` y `*.TUDOMINIO` a la IP de tu VPS (nube gris).
3. Descarga el código:
   ```bash
   git clone https://github.com/dupeosserver-bit/Mi-setup.git /opt/mi-setup/app
   ```
4. Copia `.env.example` a `/opt/mi-setup/.env` y llena **tus** valores (`DOMAIN`, `APP_HOST` y contraseñas largas al azar para `POSTGRES_PASSWORD`, `JWT_SECRET` y `SERVER_ENC_KEY`).
5. Arranca:
   ```bash
   cd /opt/mi-setup/app && docker compose --env-file /opt/mi-setup/.env up -d --build
   ```
6. Crea la cuenta maestra con `deploy/instalar.sh` (o el comando de [`docs/USO.md`](docs/USO.md)) y activa el 2FA.
7. Las claves de servicios (IA, Google, Cloudflare…) se ponen desde la app: **Ajustes → Servicios y claves**.

Las apps de PC y celular se conectan a cualquier Mi Setup: en el inicio de sesión toca **Cambiar servidor** y escribe tu dirección.

## Seguridad

- Ningún secreto vive en el código: todo sale del `.env` o de Ajustes (cifrado con `SERVER_ENC_KEY`).
- Contraseñas y 2FA cifrados de extremo a extremo: el servidor nunca ve tus contraseñas.
- Permisos por apartado, confirmación con PIN, huella o contraseña para acciones delicadas, y registro de actividad que no se puede borrar.
- Si encuentras un problema de seguridad, avisa en privado antes de publicarlo.

## Comunidad

¿Hiciste tu propia versión de Mi Setup? Súbela en la sección **Comunidad** de la página oficial (con tu nombre o como anónimo; cada archivo se revisa con antivirus antes de publicarse) y etiqueta a **[@JokeerYT_Oficia](https://x.com/JokeerYT_Oficia)** en X para verla.

- Reporta errores y propone ideas en [Issues](https://github.com/dupeosserver-bit/Mi-setup/issues).
- Manda tus mejoras con un pull request: lee [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Para desarrolladores

```
apps/core/        Servidor (Fastify + Drizzle + PostgreSQL): API, tareas y seguridad
apps/ui/          Interfaz (React + Vite + Tailwind), la misma para web, PC y Android
apps/desktop/     App de Windows (Electron)
apps/mobile/      App de Android (Capacitor)
packages/shared/  Módulos, permisos, esquemas y cálculos compartidos
deploy/           Dockerfile, Caddyfile, instalador y respaldos del VPS
docs/             USO.md (cómo se usa e instala), SUPUESTOS.md (decisiones)
```

```bash
pnpm install
pnpm -r test
pnpm lint
```

## Licencia

[MIT](LICENSE): úsalo, cámbialo y compártelo libremente.
