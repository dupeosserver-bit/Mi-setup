/**
 * Plantillas para empezar un sitio en un minuto. Usan los atributos que el
 * sitio publicado entiende solo (data-ms-producto, data-ms-tabla, data-ms-bloque…).
 */

export interface PlantillaSitio {
  id: string;
  nombre: string;
  descripcion: string;
  emoji: string;
  html: string;
  css: string;
  /** Tablas de datos que se crean junto con el sitio (por ejemplo los planes de hosting). */
  tablas?: { nombre: string; columnas: { nombre: string; tipo: "texto" | "numero" | "imagen" | "enlace" }[]; filas: Record<string, string | number>[] }[];
}

const BASE = `body{font-family:'Poppins',system-ui,sans-serif;margin:0;color:#1f2937;line-height:1.5}
a{color:inherit}
.contenedor{max-width:1100px;margin:0 auto;padding:0 20px}
.boton{display:inline-block;padding:12px 22px;border-radius:999px;font-weight:600;text-decoration:none;border:0;cursor:pointer}
section{padding:56px 0}
h1,h2,h3{line-height:1.15;margin:0 0 12px}
.rejilla{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
@media (max-width:600px){section{padding:40px 0}h1{font-size:2rem}}`;

export const PLANTILLAS_SITIOS: PlantillaSitio[] = [
  {
    id: "pasteleria",
    nombre: "Pastelería / negocio",
    descripcion: "Menú de productos con carrito, pedidos por WhatsApp, galería, horario y mapa.",
    emoji: "🎂",
    html: `<header class="cabecera"><div class="contenedor fila"><strong class="marca">🎂 Dulce Hogar</strong><nav><a href="#productos">Productos</a><a href="#galeria">Galería</a><a href="#contacto">Contacto</a></nav></div></header>
<section class="heroe"><div class="contenedor"><h1>Pasteles hechos en casa, con amor</h1><p>Pedidos para cumpleaños, bodas y antojos. Entregamos en tu ciudad.</p><a class="boton primario" href="#productos">Ver pasteles</a></div></section>
<section id="productos"><div class="contenedor"><h2>Nuestros pasteles</h2><p class="nota">Toca «Agregar» y envía tu pedido por WhatsApp.</p>
<div class="rejilla">
<div class="producto" data-ms-producto data-nombre="Pastel de chocolate" data-precio="350"><img src="https://picsum.photos/seed/chocolate/600/400" alt="Pastel de chocolate"><h3>Pastel de chocolate</h3><p class="precio">$350</p><button class="boton primario" data-ms-agregar>Agregar</button></div>
<div class="producto" data-ms-producto data-nombre="Pastel tres leches" data-precio="320"><img src="https://picsum.photos/seed/tresleches/600/400" alt="Pastel tres leches"><h3>Pastel tres leches</h3><p class="precio">$320</p><button class="boton primario" data-ms-agregar>Agregar</button></div>
<div class="producto" data-ms-producto data-nombre="Cupcakes (6)" data-precio="180"><img src="https://picsum.photos/seed/cupcakes/600/400" alt="Cupcakes"><h3>Cupcakes (6)</h3><p class="precio">$180</p><button class="boton primario" data-ms-agregar>Agregar</button></div>
</div></div></section>
<section id="galeria" class="suave"><div class="contenedor"><h2>Galería</h2><div class="galeria"><img src="https://picsum.photos/seed/pastel1/500/500" alt=""><img src="https://picsum.photos/seed/pastel2/500/500" alt=""><img src="https://picsum.photos/seed/pastel3/500/500" alt=""><img src="https://picsum.photos/seed/pastel4/500/500" alt=""></div></div></section>
<section id="contacto"><div class="contenedor dos"><div><h2>Horario</h2><p>Lunes a sábado · 9:00 a 19:00<br>Domingo · 10:00 a 14:00</p><h2>¿Dónde estamos?</h2><p>Escribe aquí tu dirección.</p></div>
<form name="contacto" class="formulario"><h3>Escríbenos</h3><input name="nombre" placeholder="Tu nombre" required><input name="telefono" placeholder="Teléfono"><textarea name="mensaje" placeholder="¿Qué necesitas?"></textarea><input name="_trampa" style="display:none" tabindex="-1" autocomplete="off"><button class="boton primario" type="submit">Enviar</button></form></div></section>
<footer class="pie"><div class="contenedor">© Dulce Hogar · Hecho con Mi Setup</div></footer>`,
    css: `${BASE}
.cabecera{position:sticky;top:0;background:#fff8f3;border-bottom:1px solid #f3dfd2;z-index:10}.fila{display:flex;align-items:center;justify-content:space-between;padding:14px 20px}.marca{font-size:1.2rem;color:#9d4b2e}nav a{margin-left:18px;text-decoration:none;color:#6b4436}
.heroe{background:linear-gradient(135deg,#ffe4ec,#fff3e0);text-align:center;padding:90px 0}.heroe h1{font-size:2.8rem;color:#7a2e3b}.heroe p{font-size:1.15rem;color:#6b4436}
.primario{background:#d9467a;color:#fff}.nota{color:#6b7280}
.producto{background:#fff;border-radius:18px;padding:14px;box-shadow:0 6px 24px rgba(0,0,0,.07);text-align:center}.producto img{width:100%;border-radius:14px}.precio{font-size:1.25rem;font-weight:700;color:#d9467a}
.suave{background:#fff8f3}.galeria{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.galeria img{width:100%;border-radius:14px}
.dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:30px}.formulario{display:flex;flex-direction:column;gap:10px;background:#fff;padding:20px;border-radius:18px;box-shadow:0 6px 24px rgba(0,0,0,.07)}.formulario input,.formulario textarea{padding:12px;border:1px solid #e5d4cc;border-radius:12px;font:inherit}
.pie{background:#7a2e3b;color:#fff;text-align:center;padding:22px 0}`,
  },
  {
    id: "minecraft",
    nombre: "Servidor de Minecraft",
    descripcion: "IP con botón de copiar, estado de tus servidores en vivo, reglas, tienda y Discord.",
    emoji: "⛏️",
    html: `<section class="heroe"><div class="contenedor"><h1>MiServidor</h1><p>El servidor de Minecraft de la comunidad. Survival, minijuegos y eventos.</p>
<div class="ip"><code id="ip">play.miservidor.net</code><button class="boton" onclick="navigator.clipboard.writeText(document.getElementById('ip').textContent);this.textContent='¡Copiada!'">Copiar IP</button></div>
<div class="estado" data-ms-bloque="servidores">Cargando estado…</div></div></section>
<section><div class="contenedor rejilla">
<div class="tarjeta"><h3>🌲 Survival</h3><p>Mundo con protecciones, economía y tiendas.</p></div>
<div class="tarjeta"><h3>⚔️ Minijuegos</h3><p>BedWars, SkyWars y eventos cada fin de semana.</p></div>
<div class="tarjeta"><h3>🎁 Recompensas</h3><p>Vota por el servidor y gana llaves y rangos.</p></div></div></section>
<section class="oscura"><div class="contenedor"><h2>Reglas</h2><ol><li>Respeta a todos los jugadores.</li><li>Nada de hacks ni exploits.</li><li>No griefing ni robos.</li><li>Diviértete.</li></ol></div></section>
<section><div class="contenedor centro"><h2>Únete a la comunidad</h2><a class="boton discord" href="https://discord.gg/">Entrar al Discord</a></div></section>
<footer class="pie">MiServidor · No afiliado a Mojang</footer>`,
    css: `${BASE}
body{background:#0e1116;color:#e5e7eb}.heroe{background:radial-gradient(circle at top,#1f3d2b,#0e1116);text-align:center;padding:100px 0}.heroe h1{font-size:3.4rem;color:#7ee787;text-shadow:0 4px 0 #14532d}
.ip{display:inline-flex;gap:10px;align-items:center;background:#161b22;padding:10px 12px;border-radius:999px;margin:18px 0}.ip code{font-size:1.1rem;padding:0 8px}.ip .boton{background:#7ee787;color:#0e1116}
.estado{margin-top:10px;display:flex;flex-direction:column;gap:6px;align-items:center}.ms-servidor{background:#161b22;padding:8px 14px;border-radius:12px}
.tarjeta{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:20px}.oscura{background:#161b22}.centro{text-align:center}.discord{background:#5865f2;color:#fff}.pie{text-align:center;padding:24px;color:#8b949e}`,
  },
  {
    id: "streamer",
    nombre: "Portafolio / streamer",
    descripcion: "Tu presentación, aviso en vivo de Twitch, último video de YouTube y tus redes.",
    emoji: "🎮",
    html: `<section class="heroe"><div class="contenedor centro"><img class="avatar" src="https://picsum.photos/seed/avatar/300/300" alt="Avatar"><h1>JokeerYT</h1><p>Streams de Minecraft, retos y comunidad. ¡Únete!</p>
<div class="redes"><a class="boton" href="https://twitch.tv/">Twitch</a><a class="boton" href="https://kick.com/">Kick</a><a class="boton" href="https://youtube.com/">YouTube</a><a class="boton" href="https://x.com/">X</a></div></div></section>
<section><div class="contenedor"><h2>🔴 En vivo</h2><div data-ms-bloque="envivo" data-twitch="jokeeryt_">Pon tu canal de Twitch en las propiedades de este bloque.</div></div></section>
<section class="suave"><div class="contenedor"><h2>Último video</h2><div data-ms-bloque="youtube" data-canal="">Pon el ID de tu canal de YouTube (empieza con UC) en las propiedades de este bloque.</div></div></section>
<footer class="pie">Hecho con Mi Setup</footer>`,
    css: `${BASE}
body{background:#0b0b10;color:#f3f4f6}.heroe{padding:80px 0;background:linear-gradient(160deg,#4c1d95,#0b0b10)}.centro{text-align:center}.avatar{width:140px;height:140px;border-radius:50%;border:4px solid #a78bfa}.heroe h1{font-size:3rem}
.redes{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}.redes .boton{background:#a78bfa;color:#0b0b10}.suave{background:#13131a}.pie{text-align:center;padding:24px;color:#9ca3af}`,
  },
  {
    id: "landing",
    nombre: "Landing de un producto",
    descripcion: "Presentación de un producto o servicio con beneficios, precios y formulario.",
    emoji: "🚀",
    html: `<section class="heroe"><div class="contenedor dos"><div><h1>El hosting de juegos más fácil de México</h1><p>Servidores de Minecraft, Rust y más, listos en minutos con soporte en español.</p><a class="boton primario" href="#precios">Ver planes</a></div><img src="https://picsum.photos/seed/servidores/700/500" alt=""></div></section>
<section><div class="contenedor rejilla"><div class="beneficio"><h3>⚡ Rápido</h3><p>Procesadores modernos y discos NVMe.</p></div><div class="beneficio"><h3>🛡️ Protegido</h3><p>Anti-DDoS y respaldos automáticos.</p></div><div class="beneficio"><h3>💬 Soporte</h3><p>Te ayudamos por Discord y WhatsApp.</p></div></div></section>
<section id="precios" class="suave"><div class="contenedor"><h2>Planes</h2><div class="rejilla"><div class="plan"><h3>Básico</h3><p class="precio">$99/mes</p><p>2 GB RAM · 10 jugadores</p></div><div class="plan destacado"><h3>Pro</h3><p class="precio">$199/mes</p><p>6 GB RAM · 40 jugadores</p></div><div class="plan"><h3>Mega</h3><p class="precio">$349/mes</p><p>12 GB RAM · sin límite</p></div></div></div></section>
<section><div class="contenedor"><form name="interesados" class="formulario"><h2>Quiero información</h2><input name="nombre" placeholder="Nombre" required><input name="correo" type="email" placeholder="Correo" required><button class="boton primario">Enviar</button></form></div></section>`,
    css: `${BASE}
.heroe{background:#eef2ff;padding:70px 0}.dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:30px;align-items:center}.dos img{width:100%;border-radius:20px}.heroe h1{font-size:2.6rem;color:#1e1b4b}
.primario{background:#4f46e5;color:#fff}.beneficio{padding:20px;border-radius:16px;background:#f8fafc}.suave{background:#f8fafc}.plan{background:#fff;border:2px solid #e5e7eb;border-radius:18px;padding:22px;text-align:center}.destacado{border-color:#4f46e5;transform:scale(1.03)}.precio{font-size:1.6rem;font-weight:700;color:#4f46e5}
.formulario{max-width:480px;margin:0 auto;display:flex;flex-direction:column;gap:10px}.formulario input{padding:12px;border:1px solid #d1d5db;border-radius:12px;font:inherit}`,
  },
  {
    id: "linkinbio",
    nombre: "Link in bio (tipo Linktree)",
    descripcion: "Una página con tu foto y botones a todas tus redes. Ideal para Instagram o TikTok.",
    emoji: "🔗",
    html: `<main class="tarjeta"><img class="avatar" src="https://picsum.photos/seed/perfil/300/300" alt=""><h1>@tunombre</h1><p>Creador de contenido · México</p>
<a class="enlace" href="https://instagram.com/">📸 Instagram</a><a class="enlace" href="https://tiktok.com/">🎵 TikTok</a><a class="enlace" href="https://youtube.com/">▶️ YouTube</a><a class="enlace" href="https://wa.me/">💬 WhatsApp</a><a class="enlace" href="https://discord.gg/">🎮 Discord</a></main>`,
    css: `${BASE}
body{background:linear-gradient(160deg,#f472b6,#8b5cf6);min-height:100vh;display:flex;justify-content:center;padding:40px 16px}.tarjeta{width:100%;max-width:420px;text-align:center;color:#fff}.avatar{width:110px;height:110px;border-radius:50%;border:4px solid #fff}
.enlace{display:block;margin:12px 0;padding:14px;border-radius:16px;background:rgba(255,255,255,.95);color:#4c1d95;font-weight:600;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.15)}`,
  },
  {
    id: "invitacion",
    nombre: "Invitación de evento",
    descripcion: "Fiesta, boda o cumpleaños con cuenta regresiva y confirmación de asistencia.",
    emoji: "🎉",
    html: `<section class="heroe"><div class="contenedor centro"><p class="pre">Estás invitado a</p><h1>Mis XV años · Valeria</h1><p>Sábado 20 de diciembre · 7:00 p. m.</p><div class="contador" data-ms-bloque="contador" data-fecha="2026-12-20T19:00:00" data-final="¡Hoy es el día!">—</div></div></section>
<section><div class="contenedor dos"><div><h2>📍 Lugar</h2><p>Salón Jardín Las Flores<br>Escribe aquí la dirección.</p><h2>👗 Código de vestimenta</h2><p>Formal</p></div>
<form name="confirmaciones" class="formulario" data-ms-gracias="¡Gracias por confirmar!"><h2>Confirma tu asistencia</h2><input name="nombre" placeholder="Tu nombre" required><select name="asistire"><option>Sí asistiré</option><option>No podré ir</option></select><input name="personas" type="number" min="1" max="10" placeholder="¿Cuántos van?"><button class="boton primario">Confirmar</button></form></div></section>`,
    css: `${BASE}
body{font-family:'Playfair Display',Georgia,serif;background:#fffaf5}.heroe{background:linear-gradient(180deg,#fde7f3,#fffaf5);padding:90px 0}.centro{text-align:center}.pre{letter-spacing:.2em;text-transform:uppercase;color:#be185d}.heroe h1{font-size:3rem;color:#831843}
.contador{font-size:1.8rem;font-weight:700;color:#be185d;margin-top:16px}.dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:30px}.primario{background:#be185d;color:#fff}
.formulario{display:flex;flex-direction:column;gap:10px;background:#fff;padding:22px;border-radius:18px;box-shadow:0 6px 24px rgba(0,0,0,.06)}.formulario input,.formulario select{padding:12px;border:1px solid #f3d0e0;border-radius:12px;font:inherit}`,
  },
  {
    id: "hosting",
    nombre: "Tienda de hosting",
    descripcion: "Planes de servidores (Minecraft, bots, VPS) con «Contratar», instrucciones de pago, preguntas frecuentes y contacto. Los pedidos se vuelven clientes con cobro.",
    emoji: "🖥️",
    html: `<header class="cabecera"><div class="contenedor fila"><strong class="marca">⚡ MexicanHost</strong><nav><a href="#planes">Planes</a><a href="#incluye">Incluye</a><a href="#preguntas">Preguntas</a><a href="#contacto">Contacto</a></nav></div></header>
<section class="heroe"><div class="contenedor"><h1>Hosting para tus servidores de juegos y bots</h1><p>Servidores de Minecraft y bots de Discord encendidos 24/7, con panel fácil y respaldos diarios.</p><a class="boton primario" href="#planes">Ver planes</a></div></section>
<section id="planes"><div class="contenedor"><h2>Elige tu plan</h2><p class="nota">Toca «Contratar» y te mandamos las instrucciones de pago. Los planes se editan en la pestaña Datos.</p>
<div class="planes" data-ms-tabla="planes"><div class="plan" data-ms-plantilla data-ms-producto><h3 data-campo="nombre">Plan</h3><p class="precio"><span data-campo="precio" data-dinero>$0</span><small> / mes</small></p><ul><li data-campo="ram">RAM</li><li data-campo="cpu">CPU</li><li data-campo="disco">Disco</li></ul><p class="nota" data-campo="descripcion"></p><button class="boton primario" data-ms-agregar>Contratar</button></div></div></div></section>
<section id="incluye" class="suave"><div class="contenedor"><h2>En todos los planes</h2><div class="rejilla"><div class="dato"><h3>🛡️ Protección DDoS</h3><p>Tu servidor protegido de ataques.</p></div><div class="dato"><h3>🎛️ Panel fácil</h3><p>Enciende, apaga y configura desde el navegador.</p></div><div class="dato"><h3>💾 Respaldos</h3><p>Copias de tu mundo y tus archivos.</p></div><div class="dato"><h3>💬 Soporte</h3><p>Te atendemos por WhatsApp y Discord.</p></div></div></div></section>
<section id="preguntas"><div class="contenedor"><h2>Preguntas frecuentes</h2><details><summary>¿Cómo pago?</summary><p>Al contratar te mostramos cómo pagar (transferencia, depósito o la forma que prefieras).</p></details><details><summary>¿Cuándo se activa mi servidor?</summary><p>En cuanto confirmamos tu pago, normalmente el mismo día.</p></details><details><summary>¿Puedo cambiar de plan?</summary><p>Sí, cuando quieras: escríbenos y lo ajustamos.</p></details></div></section>
<section id="contacto" class="suave"><div class="contenedor dos"><div><h2>¿Dudas?</h2><p>Escríbenos y te ayudamos a elegir el plan ideal.</p></div><form name="contacto" class="formulario"><h3>Escríbenos</h3><input name="nombre" placeholder="Tu nombre" required><input name="correo" type="email" placeholder="Tu correo"><textarea name="mensaje" placeholder="¿Qué necesitas?"></textarea><button class="boton primario">Enviar</button></form></div></section>
<footer class="pie"><div class="contenedor">© MexicanHost · Todos los derechos reservados</div></footer>`,
    css: `${BASE}
.cabecera{background:#0f172a;color:#fff;padding:14px 0}.fila{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.marca{font-size:1.2rem}.cabecera nav a{margin-left:16px;text-decoration:none;opacity:.85}
.heroe{background:linear-gradient(135deg,#0f172a,#312e81);color:#fff;text-align:center;padding:90px 0}.heroe h1{font-size:2.6rem}.heroe p{font-size:1.1rem;opacity:.85;max-width:620px;margin:0 auto 24px}
.primario{background:#6366f1;color:#fff}.nota{color:#6b7280}
.planes{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px;margin-top:18px}.plan{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:24px;text-align:center;box-shadow:0 8px 28px rgba(15,23,42,.07)}.plan h3{font-size:1.3rem}.precio{font-size:2rem;font-weight:700;color:#4f46e5;margin:6px 0 14px}.precio small{font-size:.9rem;color:#6b7280;font-weight:400}.plan ul{list-style:none;padding:0;margin:0 0 14px}.plan li{padding:6px 0;border-bottom:1px solid #f1f5f9}
.suave{background:#f8fafc}.dato{background:#fff;border-radius:16px;padding:18px;box-shadow:0 4px 18px rgba(15,23,42,.05)}
details{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:12px 16px;margin:10px 0}summary{cursor:pointer;font-weight:600}
.dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:30px}.formulario{display:flex;flex-direction:column;gap:10px;background:#fff;padding:20px;border-radius:18px;box-shadow:0 6px 24px rgba(15,23,42,.07)}.formulario input,.formulario textarea{padding:12px;border:1px solid #d1d5db;border-radius:12px;font:inherit}
.pie{background:#0f172a;color:#cbd5e1;text-align:center;padding:22px 0}`,
    tablas: [
      {
        nombre: "planes",
        columnas: [
          { nombre: "nombre", tipo: "texto" },
          { nombre: "precio", tipo: "numero" },
          { nombre: "ram", tipo: "texto" },
          { nombre: "cpu", tipo: "texto" },
          { nombre: "disco", tipo: "texto" },
          { nombre: "descripcion", tipo: "texto" },
        ],
        filas: [
          { nombre: "Básico", precio: 99, ram: "2 GB de RAM", cpu: "1 núcleo", disco: "10 GB NVMe", descripcion: "Ideal para amigos (hasta 10 jugadores)." },
          { nombre: "Pro", precio: 199, ram: "4 GB de RAM", cpu: "2 núcleos", disco: "20 GB NVMe", descripcion: "Mods y plugins sin problema." },
          { nombre: "Élite", precio: 349, ram: "8 GB de RAM", cpu: "4 núcleos", disco: "40 GB NVMe", descripcion: "Para comunidades grandes y modpacks." },
          { nombre: "Bot de Discord", precio: 59, ram: "512 MB de RAM", cpu: "Compartido", disco: "2 GB", descripcion: "Tu bot encendido 24/7." },
        ],
      },
    ],
  },
  {
    id: "blanco",
    nombre: "En blanco",
    descripcion: "Empieza desde cero arrastrando bloques.",
    emoji: "📄",
    html: `<section class="contenedor"><h1>Título de tu página</h1><p>Arrastra bloques desde la izquierda para empezar.</p></section>`,
    css: BASE,
  },
];

/** Tipografías de Google Fonts que ofrece el editor. */
export const FUENTES_GOOGLE = ["Poppins", "Montserrat", "Roboto", "Open Sans", "Lato", "Playfair Display", "Lobster", "Pacifico", "Bebas Neue", "Press Start 2P"];
