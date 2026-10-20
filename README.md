# Mi Setup

Tu propio centro de control en la nube: una app para **PC (Windows)**, **celular (Android)** y **web** conectadas a **tu propio VPS**. Sirve para manejar tu servidor, tu hosting de juegos, tus finanzas, tus notas, tus redes y mucho más, todo en español y en un solo lugar.

Es **código abierto**: cualquiera puede instalar su propio Mi Setup en su VPS y mejorarlo. Cada instalación es independiente y **usa sus propias claves** (nadie comparte las suyas).

> Versión actual: **0.11.0b** (b = beta). Guía completa en [`docs/USO.md`](docs/USO.md).

## Qué incluye

| Área | Apartados |
|---|---|
| Menú principal | Recordatorios, bloc de notas tipo Notion (voz, dictado, dibujo, fotos, compartir), chat con fotos, archivos, código y notas de voz, calendario, mis finanzas (tickets con foto, impuestos, pagos divididos), portapapeles |
| VPS | Terminal SSH, rendimiento, alertas, comandos, archivos (buscar, organizar, limpiar basura), seguridad del servidor, respaldos (crear, restaurar, automáticos), agentes de IA |
| Panel | Pterodactyl, negocio y cobros (clientes, vencimientos, gastos, ideas) |
| Seguridad | Contraseñas y 2FA (con huella o PIN, autocompletar en el celular), navegador privado, ciberseguridad (sesiones, alertas, Gmail, filtraciones), registro de actividad, cuentas y permisos |
| Redes | Streams y clips para TikTok, X, Discord, bots de Discord (crear y vender), modo streamer |
| Novedades | Clima hora por hora, noticias, compras con foto, ofertas de juegos por región, Steam, vigilar precios, cripto, inversiones, monedas |
| Más | Herramientas, código, servidores de juego en tu PC (mods, plugins, modpacks), sitios web con dominio, estudio de fotos y video, entretenimiento, casa, control remoto, IA asistente y creativa |

La IA **solo propone**: nada se ejecuta en tu servidor hasta que tocas «Aprobar».

## Estructura

```
apps/core/        Servidor (Fastify + Drizzle + PostgreSQL): API, tareas y seguridad
apps/ui/          Interfaz (React + Vite + Tailwind), la misma para web, PC y Android
apps/desktop/     App de Windows (Electron)
apps/mobile/      App de Android (Capacitor)
packages/shared/  Módulos, permisos, esquemas y cálculos compartidos
deploy/           Dockerfile, Caddyfile, instalador y respaldos del VPS
docs/             USO.md (cómo se usa e instala), SUPUESTOS.md (decisiones), SEGURIDAD.md
```

## Instalar tu propio Mi Setup

Necesitas un VPS con Ubuntu, Docker y un dominio en Cloudflare. Los pasos completos están en [`docs/USO.md`](docs/USO.md); en corto:

1. Apunta `setup.TUDOMINIO` y `*.TUDOMINIO` a la IP de tu VPS (nube gris).
2. Copia `.env.example` a `/opt/mi-setup/.env` y llena **tus** valores (`DOMAIN`, `APP_HOST`, contraseñas largas al azar para `POSTGRES_PASSWORD`, `JWT_SECRET` y `SERVER_ENC_KEY`).
3. `docker compose --env-file /opt/mi-setup/.env up -d --build`
4. Crea la cuenta maestra con `deploy/instalar.sh` (o el comando de `docs/USO.md`).
5. Las claves de servicios (IA, Google, Twitch…) se ponen después desde la app: **Ajustes → Servicios y claves**.

Las apps de PC y celular se conectan a cualquier Mi Setup: en el inicio de sesión toca **Cambiar servidor** y escribe tu dirección. Pueden recordar varios servidores con su sesión.

## Seguridad

- Ningún secreto vive en el código: todo sale del `.env` o de Ajustes (cifrado con `SERVER_ENC_KEY`).
- Contraseñas y 2FA cifrados de extremo a extremo: el servidor nunca ve tus contraseñas.
- Permisos por apartado, reautenticación para acciones delicadas y registro de actividad que no se puede borrar.
- Si encuentras un problema de seguridad, avísale en privado a quien mantiene el proyecto antes de publicarlo.

## Desarrollo

```bash
pnpm install
pnpm -r test
pnpm lint
```

Para contribuir, lee [`CONTRIBUTING.md`](CONTRIBUTING.md). Licencia: [MIT](LICENSE).
