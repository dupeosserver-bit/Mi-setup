# Continuar la versión 0.11.4b

Rama: `version-0.11.4b`. Un commit por fase, en esta misma rama. Nunca push a `main`, nunca force push.

## Dónde se quedó

| Fase | Qué | Estado |
|---|---|---|
| 1-3 | Arreglos del VPS, de la app y del sitio oficial | Hecha |
| 4 | Marco nuevo (`apps/ui/src/lib/marco.ts`, `Layout.tsx`), paginación sin saltar arriba, pantallas sin scroll, modos de página normal / fijo / pleno / completa | Hecha |
| 5 | Permisos: Panel solo dueño y roles, Host local solo dueño, Redes y streams dueño + rol «Invitado», Agentes de IA en `/ia/agentes`, Negocio y cobros en Sitios para usuarios, Ciberseguridad limpia, máximo 10 cuentas de Google | Hecha |
| 6 | Equipos: un aparato = un registro aunque se reinstale, PC / tablet / celular, historial de 9, «Cerrar todas menos esta» | Hecha |
| 7 | Mis finanzas: total de pagos divididos, casilla de pagado con arrastre al mes siguiente, editar suscripciones | Hecha |
| 8 | Terminal estilo Termius con barra de teclas táctil | Hecha |
| 9 | Pterodactyl: `.blueprint` aceptado (Android filtraba por tipo), tienda gratis solo descargables con instalación automática | Hecha |
| 10 | QR nuevo sin puntitos y firma escrita | Hecha |
| 11 | Programación: editor responsive, vista en vivo solo para HTML, ejercicios nuevos, videos por tema | Hecha |
| 12 | Sitios: mantenimiento / cerrado sin borrar, ícono con IA o JPG/PNG | Hecha |
| 13 | Editor de fotos tipo Photoshop | Hecha |
| 14 | Música: Spotify (Web API + Connect, App Remote en Android) y tu música con páginas de 6 | Hecha |
| 15 | IA asistente tipo Claude: proyectos con archivos de contexto (límite visible, solo lee las partes que sirven), memoria compartida por proyecto, instrucciones del proyecto, casos de deudas con seguimiento y adjuntos | Hecha |
| 16 | Ajustes tipo iPhone (lista y detalle), descargas PC / Android / iPhone, actualizaciones solas con «Qué hay de nuevo» una vez por versión, rechazar actualizaciones solo sin VPS, cambiar de servidor conservando lo básico | Hecha |
| **17** | **Rediseño del resto de pantallas y cierre** | **Sigue aquí** |

## Diseños aprobados

Todo está en `docs/disenos-0.11.4b/`:
- `mi-setup-0.11.4b-diseno-final.html`: la app completa con lo elegido. Se abre con doble clic. Cada opción del menú ya muestra su diseño elegido y sus vistas «abierta».
- `disenos-elegidos.md`: qué opción se eligió en cada pantalla y las mezclas.
- `fuentes/rediseno.html` + `fuentes/sec/*.js|css`: el código de cada opción. Ejemplo: IA asistente = `sec/ia.js`, ruta `ia-1` y `ia-1/abierta`.

Las maquetas son referencia visual: los datos son inventados. En la app real se usan los datos y las API reales.

## Fase 15 — IA asistente (diseño: opción 1 + abierta)

Página `apps/ui/src/pages/Ia.tsx`. Al estilo de Claude (celular y PC):
- **Inicio:** a la izquierda Nuevo chat, buscador, proyectos y recientes con páginas. Al centro «¿Cómo puedo ayudarte hoy, <nombre>?», una caja grande y botones rápidos. Abajo propuestas por aprobar, memoria y gasto. No hace scroll si no hay nada abajo.
- **Conversación a pantalla completa:**
  - Todos los mensajes empiezan a la izquierda, tanto los del usuario como los de la IA.
  - Las propuestas de la IA van dentro del mensaje con Aprobar / Rechazar.
  - A la derecha va el panel del proyecto.
- **Proyectos:** cada uno tiene dentro:
  - **Contexto:** archivos PDF, MD, fotos y otros, con un límite visible (por ejemplo «12 de 20 archivos · 38 MB de 100 MB»). La IA busca solo lo necesario dentro de los archivos (fragmentos), no los manda completos.
  - **Memoria de la cuenta compartida:** la memoria se comparte entre el proyecto y los chats de fuera. Se puede ver, editar y apagar.
  - **Instrucciones personalizadas del proyecto:** son un segundo nivel de instrucciones, después de las generales.
- **Deudas (subcategoría):**
  - Conversación de seguimiento por caso, con adjuntos.
  - El usuario comparte cómo van las pláticas y la IA sugiere cómo seguir según las leyes y cómo responder.
  - Lista de siguientes pasos, con el aviso «no es asesoría legal».
- **Regla fija:** la IA solo propone; nada se ejecuta hasta «Aprobar». Las claves vienen de Ajustes → Servicios y claves.
- **Tests en core:** límite de archivos y espacio, memoria compartida encendida/apagada, instrucciones del proyecto en el prompt.

## Fase 16 — Ajustes (diseño: opción 2, tipo iPhone) y actualizaciones

