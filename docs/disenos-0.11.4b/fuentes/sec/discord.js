iconosExtra(`<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></symbol><symbol id="i-square-check-big" viewBox="0 0 24 24"><path d="M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5"/><path d="m9 11 3 3L22 4"/></symbol><symbol id="i-wrench" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></symbol><symbol id="i-triangle-alert" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></symbol><symbol id="i-type" viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></symbol><symbol id="i-strikethrough" viewBox="0 0 24 24"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/></symbol><symbol id="i-quote" viewBox="0 0 24 24"><path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/></symbol><symbol id="i-code" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></symbol><symbol id="i-bold" viewBox="0 0 24 24"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></symbol><symbol id="i-italic" viewBox="0 0 24 24"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></symbol><symbol id="i-list" viewBox="0 0 24 24"><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/></symbol><symbol id="i-message-square" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></symbol>`);
const DC_SERV = [
  { n: "Mexicanland Network", c: "#7c5cff", m: 128, on: 23, can: ["anuncios", "general", "minecraft", "soporte", "registros"] },
  { n: "Amigos del server", c: "#e0457b", m: 14, on: 5, can: ["general", "partidas", "memes"] },
  { n: "Pruebas del bot", c: "#0ea5e9", m: 3, on: 1, can: ["pruebas", "registros"] },
];
const DC_MSJ = [
  { a: "Tu bot", c: "#7c5cff", bot: true, fij: true, f: "hace 2 h", t: "", tj: { t: "Mantenimiento el sábado", d: "El servidor de Minecraft se apaga de 11 p. m. a 12 a. m. para el respaldo. No se pierde nada.", col: "#f5c451" } },
  { a: "Lalo", c: "#e0457b", f: "hace 40 min", t: "¿A qué hora vuelve el server? 👀", r: [["👀", 3]] },
  { a: "Sofi", c: "#f59e0b", f: "hace 25 min", t: "Ya pude entrar con el nuevo puerto, gracias!!", r: [["🎉", 2], ["❤️", 1]] },
  { a: "Tu bot", c: "#7c5cff", bot: true, f: "hace 10 min", t: "El servidor ya está en línea ✅ Pueden entrar con la dirección de siempre." },
  { a: "Andrés", c: "#8b5cf6", f: "hace 4 min", t: "Se siente más rápido que antes, buen trabajo 🔥", r: [["🔥", 4]] },
];
const DC_EMO = ["👍", "✅", "🎉", "❤️", "🔥", "😂", "👀"];
const dcSolo = () => `<span class="dc-solo">${ic("lock")}Solo tú e invitados</span>`;
const dcAv = (n, c, t = 40, cuad = false) => `<span class="dc-av ${cuad ? "cuad" : ""}" style="width:${t}px;height:${t}px;background:${c};font-size:${Math.round(t * 0.4)}px">${esc(n.slice(0, 1))}</span>`;
const dcPag = (n, act = 1) => `<nav class="dc-pag" aria-label="Páginas"><button class="btn icono chico" aria-label="Anterior">${ic("chevron-left")}</button>${Array.from({ length: n }, (_, i) => `<button class="dc-pn ${i + 1 === act ? "on" : ""}" onclick="dcPagina(this)">${i + 1}</button>`).join("")}<button class="btn icono chico" aria-label="Siguiente">${ic("chevron-right")}</button></nav>`;
function dcPagina(b) { b.parentElement.querySelectorAll(".dc-pn").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }
const dcTarjeta = (tj) => `<div class="dc-emb" style="--col:${tj.col}"><b>${esc(tj.t)}</b><p>${esc(tj.d)}</p>${tj.img ? `<div class="dc-emb-img"></div>` : ""}</div>`;
const dcAcc = (m) => `<div class="dc-acc">${m.bot ? `<button class="btn chico">${ic("pencil")}<span class="dc-tx">Editar</span></button>` : ""}<button class="btn chico">${ic(m.fij ? "pin-off" : "pin")}<span class="dc-tx">${m.fij ? "Desfijar" : "Fijar"}</span></button><button class="btn chico dc-borrar">${ic("trash-2")}<span class="dc-tx">Borrar</span></button><span class="dc-emos">${ic("smile-plus")}${DC_EMO.map((e) => `<button>${e}</button>`).join("")}</span></div>`;
const dcMsj = (m, acc = false) => `<div class="dc-m ${acc ? "hover" : ""}">${dcAv(m.a, m.c, 40)}<div class="t"><div class="l1"><b style="color:${m.bot ? "#c4adff" : "var(--texto)"}">${esc(m.a)}</b>${m.bot ? `<span class="dc-bot">BOT</span>` : ""}${m.fij ? `<span class="dc-fij">${ic("pin")}fijado</span>` : ""}<small>${m.f}</small></div>${m.t ? `<p>${esc(m.t)}</p>` : ""}${m.tj ? dcTarjeta(m.tj) : ""}${m.r ? `<div class="dc-reac">${m.r.map(([e, n]) => `<span>${e} ${n}</span>`).join("")}</div>` : ""}${acc ? dcAcc(m) : ""}</div></div>`;
const dcIa = (txt = "¡Listo! El servidor de Minecraft ya está en línea con la versión 1.21. Si no pueden entrar, avísenme en #soporte 🙌") => `<div class="dc-ia"><div class="dc-ia-cab">${ic("sparkles")}<b>La IA propone este mensaje</b><span class="dc-canal">#anuncios</span></div><p>${esc(txt)}</p><div class="dc-ia-acc"><button class="btn primario chico">${ic("check")}Aprobar y enviar</button><button class="btn borde chico">${ic("pencil")}Editar</button><button class="btn chico">Descartar</button></div></div>`;
const dcAviso = () => `<p class="dc-nota">${ic("info")}Las menciones masivas (@everyone y roles) se desactivan al enviar. Para ver el texto de los mensajes, tu bot necesita «Message Content Intent».</p>`;
const dcSelCanal = (s = "Mexicanland Network", c = "anuncios") => `<button class="dc-sel">${ic("hash")}<span><small>${esc(s)}</small><b>${c}</b></span>${ic("chevron-down")}</button>`;
const dcPrev = (tj, txt) => `<div class="dc-prev"><small class="dc-et">Vista previa</small><div class="dc-prev-in">${dcAv("T", "#7c5cff", 40)}<div class="t"><div class="l1"><b style="color:#c4adff">Tu bot</b><span class="dc-bot">BOT</span><small>Hoy a las 10:24</small></div>${txt ? `<p>${esc(txt)}</p>` : ""}${tj ? dcTarjeta(tj) : ""}</div></div></div>`;
const DC_TJ = { t: "¡Nueva temporada! 🎉", d: "Este viernes a las 8 p. m. abrimos el mundo nuevo. Habrá premios para los primeros 10 en llegar al End.", col: "#7c5cff", img: true };
const dcCampos = () => `<div class="dc-campos"><label class="dc-ch">${ic("square-check-big")}<span>Agregar tarjeta con título, color e imagen</span></label>
  <div class="dc-in">${esc(DC_TJ.t)}</div><div class="dc-in alto">${esc(DC_TJ.d)}</div>
  <div class="dc-fila2"><span class="dc-color"><i style="background:${DC_TJ.col}"></i>Color</span><div class="dc-in">${ic("image")}https://ejemplo.com/portada.png</div></div><div class="dc-in">${ic("link-2")}Enlace del título (opcional)</div></div>`;
