# Mi Setup 0.11.5b — cambios y pendientes

Tres instalaciones en el mismo VPS, edición pública sin nada de MexicanLand, página oficial con video y Mi Setup en el navegador.

## Hecho por fase

| Fase | Qué cambió |
|---|---|
| 1 | Varias instalaciones en el mismo VPS: personal (`setup.`), pública (`app.`) y pruebas (`test.`). Cada una con su carpeta, su `.env`, su base y sus volúmenes; contenedores con el nombre de su instalación (`misetup-publica-core`…). Un solo Caddy (el de la personal) manda cada dirección a su app, y ntfy, Ollama y ClamAV se comparten. `deploy/crear-instancia.sh` crea una nueva y `deploy/instalar-version.sh` instala en una, varias o `todas`. |
| 2 | Edición pública: además de lo que ya quitaba (Pterodactyl, Redes y streams, bots, Servidores en mi PC, Mi casa y Control remoto), ya no menciona MexicanLand. La IA se presenta sin el hosting, Sitios usa el dominio del servidor, y ejemplos, plantillas y ayuda son neutros. La personal conserva su nombre. |
| 3 | Página oficial: capturas nuevas de la interfaz 0.11.4b y un video de 45 s (PC y celular lado a lado, sin sonido y en bucle) en lugar de la captura del inicio. Todo sale de la demo con datos de ejemplo. Los videos MP4 y WebM de cualquier sitio ya se ven en la página. |
| 4 | `pnpm al-dia [versión]`: sube la versión (package.json y Android), compila la demo, saca capturas y video, rehace la wiki y pone al día el README. |
| 5 | Botón «Usar en el navegador» en la página oficial → `misetup.mexicanland.net/app`: escribes la dirección de tu Mi Setup, entras y en el celular la agregas a inicio. Cada instalación acepta esa página (variable `APP_WEB_ORIGEN`). |
| 6 | Cierre: «Qué hay de nuevo», documentos, pruebas y versión 0.11.5b (Android `versionCode` 15). Los sitios ya no pueden llamarse `test` ni `pruebas`. |
| 7 | Arreglos después de probarla: en la app de PC se cambia de servidor desde el inicio de sesión y Ajustes (antes solo desde Archivo copiando la dirección). Antes de cambiar se revisa que el otro Mi Setup conteste, y «Failed to fetch» ahora dice en español con qué servidor no se pudo conectar. El celular solo ofrece actualizar si el APK que se baja es más nuevo (antes anunciaba 0.11.5b y bajaba el 0.11.4b). La página oficial se pone al día sola con cada versión aunque esté publicada (lo de antes queda en el historial; se apaga en Sitios → Ajustes → «Actualizar sola»). |
| 8 | Segunda ronda de arreglos: páginas de 5 en 5 que caben en su tarjeta; Juegos gratis de 12 en 12; códigos 2FA ocultos con botón de ojo; fotos del chat en grande; avisos que ya no se salen de su tarjeta; Procesador e Internet al segundo en Rendimiento; Apariencia sin hueco; elegir cómo actualizar también en la app vinculada al VPS; notas en tarjetas chicas; sin barra de abajo en Música del celular y el botón de IA al lado del +; aviso de versión que se queda cerrado; video de la página sin la espera del inicio y con el celular a un lado; /app ya no abre con la sesión de la demo y ofrece la demo. Android `versionCode` 16. |

| 9 | Terminal del celular como Termius: se escribe directo en la terminal (teclado nativo, sin caja aparte), una sola fila delgada de teclas (Esc, Tab, Ctrl, Alt, flechas, \|, /, -, ~…) con «Más», pestañas compactas y la pantalla se ajusta al abrir el teclado. Huella: un solo aviso y una sola línea. Clima: tocar un día enseña su detalle y su hora por hora; «Volver a hoy». |


## Memoria (RAM) de cada instalación

Se mide en el VPS con `docker stats --no-stream` (ver `docs/USO.md`). Cálculo aproximado mientras no se mide:

| Instalación | Qué enciende | RAM aproximada |
|---|---|---|
| Personal | core, base, Caddy, ntfy (+ Ollama y ClamAV si están encendidos) | lo de hoy (~24 % del VPS) |
| Pública | core y base | 250 a 350 MB |
| Pruebas | core y base | 250 a 350 MB |

Al compilar una versión la RAM sube 1.5 a 2 GB unos minutos (se compilan la app, la demo y la versión web).

## Pendientes conocidos

| Pendiente | Por qué |
|---|---|
| Los sitios que se creen en la pública o en pruebas no se publican todavía. | Necesitan su propio comodín DNS (`*.app.mexicanland.net`) y que Caddy pregunte a cada instalación antes de sacar el certificado. |
| En iPhone viejos el video del inicio no se mueve: se ve su imagen. | El video es WebM; para MP4 hace falta un convertidor que no viene con el navegador automatizado. |
| `/app` vive en la misma dirección que la página oficial. | Si alguien edita la página oficial con código propio, ese código podría leer la sesión de `/app`. Solo el dueño puede editarla. |
| Túneles en la terminal dicen «Pronto». | El servidor todavía no los permite. |
| Ejercicios de C. | No se pudo instalar el intérprete en la sesión de trabajo. |
| Barras de 45 días en Alertas de caída. | Necesitan guardar historial en el servidor. |
| Historial de veces de Comandos guardados. | Hoy solo vive mientras la pantalla está abierta. |
| Me gusta y reposts de X. | La parte de X que usa la app no los da. |
| Clics por día de cada enlace corto. | El servidor solo guarda el total. |
| Spotify sin abrir la app en Android. | Hay que copiar el AAR de App Remote a `apps/mobile/android/app/libs/` (ver USO.md). |
