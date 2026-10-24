# Mi Setup 0.11.6b — cambios y pendientes

Todo lo que se arregló después de la 0.11.5b que ya está instalada. Se prueba primero en la instalación personal (setup.mexicanland.net); después pasa a pruebas y a la pública.

## Qué cambió

| Apartado | Qué cambió |
|---|---|
| Música | Barra de volumen con silencio en el reproductor de Spotify (si el equipo no deja cambiarlo, se avisa) y en Tu música (se recuerda en el aparato). |
| Servidores | `/api/health` acepta cualquier origen, sin credenciales: la app de PC, celular o web ya puede revisar otro Mi Setup (por ejemplo test.mexicanland.net) antes de cambiarse. Antes decía «No se pudo conectar» aunque estaba encendido. El resto de la API sigue cerrado. |
| Ajustes | Interruptores de tamaño fijo (ya no se aplastan con textos largos). Subir imagen (logo, fondos, foto de perfil): los botones bajan a su fila cuando no caben. |
| Terminal | Al entrar se empieza en Hosts; ya no se abre sola una PowerShell. Las sesiones vivas vuelven como pestañas y «Abrir terminal» desde Rendimiento sigue abriendo su sesión. |
| Página oficial | Video con la PC a la izquierda y el celular a la derecha, sin encimarse. La página se pone al día también cuando cambian video, capturas o wiki con la misma versión, y sus archivos llevan `?v=` para que el navegador no muestre el video viejo. |
| Versión | 0.11.6b (Android `versionCode` 17). |

## Pendientes conocidos

Los mismos de `docs/CAMBIOS-0.11.5b.md`.
