/** "¿Cómo se usa?": pasos cortos para cada apartado (se abren con el botón de ayuda arriba de cada página). */
import type { ModuleId } from "@mi-setup/shared";

export interface Ayuda {
  pasos: string[];
  nota?: string;
}

export const AYUDA: Record<ModuleId, Ayuda> = {
  recordatorios: {
    pasos: [
      "Toca 'Nuevo', escribe qué y cuándo, y elige si se repite (diario, semanal, mensual).",
      "A la hora indicada llega un aviso push al celular y una notificación en la PC.",
      "Márcalo como hecho para que deje de avisar. La IA también puede proponerte recordatorios.",
    ],
  },
  notas: {
    pasos: ["Toca 'Nueva nota', escribe y se guarda sola.", "Fija las importantes para que salgan arriba y usa la búsqueda para encontrarlas.", "Se sincronizan al momento entre PC y celular."],
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
      "'Mis dispositivos' es un chat contigo mismo para pasar textos y enlaces entre PC y celular.",
      "Privado: toca 'Privado' y elige otra cuenta para hablar solo con ella.",
      "Grupo: toca 'Grupo', ponle nombre y elige quién entra. En 'Opciones del grupo' puedes renombrarlo, agregar personas o salirte.",
      "Escribe y presiona Enter; también puedes convertir un mensaje en recordatorio.",
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
      "Se revisa cada 60 s; si se cae o la RAM/disco pasan el límite te llega un push.",
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
      "Elige un servidor para navegar sus carpetas por SFTP.",
      "'Subir aquí' sube uno o varios archivos a la carpeta abierta; 'Carpeta' crea una nueva.",
      "En cada fila: descargar, renombrar (lápiz) o borrar (bote). Borrar una carpeta pide escribir su nombre y tu contraseña o huella.",
    ],
    nota: "Las carpetas del sistema (/, /root, /etc, /var, /opt/mi-setup…) no se pueden borrar ni mover desde aquí.",
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
    pasos: ["Muestra los respaldos de la base que hace el script del VPS y si están al día.", "Puedes descargar cualquiera."],
  },
  boveda: {
    pasos: [
      "La primera vez crea tu bóveda con UNA clave maestra (no se puede recuperar si la olvidas).",
      "Dentro, 'Nuevo' guarda usuario, contraseña y sitio; todo se cifra en tu dispositivo.",
      "La pestaña Generador crea contraseñas con letras, números y símbolos (no necesitas abrir la bóveda).",
      "Historial guarda cifradas las últimas 10 contraseñas que copiaste o usaste del generador.",
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
  vpn: {
    pasos: [
      "Agrega este dispositivo: la app genera las llaves y te da un QR o un archivo .conf.",
      "Escanea el QR con la app oficial de WireGuard (o importa el .conf en la PC) y conéctate desde ahí.",
    ],
  },
  navegador_privado: {
    pasos: ["En la app de PC escribe una dirección o búsqueda y se abre una ventana privada.", "Al cerrarla se borra todo: historial, cookies y sesiones."],
  },
  auditoria: {
    pasos: ["Muestra todo lo que pasa en la app (inicios de sesión, cambios, acciones de la IA).", "Filtra por módulo, acción o resultado y exporta a CSV."],
  },
  cuentas: {
    pasos: [
      "Crea cuentas para otras personas y dales permisos por apartado (Ver, Editar, Administrar).",
      "En Roles crea grupos tipo Discord (Fundador, Dev…) con color y permisos, y asígnalos.",
      "Desactivar una cuenta la saca al momento de todos sus dispositivos.",
    ],
  },
  streams: {
    pasos: [
      "Pon los datos de cada plataforma en Ajustes → Servicios y claves y toca Conectar.",
      "Cambia el título y el juego de tu transmisión desde aquí (YouTube solo título).",
    ],
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
      "Clima: toca 'Usar mi ubicación' o busca tu ciudad; activa 'tiempo real' para que la detecte cada vez.",
      "Ofertas: busca un juego en tiendas oficiales y de claves; Juegos gratis muestra regalos de Epic, Steam y más.",
      "Precios (RAM): pega la URL del producto y el selector del precio que pagas; te avisa si cambia.",
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
      "Configura RustDesk en cada equipo con tu servidor (pasos abajo en la página).",
      "Agrega tu PC con su ID y contraseña permanente.",
      "'Conectar' pide tu huella o contraseña, copia la contraseña y abre RustDesk.",
    ],
  },
  ia: {
    pasos: [
      "Escribe o dicta (micrófono) lo que necesitas; puedes adjuntar fotos, PDF o archivos de texto.",
      "La IA solo propone acciones: nada se hace hasta que tocas Aprobar.",
      "Elige el modelo abajo del chat; en Ajustes → Voz e IA eliges la voz y si lee las respuestas.",
    ],
  },
  ajustes: {
    pasos: [
      "Cuenta: tu nombre, foto y contraseña. Apariencia: tema, fuente y zoom.",
      "Terminal: tema y letra de la terminal. Voz e IA: modelo y voz del asistente.",
      "Servicios y claves (cuenta maestra): pon aquí las claves de API sin tocar el servidor.",
    ],
  },
};