Object.assign(PAGINAS, {
  "discord-1"() {
    const s = DC_SERV[0];
    return `<div class="pagina dc dc1"><div class="dc1-marco">
      <nav class="dc1-riel">${DC_SERV.map((x, i) => `<span class="dc1-sv ${i === 0 ? "on" : ""}" title="${esc(x.n)}">${dcAv(x.n, x.c, 46, true)}</span>`).join("")}<span class="dc1-sep"></span><span class="dc1-sv mas" title="Cómo agregar tu bot a otro servidor">${ic("plus")}</span></nav>
      <aside class="dc1-canales"><div class="dc1-scab"><b>${esc(s.n)}</b><small>${ic("users")}${s.m} miembros · ${s.on} conectados</small></div>${dcSolo()}<div class="dc1-sec">Canales de texto</div>${s.can.map((c, i) => `<span class="dc1-can ${i === 0 ? "on" : ""}">${ic("hash")}${c}${i === 2 ? `<i class="dc1-nv">3</i>` : ""}</span>`).join("")}<div class="dc1-bot">${dcAv("T", "#7c5cff", 32)}<span><b>Tu bot</b><small><span class="punto ok"></span>En línea</small></span></div></aside>
      <section class="dc1-chat"><header class="dc1-ccab">${ic("hash")}<b>anuncios</b><span class="dc1-desc">Avisos del servidor</span><span class="dc-esp"></span><span class="dc1-solo-cel">${dcSelCanal()}</span><button class="btn chico borde">${ic("refresh-cw")}<span class="dc-tx">Actualizar</span></button><a class="btn chico borde" href="#/discord-1/abierta">${ic("maximize-2")}<span class="dc-tx">Pantalla completa</span></a></header>
        <div class="dc1-msjs">${dcMsj(DC_MSJ[0])}${dcMsj(DC_MSJ[1])}${dcMsj(DC_MSJ[2])}${dcMsj(DC_MSJ[3], true)}${dcMsj(DC_MSJ[4])}</div>
        <div class="dc1-env">${dcIa()}<div class="dc1-caja"><button class="btn icono chico" aria-label="Agregar tarjeta">${ic("plus")}</button><span class="t">Escribe en #anuncios…</span><span class="dc-cont">0/2000</span><button class="btn icono chico" aria-label="Que la IA lo redacte">${ic("sparkles")}</button><button class="btn primario icono chico" aria-label="Enviar">${ic("send")}</button></div></div></section>
    </div></div>`;
  },
  "discord-2"() {
    return `<div class="pagina dc dc2">${encabezado("Discord", "Todo con tu bot. La IA también puede redactar; se envía solo cuando apruebas.", dcSolo())}
      <div class="dc2-pest"><span class="on">${ic("send")}Enviar</span><span>${ic("message-square")}Mensajes del canal</span><span>${ic("users")}Servidores</span></div>
      <div class="dc2-grid"><div class="tarjeta dc2-form"><h3>${ic("square-pen")}Nuevo mensaje</h3>${dcSelCanal()}<div class="dc-in alto grande-dc">Hoy en la noche abrimos el mundo nuevo, ¡los espero! **No falten** 🎉</div><div class="dc2-cont"><span>58/2000</span><button class="btn chico borde">${ic("sparkles")}Que la IA lo redacte</button></div>${dcCampos()}${dcAviso()}<div class="dc2-env"><a class="btn borde" href="#/discord-4/abierta">${ic("maximize-2")}Escribir en grande</a><button class="btn primario">${ic("send")}Enviar a #anuncios</button></div></div>
        <div class="dc2-der">${dcPrev(DC_TJ, "Hoy en la noche abrimos el mundo nuevo, ¡los espero! No falten 🎉")}${dcIa()}</div></div></div>`;
  },
  "discord-3"() {
    const tarjeta = (s, i) => `<article class="dc3-sv"><div class="dc3-portada" style="--c:${s.c}"></div><div class="dc3-cab">${dcAv(s.n, s.c, 52, true)}<div class="t"><b>${esc(s.n)}</b><small><span class="punto ok"></span>${s.on} conectados · ${s.m} miembros</small></div></div>
      <div class="dc3-can">${s.can.map((c, k) => `<span class="${i === 0 && k === 0 ? "on" : ""}">${ic("hash")}${c}</span>`).join("")}</div>
      <div class="dc3-ult"><small>Lo último</small>${i === 0 ? `<p><b>Andrés</b> Se siente más rápido que antes, buen trabajo 🔥</p><p><b class="dc3-b">Tu bot</b> El servidor ya está en línea ✅</p>` : i === 1 ? `<p><b>Mía</b> ¿Jugamos hoy en la noche?</p><p><b>Lalo</b> Yo me apunto 🙋</p>` : `<p><b class="dc3-b">Tu bot</b> Prueba de tarjeta con color</p>`}</div>
      <div class="dc3-pie"><button class="btn borde chico">${ic("message-square")}Ver mensajes</button><button class="btn primario chico">${ic("send")}Escribir</button></div></article>`;
    return `<div class="pagina dc dc3">${encabezado("Discord", "Tus servidores con tu bot, de un vistazo.", `${dcSolo()}<button class="btn borde">${ic("refresh-cw")}Actualizar</button>`)}
      <div class="dc3-num"><div><small>Servidores</small><b>3</b></div><div><small>Miembros</small><b>145</b></div><div><small>Conectados ahora</small><b>29</b></div><div class="ia"><small>La IA propone</small><b>1 mensaje</b><button class="btn primario chico">Revisar</button></div></div>
      <div class="dc3-grid">${DC_SERV.map(tarjeta).join("")}<article class="dc3-sv dc3-nuevo">${ic("plus")}<b>Agregar tu bot a otro servidor</b><small>Usa el enlace de invitación de tu app en el portal de desarrolladores de Discord (OAuth2 → URL Generator, permiso «bot»).</small></article></div>
      <div class="dc3-rapido">${ic("hash")}<span class="dc3-donde">anuncios</span><span class="t">Escribe un mensaje rápido…</span><button class="btn icono chico" aria-label="Tarjeta">${ic("palette")}</button><button class="btn icono chico" aria-label="IA">${ic("sparkles")}</button><button class="btn primario chico">${ic("send")}<span class="dc-tx">Enviar</span></button></div></div>`;
  },
  "discord-4"() {
    const pl = [["megaphone", "Anuncio", "#7c5cff", true], ["calendar-clock", "Evento", "#22c55e"], ["wrench", "Mantenimiento", "#f5c451"], ["user-plus", "Bienvenida", "#0ea5e9"], ["triangle-alert", "Aviso importante", "#ff6b81"]];
    return `<div class="pagina dc dc4">${encabezado("Discord", "Arma anuncios bonitos con tarjeta y míralos antes de enviar.", `${dcSolo()}<a class="btn primario" href="#/discord-4/abierta">${ic("maximize-2")}Abrir en grande</a>`)}
      <div class="dc4-grid"><aside class="dc4-pl"><div class="dc4-sec">Plantillas</div>${pl.map(([i, n, c, on]) => `<button class="dc4-p ${on ? "on" : ""}"><span style="background:${c}">${ic(i)}</span>${n}</button>`).join("")}<div class="dc4-sec">Enviados hace poco</div>${["Mantenimiento el sábado", "El server ya está en línea", "Reglas del canal"].map((t, i) => `<div class="dc4-env"><b>${t}</b><small>#${i === 2 ? "general" : "anuncios"} · ${["hace 2 h", "hace 10 min", "lun"][i]}</small></div>`).join("")}${dcPag(3)}</aside>
        <section class="tarjeta dc4-ed"><div class="dc4-ecab">${dcSelCanal()}<button class="btn chico borde">${ic("sparkles")}<span class="dc-tx">Que la IA lo mejore</span></button></div>
          <label class="dc4-l">Texto arriba de la tarjeta</label><div class="dc-in">@aquí ¡Nueva temporada!</div>
          <label class="dc4-l">Tarjeta</label>${dcCampos()}${dcAviso()}<div class="dc4-pie"><button class="btn borde">Guardar como plantilla</button><button class="btn primario">${ic("send")}Enviar a #anuncios</button></div></section>
        <aside class="dc4-vista">${dcPrev(DC_TJ, "@aquí ¡Nueva temporada!")}<div class="dc4-tel"><small class="dc-et">En el celular</small><div class="dc4-tel-in">${dcPrev(DC_TJ, "")}</div></div></aside></div></div>`;
  },
});
function dcAbierta(n) {
  if (n === 1) {
    const s = DC_SERV[0];
    return `<div class="pagina pleno dc dc-ab dc-ab1"><header class="dc-ab-top"><a class="btn icono" href="#/discord-1" aria-label="Volver">${ic("arrow-left")}</a>${ic("hash")}<div class="t"><b>anuncios</b><small>${esc(s.n)}</small></div><span class="dc-esp"></span>${dcSolo()}<button class="btn chico borde">${ic("refresh-cw")}<span class="dc-tx">Actualizar</span></button></header>
      <div class="dc-ab-cuerpo"><section class="dc-ab-chat"><div class="dc1-msjs">${DC_MSJ.map((m, i) => dcMsj(m, i === 3)).join("")}</div>
        <div class="dc-ab-env"><div class="dc-ab-barra"><button class="btn chico on">${ic("type")}Texto</button><button class="btn chico">${ic("palette")}Tarjeta</button><button class="btn chico">${ic("image")}Imagen</button><span class="dc-esp"></span><button class="btn chico borde">${ic("sparkles")}<span class="dc-tx">Que la IA lo redacte</span></button></div>
          <div class="dc-ab-area" contenteditable="true">Les dejo las reglas nuevas del servidor:

1. Nada de spam en #general.
2. Las dudas del server van en #soporte.
3. Respeten a todos, sin excepción.

Si tienen preguntas, avisen 🙌</div><div class="dc-ab-pie"><span class="dc-cont">178/2000</span><span class="dc-esp"></span><button class="btn primario">${ic("send")}Enviar</button></div></div></section>
        <aside class="dc-ab-lado"><div class="dc-ab-sec">Fijados</div>${dcTarjeta(DC_MSJ[0].tj)}<div class="dc-ab-sec">Conectados · ${s.on}</div>${[["Lalo", "#e0457b"], ["Sofi", "#f59e0b"], ["Andrés", "#8b5cf6"], ["Mía", "#ef4444"], ["Diego", "#0ea5e9"]].map(([n, c]) => `<div class="dc-ab-mi">${dcAv(n, c, 30)}<span>${n}</span><span class="punto ok"></span></div>`).join("")}</aside></div></div>`;
  }
  return `<div class="pagina pleno dc dc-ab dc-ab4"><header class="dc-ab-top"><a class="btn icono" href="#/discord-4" aria-label="Volver">${ic("arrow-left")}</a><div class="t"><b>Nuevo anuncio</b><small>Plantilla: Anuncio · guardado</small></div><span class="dc-esp"></span><span class="dc-ab-donde">${dcSelCanal()}</span><button class="btn primario chico">${ic("send")}Enviar</button></header>
    <div class="dc-ab4-cuerpo"><main class="dc-ab4-ed"><input class="dc-ab4-tit" value="¡Nueva temporada! 🎉"><div class="dc-ab4-herr">${[["bold", "Negrita"], ["italic", "Cursiva"], ["strikethrough", "Tachado"], ["list", "Lista"], ["quote", "Cita"], ["code", "Código"], ["smile-plus", "Emoji"]].map(([i, n]) => `<button class="btn icono chico" aria-label="${n}">${ic(i)}</button>`).join("")}<span class="dc-esp"></span><span class="dc-cont">412/4000</span></div>
      <div class="dc-ab-area dc-gr" contenteditable="true">Este viernes a las 8 p. m. abrimos el mundo nuevo.

**Qué hay de nuevo**
- Mapa más grande y con aldeas nuevas.
- Tienda del server con cosas cosméticas.
- Premios para los primeros 10 en llegar al End.

**Cómo entrar**
Usa la misma dirección de siempre. Si no te deja, escribe en #soporte y te ayudamos.

¡Los esperamos! 🙌</div>
      <div class="dc-ab4-opc"><span class="dc-color"><i style="background:#7c5cff"></i>Color</span><div class="dc-in">${ic("image")}portada-temporada.png</div><div class="dc-in">${ic("link-2")}Enlace (opcional)</div></div>${dcAviso()}</main>
    <aside class="dc-ab4-prev">${dcPrev({ ...DC_TJ, d: "Este viernes a las 8 p. m. abrimos el mundo nuevo. Mapa más grande, tienda del server y premios para los primeros 10 en llegar al End." }, "@aquí")}${dcIa("Te sugiero agregar la hora en el título para que se vea en las notificaciones: «¡Nueva temporada este viernes, 8 p. m.! 🎉»")}</aside></div></div>`;
}
["discord-1", "discord-4"].forEach((k) => { const base = PAGINAS[k]; PAGINAS[k] = () => (rutaActual().sub === "abierta" ? dcAbierta(k === "discord-1" ? 1 : 4) : base()); });