- Descargas separadas: PC, Android e iPhone. Las de Android e iPhone sirven también para tablets.
- **Actualizaciones:**
  - Se descargan solas.
  - Al terminar de instalarse sale la pantalla «Qué hay de nuevo» de esa versión. Ruta de la maqueta `ajustes-novedades/abierta`. Revisar que no exista ya una; si existe, adaptarla. Responsive.
  - Quien no esté vinculado a un VPS puede rechazar las actualizaciones.
- El sitio oficial se actualiza con cada versión, solo el dueño (ya existe «Actualizar con esta versión» en Sitios; dejarlo en Ajustes también).
- **Cambiar de servidor (openspout):**
  - Al entrar a otro servidor, la app descarga las funciones de ese servidor.
  - Al cambiar de servidor, la app cambia, menos lo básico: cuenta, apariencia, idioma y lo que no depende del VPS.
  - Mostrar en dos cajas lo que se queda y lo que cambia.
- «Mi cuenta» con Equipos dentro y «Cerrar sesión».

## Fase 17 — Resto de pantallas y cierre

**1.** Aplicar el diseño elegido (ver `disenos-elegidos.md`) a las pantallas que aún tienen el diseño viejo:

| Grupo | Pantallas |
|---|---|
| Inicio y Menú principal | Inicio (opción 1, anillos), Recordatorios, Bloc de notas (Samsung Notes / Keep, nota abierta con texto desde la orilla), Chat, Calendario, Portapapeles |
| VPS | Rendimiento, Alertas, Comandos guardados, Archivos, Seguridad del servidor (puertos con páginas), Respaldos |
| IA | Agentes de IA |
| Seguridad | Contraseñas y 2FA, Navegador privado, Ciberseguridad, Registro de actividad, Cuentas y permisos (opción 1) |
| Panel | Negocio y cobros |
| Redes y streams | Streams, X, Discord, Modo streamer, Bots |
| Novedades y herramientas | Novedades, Documentos y PDF, Convertidor, Enlaces cortos, Compartir archivos |
| Varios | Servidores en mi PC, Editor de video (lista opción 1 + editor de la opción 2), Películas y series, Mis videos, Mi casa (opción 1 + cámara completa de la opción 2), Control remoto, IA creativa |

En Mi casa y Control remoto solo cambia el diseño, no las funciones.

Varias opciones elegidas traen ideas que la app no tiene; agrégalas solo si son pequeñas y seguras. Si no, deja la pantalla con las funciones de hoy y el diseño nuevo.

**2.** Arreglar en toda la app los colores con opacidad sobre variables CSS (`bg-acento/15` y parecidos no pintan). Usar `color-mix` o la config de Tailwind con `<alpha-value>`.

**3.** El test «valida la llave privada antes de guardarla» de `apps/core/test/vps.test.ts` a veces se pasa de tiempo cuando todo corre junto. Subir su tiempo límite.

**4. Cierre:**
- Versión `0.11.4` + `"etapa": "b"` en los package.json.
- Android `versionCode` 14 y `versionName` «0.11.4b».
- Pantalla «Qué hay de nuevo» con la lista de 0.11.4b.
- `docs/USO.md`, `docs/CAMBIOS-0.11.4b.md` y SUPUESTOS.
- Checks: `pnpm typecheck`, `pnpm lint`, tests, build y la prueba de carga del dist.

**5.** Comandos para subir al VPS. Cada versión tiene su apartado en `/root/mi-setup/versiones/0.11.4b/`, con el paquete, la lista de cambios y un respaldo antes de instalar.

## Reglas (siempre)

- **Código:** limpio, sin comentarios de relleno (`//`, `/* */`) ni texto de más. Componentes modernos, nada básico.
- **Responsive:** todo en PC 1920×1080, monitor vertical 1080×1920, tablet 1180×820 y 820×1180 (táctil), celular 390×844 y celular acostado. Sin scroll de lado.
- **Interfaz:** en español sencillo, sin palabras técnicas. Textos nuevos traducidos en `apps/ui/src/i18n/{en,pt,fr,de,it}.json` (una clave por línea, agregar al final, sin salto final). Revisar con `node scripts/textos-faltantes.mjs`.
- **Secretos:** nunca en código, logs, commits ni docs. Se leen de variables de entorno o de Ajustes → Servicios y claves.
- **IA:** solo propone; nada se ejecuta hasta «Aprobar». Lo peligroso pide PIN o huella.
- **Material público:** lo de la edición personal (Pterodactyl, Host local, Redes y streams, Negocio en el Panel) no va en material público.
- **Colores:** usar `color-mix` para colores con transparencia.
- **Base de la fase 4:** reutilizar `useForma`, `useModoPagina`, `useAltoVisible`, `useTactil` y el componente de páginas.

## Pendientes conocidos

- Túneles de la terminal: dice «Pronto»; el servidor aún no los permite.
- Ejercicios de C: faltan (el intérprete no se pudo instalar en la sesión anterior).
- La demo pública no trae Terminal (no tiene VPS).
- Spotify App Remote: hay que bajar el AAR de https://github.com/spotify/android-sdk/releases a `apps/mobile/android/app/libs/` (ver docs de Música). Cada dueño pone sus claves de Spotify en Servicios y claves.
- Video para misetup.mexicanland.net: hacer una versión pública del HTML de diseños, sin las secciones personales y con un nombre de ejemplo.
