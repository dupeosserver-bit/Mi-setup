# Mi Setup 0.11.4b — cambios y pendientes

Restauración completa con el diseño nuevo aprobado (`docs/disenos-0.11.4b/`).

## Hecho por fase

| Fase | Qué cambió |
|---|---|
| 1-3 | Arreglos del VPS (Caddy reintenta mientras core se reinicia, registros limitados a 30 MB por servicio), de la app y del sitio oficial (logo y botón «Actualizar con esta versión»). |
| 4 | Marco nuevo: menú completo o solo íconos en PC, riel en tablet, cajón en celular, monitor vertical y celular acostado. Páginas 1, 2, 3… en las listas sin que la pantalla se suba. Pantallas que no se mueven cuando no hay nada abajo. |
| 5 | Panel solo para el dueño y sus roles. Host local solo para el dueño. Redes y streams para el dueño y el rol «Invitado». Agentes de IA en la categoría IA. Negocio y cobros en Sitios para los usuarios. Ciberseguridad sin «Mi cuenta»; sesiones en Equipos y entradas al servidor en VPS. Hasta 10 cuentas de Google. |
| 6 | Equipos: el mismo aparato cuenta una vez aunque reinstales la app; reconoce PC, tablet o celular; historial de 9 sesiones y «Cerrar todas menos esta». |
| 7 | Mis finanzas: total de los pagos divididos, casilla de pagado (lo no pagado pasa al mes siguiente) y editar suscripciones. |
| 8 | Terminal estilo Termius a pantalla completa, barra de teclas que se desliza en celular y tablet, Ctrl K, dividir en 2 y comandos guardados con /nombre. |
| 9 | Pterodactyl: acepta archivos `.blueprint` también en Android; la tienda gratis solo muestra lo descargable y lo instala sola. |
| 10 | QR nuevo sin figuras de puntitos (formas, esquinas, degradado, logo y marco) y firma escrita cuando no hay firma dibujada. |
| 11 | Programación: editor que se adapta al celular, vista en vivo solo para HTML, 14 ejercicios nuevos y videos por tema. |
| 12 | Sitios: «En mantenimiento» o «Cerrado» sin borrar el sitio; ícono hecho con la IA o con tu JPG/PNG. |
| 13 | Editor de fotos tipo Photoshop, también en tablet y celular. |
| 14 | Música: Spotify (Dónde suena, varita, corazón, playlists, historial y Top 50) y tu música de 6 en 6. |
| 15 | IA asistente tipo Claude: proyectos con archivos (20 archivos, 100 MB), memoria compartida, instrucciones del proyecto y Deudas con seguimiento. |
| 16 | Ajustes tipo iPhone, descargas para PC, Android e iPhone, actualizaciones solas con «Qué hay de nuevo» y cambio de servidor que conserva lo básico. |
| 17 | Diseño nuevo en todas las demás pantallas, colores con transparencia arreglados en toda la app y apartado por versión en el VPS (`deploy/instalar-version.sh`). |

## Pendientes conocidos

| Pendiente | Por qué |
|---|---|
| Túneles en la terminal dicen «Pronto». | El servidor todavía no los permite. |
| Ejercicios de C. | No se pudo instalar el intérprete en la sesión de trabajo. |
| Barras de 45 días en Alertas de caída. | Necesitan guardar historial en el servidor. |
| Historial de veces de Comandos guardados. | Hoy solo vive mientras la pantalla está abierta. |
| Me gusta y reposts de X. | La parte de X que usa la app no los da. |
| Clics por día de cada enlace corto. | El servidor solo guarda el total. |
| Spotify sin abrir la app en Android. | Hay que copiar el AAR de App Remote a `apps/mobile/android/app/libs/` (ver USO.md). |
