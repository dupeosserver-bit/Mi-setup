/** "¿Cómo se usa?": pasos cortos para cada apartado (se abren con el botón de ayuda arriba de cada página). */
import type { ModuleId } from "@mi-setup/shared";

export interface Ayuda {
  pasos: string[];
  nota?: string;
}

export const AYUDA: Record<ModuleId, Ayuda> = {
  calendario: {
    pasos: [
      "Ves en un solo calendario tus recordatorios, los vencimientos de clientes, tus pagos y suscripciones, y tus eventos.",
      "Toca un día para ver lo que hay y agregar un evento.",
    ],
  },
  finanzas_personales: {
    pasos: [
      "Anota tus gastos e ingresos; el concepto lo escribes como quieras (ej. «Préstamo Coppel»).",
      "«Gasto con ticket»: tómale foto al ticket, la IA lee tienda, total e IVA; revisas y se guarda con la foto.",
      "«Pagos divididos»: divide Netflix, la renta o lo que sea entre varias personas. Cada quien tiene su lista; marcas lo que pagan y lo vencido queda en «Debe». «Mandarle su lista» la comparte por WhatsApp y «Mensaje para cobrar» lo redacta la IA.",
      "«Impuestos»: calculadora de IVA, ISR de sueldo y RESICO, y el IVA que pagaste este mes según tus tickets.",
      "Suscripciones te avisa antes de cada cobro; Excel importa y exporta tus movimientos.",
    ],
    nota: "Los impuestos son una guía rápida: para declarar, confírmalo con el SAT o tu contador.",
  },
  portapapeles: {
    pasos: ["Copia algo en la PC y toca 'Enviar lo que copié': aparece al momento en tu celular, y al revés.", "Toca un elemento para copiarlo; se guardan los últimos 50."],
  },
  vps_agentes: {
    pasos: [
      "Elige tu servidor y toca «Instalar» en el agente que quieras (Claude Code, Gemini CLI, Aider, Llama o Qwen locales, Open WebUI, n8n…). Se pide tu contraseña o huella y escribir el nombre del servidor.",
      "Los de terminal se usan en VPS → Terminal (ej. «claude»). Los paneles web quedan en 127.0.0.1: ábrelos con un túnel SSH o un subdominio.",
      "Abajo buscas más en GitHub por páginas; «Instalar con ayuda de la IA» le pide a la IA que revise el proyecto y te proponga los comandos para aprobarlos.",
    ],
    nota: "Revisa la RAM antes de instalar varios; los modelos locales piden de 3 a 6 GB.",
  },
  vps_seguridad: {
    pasos: [
      "Elige el servidor y mira su calificación: firewall, fail2ban, actualizaciones, SSH, puertos, swap, disco, logs y alertas.",
      "Cada punto en amarillo o rojo tiene su botón: crear swap, protección contra cuelgues (earlyoom), limitar logs, SSH solo con llave…",
      "«Alertas de entrada por SSH»: te llega un aviso cada vez que alguien entra al servidor.",
      "«Pedir ayuda a la IA» le pasa la revisión para que te explique y proponga comandos (que tú apruebas).",
    ],
    nota: "Todo pide confirmar con el nombre del servidor y tu contraseña o huella.",
  },
  ciberseguridad: {
    pasos: [
      "Sitios y contraseñas: revisa tu página, si una contraseña se filtró, y «Revisar mis contraseñas» del gestor.",
      "Mi cuenta: dónde tienes la sesión abierta (cierra las que no reconozcas) y tus entradas recientes; avisa si entran desde un lugar nuevo.",
      "Correos de Google: conecta una o varias cuentas de Gmail; revisa si tus correos salieron en filtraciones, cuáles correos son peligrosos y escribe correos revisando antes si mandas algo delicado.",
    ],
    nota: "Usa estas herramientas solo con tus propias cuentas y páginas.",
  },
  streamer: {
    pasos: ["Escribe tu canal de Twitch y de Kick: ves los dos chats juntos en una sola pantalla.", "Arriba tienes accesos rápidos a cambiar título y categoría (en Streams)."],
  },
  herramientas: {
    pasos: [
      "QR: escribe un enlace (Instagram, WhatsApp, página), elige colores, forma y un logo al centro, y descárgalo como imagen para redes.",
      "Emojis secretos: escribe un mensaje o código y escóndelo dentro de un emoji; quien lo pegue aquí lo puede leer.",
      "Vista previa HTML: escribe HTML, CSS y JavaScript y ve el resultado al instante, en tamaño celular o PC.",
    ],
  },
  documentos: {
    pasos: [
      "Une varios PDF, separa páginas, gira, borra páginas o pasa fotos a PDF.",
      "Firma: dibuja tu firma con el dedo y colócala en la página.",
      "Todo se hace en tu equipo: los documentos no se suben a ningún lado.",
    ],
  },
  convertidor: {
    pasos: [
      "Imágenes: cambia de formato (PNG, JPG, WebP), tamaño y peso, en tu equipo.",
      "Audio y video: sácale el MP3 a un video, comprímelo o cambia el formato (se hace en tu VPS).",
      "Datos: convierte entre CSV, JSON y Excel.",
    ],
  },
  enlaces: {
    pasos: ["Pega un enlace largo y te da uno corto de tu dominio, con contador de clics.", "Puedes elegir el nombre corto (ej. /l/pasteles) y desactivarlo cuando quieras."],
  },
  compartir: {
    pasos: [
      "Sube un archivo (hasta 2 GB) y te da un enlace para mandarlo a quien quieras, como Mega o MediaFire.",
      "Opcional: contraseña, días para que caduque y límite de descargas.",
      "Arriba ves cuánto espacio usan tus archivos compartidos.",
    ],
  },
  peliculas: {
    pasos: [
      "Busca una película o serie: ves dónde verla en México (Netflix, Prime, Disney+, Max…) y cuándo se estrena.",
      "Agrégala a 'Por ver'; en las series te dice cuándo sale el siguiente capítulo.",
    ],
    nota: "Necesita una clave gratis de TMDB (Ajustes → Servicios y claves → TMDB_API_KEY).",
  },
  musica: {
    pasos: [
      "Spotify: conéctalo una vez y controla lo que suena (pausar, siguiente, buscar) desde aquí.",
      "Mi música: sube tus MP3 al VPS y escúchalos desde cualquier equipo.",
    ],
    nota: "Spotify necesita Premium y su app de desarrollador (SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET).",
  },
  videos: {
    pasos: [
      "Sube tus videos y míralos desde la app, con 'seguir viendo'.",
      "Para una biblioteca grande tipo Netflix puedes encender Jellyfin en tu servidor (ver USO.md).",
    ],
    nota: "Solo videos tuyos o con permiso.",
  },
  casa: {
    pasos: ["Mide la velocidad de tu internet.", "Agrega tus cámaras (si tienen RTSP) y accesos rápidos a las apps de tu casa."],
  },
  ia_creativa: {
    pasos: [
      "Prompts guardados, crear imágenes (Gemini), quitar fondo y resumir o traducir.",
      "«Detector de IA»: pega un texto y te dice qué tan probable es que lo haya escrito una IA y qué frases lo delatan.",
      "«Hacer más natural»: reescribe tu texto para que suene como lo dirías tú, sin cambiar lo que dice.",
    ],
  },
  codigo: {
    pasos: [
      "En la app de Windows toca «Abrir carpeta» y elige la carpeta de tu proyecto (solo se puede tocar lo que esté dentro).",
      "Abre archivos a la izquierda; se editan con el mismo editor de VS Code. Ctrl+S guarda; el punto ● avisa si falta guardar.",
      "«Nuevo proyecto»: plugin de Paper/Spigot, mod de Fabric, datapack, página web, Python o Node, listos para usar.",
      "«Compilar» corre el comando del proyecto en la terminal de abajo. Para plugins y mods instala Java y Gradle con un botón (una sola vez).",
      "Al pasar el mouse sobre un archivo: comprimir en .zip, descomprimir (.zip, .jar, .mrpack), cambiar nombre o mandar a la papelera.",
    ],
    nota: "En el navegador y el celular queda un bloc de código para practicar; tus archivos solo se abren desde la app de PC.",
  },
  host_local: {
    pasos: [
      "En la app de Windows toca «Crear servidor»: elige Paper, Purpur o Folia (plugins); Fabric, Quilt, Forge o NeoForge (mods); Mohist o Arclight (mods y plugins juntos); Vanilla, Velocity (proxy) u «Otro juego». Mi Setup baja el servidor y el Java correcto.",
      "Enciende y mira la consola en vivo; escribe comandos abajo (op TuNombre, gamemode…). Apagar guarda el mundo.",
      "Mods/Plugins: búscalos en Modrinth (o CurseForge si pusiste su clave) con páginas 1, 2, 3… e instálalos con un toque. En servidores Fabric, Quilt, Forge o NeoForge la pestaña «Modpacks» instala un modpack completo (apaga el servidor antes).",
      "Ajustes: además de lo principal, «Todos los ajustes de server.properties» te deja cambiar o agregar cualquiera.",
      "Compartir: playit.gg te da una dirección para que tus amigos entren sin abrir puertos del módem. En tu casa entran con la IP local.",
      "Pasar a mi VPS: comprime el servidor (o solo el mundo) y lo sube a un servidor de tu Pterodactyl.",
    ],
    nota: "Los servidores viven en Documentos → MiSetup Servidores. Sus archivos se editan en Programación → Código.",
  },
  sitios: {
    pasos: [
      "«Nuevo sitio»: ponle nombre y dirección (nombre.mexicanland.net) y elige una plantilla (pastelería, servidor de Minecraft, streamer, landing, link in bio, invitación) o «Hazlo con IA».",
      "Editor: arrastra bloques (cuadritos) a la página. Selecciona algo y cambia su estilo (pincel), sus propiedades (engrane) o mira las capas. «Libre» te deja mover todo como en FancyMenu.",
      "Bloques de Mi Setup: producto con carrito (pedidos por WhatsApp), lista desde tabla, formulario, contador, clima, último video, en vivo, estado de servidores e inicio de sesión.",
      "Imágenes: sube fotos (se optimizan solas), recórtalas, quítales el fondo o créalas con IA. Datos: tablas tipo Excel que el sitio muestra solo.",
      "Publicar: los visitantes ven lo nuevo solo al tocar Publicar. Cada publicación queda en el historial por si quieres regresar.",
      "Mensajes y pedidos, estadísticas y cuentas del área privada están en sus pestañas; en Ajustes: dominio propio, SEO, app instalable, quién puede editar y exportar en ZIP.",
      "«Importar sitio»: sube un sitio exportado de otro Mi Setup o uno que ya tengas hecho (.zip con sus páginas .html o un .html suelto). Llega como borrador, sin publicar.",
      "Comunidad (Ajustes del sitio): los visitantes suben proyectos (enlace de GitHub o .zip) y comentan, con su nombre o como anónimos. Se bloquean groserías, tu nombre oficial queda reservado y cada archivo se revisa con antivirus; en la pestaña «Comunidad» apruebas, rechazas y respondes como oficial.",
    ],
    nota: "Subdominios: pon tu token de Cloudflare en Ajustes → Servicios y claves y, en la tarjeta «¿Abre desde internet?» del sitio, crea el registro DNS por ti. Plantilla «Tienda de hosting»: vende planes y cada pedido se vuelve cliente con cobro.",
  },
  editor_fotos: {
    pasos: [
      "«Nuevo» crea un lienzo (cuadrado, vertical para TikTok, portada…) o abre una foto desde «Abrir».",
      "Herramientas de arriba: seleccionar, pincel, texto (toca el lienzo), formas y línea. Elige el color a la izquierda.",
      "Toca algo del lienzo para cambiar su color, borde, opacidad, mezcla, fuente y, en fotos, brillo, contraste, saturación, desenfoque, blanco y negro y más.",
      "Capas: súbelas o bájalas, escóndelas con el ojo o bloquéalas con el candado. Ctrl+Z deshace, Supr borra, Ctrl+D duplica.",
      "Recortar, quitar el fondo de una imagen y retocar con IA están en los íconos de la barra.",
      "Guardar deja el proyecto con sus capas en tu cuenta; Exportar baja PNG, JPG o WebP.",
    ],
    nota: "Retocar con IA necesita la clave de Gemini (Ajustes → Servicios). Quitar fondo baja un modelo la primera vez (~40 MB).",
  },
  editor_video: {
    pasos: [
      "Agrega tus videos, fotos y música con «Agregar archivos»: se quedan en tu dispositivo, no se suben.",
      "Cada clip se ordena en la línea de tiempo; toca uno para cortarlo, dividirlo en la posición actual, cambiar su velocidad, volumen, filtros o voltearlo.",
      "Textos: agrega títulos con su color y tamaño y elige cuándo salen.",
      "Elige el formato (horizontal, vertical para TikTok o cuadrado) y la calidad.",
      "«Exportar» arma el video en tiempo real (dura lo mismo que el video) y lo puedes guardar en tu cuenta o bajar.",
    ],
    nota: "No cierres la pestaña mientras exporta. Para videos largos usa la PC.",
  },
  bots_discord: {
    pasos: [
      "En discord.com/developers crea tu aplicación, ve a Bot y copia el token. Invita al bot a tu servidor con el enlace OAuth2 (permisos de administrador o los que necesites).",
      "«Nuevo bot»: pega el token (se guarda cifrado y nunca se vuelve a mostrar) y Mi Setup lo mantiene encendido en tu VPS.",
      "Configura por módulos: bienvenida y despedida, moderación y filtros, niveles y XP, economía, tickets, roles con botones, comandos personalizados, registros y respaldos del servidor.",
      "Encender, apagar o reiniciar desde el panel. Los cambios se aplican al guardar.",
      "Si lo vendes: pon un cliente, una fecha de vencimiento y comparte el enlace para que el dueño edite su bot sin ver tu cuenta ni el token.",
    ],
    nota: "El bot solo hace lo que activas aquí. Al vencer el servicio se apaga solo.",
  },
  ejercicios: {
    pasos: [
      "Elige nivel (fácil, medio o difícil) y un ejercicio. Lee lo que pide y escribe tu solución.",
      "«Probar» corre las pruebas: verás cuáles pasan y cuáles no, con lo que esperaba y lo que salió.",
      "Si te atoras, toca «Pista» o «Pedir ayuda a la IA» (te explica el error sin darte todo resuelto).",
      "Tu avance se guarda en tu cuenta y se ve en PC y celular.",
    ],
  },
  recordatorios: {
    pasos: [
      "Toca 'Nuevo', escribe qué y cuándo, y elige si se repite (diario, semanal, mensual).",
      "A la hora indicada llega un aviso push al celular y una notificación en la PC.",
      "Márcalo como hecho para que deje de avisar. La IA también puede proponerte recordatorios.",
    ],
  },
  notas: {
    pasos: [
      "Toca 'Nueva', escribe y se guarda sola. Estilo Discord: **negrita**, __subrayado__, ||spoiler||, # título, -# pequeño.",
      "Arriba del texto: foto, archivo, dibujo, nota de voz (micrófono) y dictado (las ondas): lo que dices se va escribiendo.",
      "«Compartir»: mándala por el chat, compártela con otras apps (Claude, Gemini, WhatsApp… con sus fotos) o crea un enlace para verla sin cuenta.",
      "En «Adjuntos» guardas cada foto o archivo en este dispositivo (o todos de una vez).",
      "«Tablero de tareas»: toca una tarea para editarla, moverla o borrarla; la casilla la marca como hecha.",
    ],
  },
  equipos: {
    pasos: [
      "Cada PC o celular donde abres la app aparece aquí con su estado: conectado o desconectado.",
      "Toca un equipo para ver su CPU, RAM, disco y red en vivo.",
      "Puedes cambiarle el nombre o quitarlo si ya no lo usas.",
    ],
    nota: "La PC solo informa mientras la app de Windows está abierta (también en la bandeja).",
  },
  chat: {
    pasos: [
      "'Mis dispositivos' es un chat contigo mismo para pasar cosas entre PC y celular; también hay privados y grupos.",
      "El clip manda fotos y archivos; el botón de código manda código con letra de código y botón de copiar.",
      "Con la caja vacía, el micrófono graba una nota de voz: tócalo otra vez para enviarla.",
      "En la PC pasa el mouse sobre tu mensaje para borrarlo. Las notas compartidas llegan con su enlace.",
    ],
  },
  vps_terminal: {
    pasos: [
      "Agrega tu VPS con '+ Servidor' (IP, usuario y llave SSH o contraseña; se guardan cifradas).",
      "Pulsa 'Abrir' para una terminal. Pega con Ctrl+V o clic derecho; selecciona texto para copiarlo.",
      "En la barra de abajo puedes escribir '/nombre' de un comando guardado y Enter para ejecutarlo.",
      "El historial (abajo a la izquierda) guarda lo que ejecutas; tócalo para reutilizarlo.",
      "El tema y la letra se cambian en Ajustes → Terminal.",
    ],
  },
  vps_rendimiento: {
    pasos: ["Elige un servidor para ver CPU, RAM, disco, carga y red en gráficas en vivo.", "Los datos se piden solo mientras miras esta página."],
  },
  vps_alertas: {
    pasos: [
      "Agrega lo que quieras vigilar: un servidor (ping/SSH), un puerto TCP o una página web.",
      "Se revisa cada 60 s; si se cae o el CPU, la RAM o el disco pasan el límite te llega un push.",
      "Toca el aviso: se abre la IA con la pregunta lista para que te diga qué pasa (tú decides si la envías).",
    ],
  },
  vps_comandos: {
    pasos: [
      "Guarda comandos que usas seguido (ej. reiniciar un servicio) con un nombre.",
      "Ejecútalos con un botón o en la terminal escribiendo /nombre.",
      "Los peligrosos (rm -rf, reboot…) piden escribir una palabra y tu contraseña o huella.",
    ],
  },
  vps_archivos: {
    pasos: [
      "Elige un servidor para navegar sus carpetas. La lupa busca archivos y carpetas por nombre debajo de donde estás.",
      "«Organizar» propone mover cada archivo suelto a una carpeta por tipo (.sh → scripts, .blueprint → blueprints…); usa la carpeta si existe o la crea. Tú eliges cuáles.",
      "«Limpiar basura» busca temporales, respaldos de editores, logs viejos y cachés; borras solo lo que marques.",
      "Subir, descargar, renombrar, borrar y enviar a otro servidor como siempre.",
    ],
    nota: "Nunca se mueven archivos de configuración ni ocultos, y las carpetas del sistema no se tocan.",
  },
  vps_bots: {
    pasos: ["Registra cada bot de Discord que corre en tu VPS (servicio, proceso o contenedor).", "Ves si está encendido y puedes reiniciarlo con un toque."],
  },
  pterodactyl: {
    pasos: [
      "Necesita las claves del panel en Ajustes → Servicios y claves (PTERO_CLIENT_KEY).",
      "Ves tus servidores de juego con su consumo; enciende, apaga o reinicia desde aquí.",
      "La consola muestra los registros en vivo y puedes mandar comandos. 'Panel completo' abre la web del panel.",
    ],
  },
  vencimientos: {
    pasos: ["Agrega dominios (fecha automática por RDAP), certificados SSL (se revisan solos) o VPS (pones la fecha).", "Te avisa con anticipación antes de que venzan."],
  },
  clientes: {
    pasos: ["Registra a tus clientes y sus cobros (montos, fechas de pago).", "La app te recuerda los cobros pendientes y vencidos."],
  },
  finanzas: {
    pasos: ["Anota ingresos y gastos con categoría.", "Las gráficas muestran el resultado por mes y por categoría."],
  },
  negocio: {
    pasos: ["Guarda ideas y mejoras para MexicanLand con su estado (pendiente, en proceso, hecho)."],
  },
  respaldos: {
    pasos: [
      "«Crear respaldo» (cuenta maestra): una carpeta, todo Pterodactyl, la base de Mi Setup, el VPS completo o un servidor de juego.",
      "Restaurar (flecha circular): «aparte» lo saca en /opt/mi-setup/restaurados sin tocar nada; «en su lugar» lo pone donde estaba (escribe RESTAURAR). La base guarda antes un respaldo de cómo está.",
      "«Respaldos automáticos»: elige qué, cada día o cada semana, la hora y cuántos guardar; los viejos se borran solos.",
    ],
    nota: "Un respaldo en el mismo VPS no te salva si el VPS se pierde: descarga los importantes a tu PC.",
  },
  boveda: {
    pasos: [
      "La primera vez crea tu bóveda con UNA clave maestra (no se puede recuperar si la olvidas).",
      "«Abrir con huella» (celular) o «Abrir con PIN» (PC): actívalo una vez y ya no escribes la clave maestra en ese dispositivo.",
      "«Revisar» busca contraseñas filtradas, repetidas o débiles y te ayuda a cambiarlas.",
      "En el celular, «Autocompletar en otras apps»: elige Mi Setup en Android y tus contraseñas se rellenan con tu huella, como Samsung Pass.",
    ],
    nota: "Exporta un respaldo cifrado de vez en cuando (botón Exportar).",
  },
  autenticador: {
    pasos: ["Agrega cuentas 2FA escaneando el QR o pegando la clave.", "Verás el código de 6 dígitos que cambia cada 30 s; tócalo para copiarlo."],
  },
  correos_temporales: {
    pasos: [
      "Crea un correo temporal (alias de tu dominio) para registrarte en sitios.",
      "Los correos que lleguen aparecen aquí; se borran a las 24 h si no los guardas.",
    ],
    nota: "Necesita el Email Worker de Cloudflare configurado (ver docs/USO.md).",
  },
  navegador_privado: {
    pasos: ["En la app de PC escribe una dirección o búsqueda y se abre una ventana privada.", "Al cerrarla se borra todo: historial, cookies y sesiones."],
  },
  auditoria: {
    pasos: ["Muestra todo lo que pasa en la app (inicios de sesión, cambios, acciones de la IA).", "Filtra por módulo, acción o resultado y exporta a CSV."],
  },
  cuentas: {
    pasos: [
      "Crea cuentas para otras personas y dales permisos por apartado (Ver, Editar, Administrar) o con roles.",
      "«Claves de los servicios»: decide si la persona usa tus claves (IA, Gemini…) o las suyas, y si puede ver Servicios y claves (sin secretos).",
      "Desactivar una cuenta la saca al momento de todos sus dispositivos.",
    ],
  },
  streams: {
    pasos: [
      "Pon los datos de cada plataforma en Ajustes → Servicios y claves y toca Conectar.",
      "Cambia el título y el juego de tu transmisión desde aquí (YouTube solo título).",
      "En «Clips y TikTok»: trae tu stream (enlace de Twitch, Kick o YouTube, o sube un video), deja que la IA busque los mejores momentos con título y hashtags o córtalos a mano, y saca el clip en vertical para TikTok.",
      "Conecta TikTok en esa misma pestaña para subir el clip desde aquí. Usa solo tus propios streams.",
    ],
    nota: "Mientras TikTok no apruebe tu app, solo deja publicar videos privados («Solo yo»).",
  },
  x: {
    pasos: ["Conecta tu cuenta de X (claves en Ajustes → Servicios y claves).", "Antes de publicar o leer menciones se muestra el costo estimado y debes aceptarlo."],
  },
  discord: {
    pasos: [
      "Pon el token de tu bot en Ajustes → Servicios y claves.",
      "Enviar: mensajes normales o tarjetas con título, color e imagen (con vista previa).",
      "Mensajes del canal: lee, edita los del bot, borra, fija o reacciona.",
      "Servidores: ves en cuáles está el bot y cuántos miembros tiene.",
    ],
  },
  novedades: {
    pasos: [
      "Clima: hora por hora, mañana contra hoy, sol y UV.",
      "Noticias: «Populares» primero (por tema) y «Mis fuentes» con sugeridas para agregar con un toque.",
      "Compras: escribe o tómale foto a algo y ves dónde comprarlo (Mercado Libre aquí mismo y muchas tiendas).",
      "Ofertas en tu moneda y Steam por región; Steam con populares, con más gente, mejor valorados y «Para ti» según tus géneros.",
      "Vigilar precios funciona con Mercado Libre, Amazon, Coppel, Liverpool, Walmart y casi cualquier tienda.",
    ],
  },
  noticias: {
    pasos: ["Muestra las noticias de tus fuentes RSS ordenadas por fecha.", "En 'Fuentes' agrega un RSS o solo escribe un tema (crea una fuente de Google Noticias)."],
  },
  cripto: {
    pasos: ["Busca una moneda y agrégala a tu lista.", "Cambia entre MXN, USD y EUR. La gráfica muestra los últimos 7 días."],
    nota: "Solo informativo: no es asesoría financiera.",
  },
  inversiones: {
    pasos: ["Agrega acciones, ETF o índices con su símbolo de Yahoo Finance (AAPL, ^GSPC, ^MXX, WALMEX.MX).", "Ves el precio, el cambio del día y un mes de gráfica."],
    nota: "Solo informativo: no es asesoría financiera.",
  },
  divisas: {
    pasos: ["Usa el convertidor para cualquier par de monedas.", "Elige tu moneda base y agrega las que quieras seguir; cada una muestra 30 días de gráfica."],
  },
  control_remoto: {
    pasos: [
      "Lo más fácil: Escritorio remoto de Chrome (oficial de Google). Prepara tu PC, instala la app en el celular y entra con tu PIN.",
      "Con tu propio servidor: configura RustDesk en cada equipo, agrega tu PC con su ID y toca «Conectar».",
    ],
  },
  ia: {
    pasos: [
      "Escribe o dicta lo que necesitas; puedes adjuntar fotos, PDF o archivos. La IA solo propone: nada se hace hasta que tocas Aprobar.",
      "«Deudas y negociaciones»: cuéntale qué pasa (debes, te deben o quieres negociar) y te da tus derechos, un plan y el mensaje listo para mandar.",
      "Elige el modelo abajo del chat; en Ajustes → Mis claves puedes usar tu propia clave de Claude.",
    ],
    nota: "Lo legal es orientación de la IA: confírmalo con CONDUSEF, PROFECO o un abogado.",
  },
  ajustes: {
    pasos: [
      "Cuenta: nombre, foto, contraseña y tus servidores de Mi Setup (cambia entre ellos sin volver a entrar).",
      "Apariencia: tema, fondo (y uno para la PC), cómo se acomoda la imagen y los botones flotantes del celular.",
      "Mis claves: pon tus propias claves de IA, Gemini, TMDB o CurseForge y decide si las compartes (con aviso).",
      "Servicios y claves (cuenta maestra o con permiso): las claves de API del servidor.",
      "Idioma: español, inglés, portugués, francés, alemán o italiano (también se elige al entrar).",
    ],
  },
};
