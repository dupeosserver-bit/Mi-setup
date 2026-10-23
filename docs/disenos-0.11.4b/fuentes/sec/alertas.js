iconosExtra(`<symbol id="i-tablet" viewBox="0 0 24 24"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="12" x2="12.01" y1="18" y2="18"/></symbol>
<symbol id="i-ellipsis" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></symbol>`);
const AL_SRV = [
  { n: "vps", d: "203.0.113.10:22", est: "arriba", rev: "hace 20 s", vig: true, cpu: 90, ram: 85, disco: 90, ms: 23, up: 100 },
  { n: "panel", d: "203.0.113.20:22", est: "arriba", rev: "hace 40 s", vig: true, cpu: null, ram: 90, disco: 80, ms: 88, up: 99.96 },
];
const AL_MON = [
  { n: "Sitio oficial", t: "http", d: "https://misetup.example.com", est: "arriba", ms: 120, rev: "hace 15 s", up: 99.98, sem: 2 },
  { n: "Servidor de Minecraft", t: "tcp", d: "play.example.net:25565", est: "caido", ms: null, rev: "hace 30 s", up: 97.4, sem: 5, caido: "hace 4 min" },
  { n: "Panel de juegos", t: "http", d: "https://panel.example.org", est: "arriba", ms: 210, rev: "hace 15 s", up: 99.9, sem: 3 },
  { n: "Nodo de juegos", t: "tcp", d: "203.0.113.20:8080", est: "arriba", ms: 88, rev: "hace 45 s", up: 99.95, sem: 7 },
  { n: "Tienda", t: "http", d: "https://tienda.example.com", est: "arriba", ms: 340, rev: "hace 1 min", up: 100, sem: 9 },
  { n: "Correo", t: "tcp", d: "203.0.113.10:587", est: "sin", ms: null, rev: "aún no", up: null, sem: 4 },
];
const AL_INC = [
  { n: "Servidor de Minecraft", q: "Se cayó", c: "hoy, 10:20", dur: "Sigue caído · 4 min", tipo: "caido", vivo: true },
  { n: "panel", q: "La memoria pasó de 90 %", c: "ayer, 22:14", dur: "Duró 6 min", tipo: "aviso" },
  { n: "Panel de juegos", q: "Se cayó", c: "ayer, 03:02", dur: "Volvió solo en 2 min", tipo: "caido" },
  { n: "Sitio oficial", q: "Tardó más de 2 s en abrir", c: "20 oct, 18:40", dur: "Duró 11 min", tipo: "aviso" },
  { n: "vps", q: "El disco pasó de 90 %", c: "18 oct, 09:05", dur: "Se arregló al borrar respaldos viejos", tipo: "aviso" },
];
const alTono = (e) => (e === "arriba" ? "ok" : e === "caido" ? "peligro" : "sin");
const alTexto = (e) => (e === "arriba" ? "En línea" : e === "caido" ? "Caído" : "Sin revisar");
const alInsig = (e) => `<span class="al-ins ${alTono(e)}"><i></i>${alTexto(e)}</span>`;
const alSw = (on, t = "Vigilar") => `<button class="al-sw ${on ? "on" : ""}" role="switch" aria-checked="${on}" onclick="this.classList.toggle('on')"><i></i><span>${t}</span></button>`;
const alUmb = (t, v) => `<label class="al-umb"><span>${t}</span><input type="number" value="${v ?? ""}" placeholder="—" min="1" max="100"><small>%</small></label>`;
const alDestino = (m) => `${m.t.toUpperCase()} · ${m.d}`;
function alBarras(m, n = 45) {
  if (m.up == null) return `<div class="al-barras">${Array.from({ length: n }, () => `<i class="sin"></i>`).join("")}</div>`;
  let x = m.sem * 7919;
  return `<div class="al-barras" aria-label="Últimos ${n} días">${Array.from({ length: n }, (_, i) => {
    x = (x * 9301 + 49297) % 233280;
    const malo = (m.up < 99.5 && x % 9 === 0) || (i === n - 1 && m.est === "caido") || (m.up < 100 && m.up >= 99.5 && x % 31 === 0);
    return `<i class="${malo ? "mal" : "ok"}" title="${malo ? "Hubo una caída" : "Todo en línea"}"></i>`;
  }).join("")}</div>`;
}
const alLeyBarras = `<div class="al-ley"><span><i class="ok"></i>En línea</span><span><i class="mal"></i>Hubo caída</span><span><i class="sin"></i>Sin datos</span><span class="al-ley-d">Últimos 45 días</span></div>`;
const alCuenta = () => { const c = AL_MON.filter((m) => m.est === "caido").length, a = AL_MON.filter((m) => m.est === "arriba").length + AL_SRV.length; return { c, a, t: AL_MON.length + AL_SRV.length }; };
const alNuevo = (compacto) => `<form class="al-form ${compacto ? "compacto" : ""}" onsubmit="event.preventDefault();avisar('Monitor agregado. Se revisa cada 60 s.')">
  <label class="al-campo"><span>Nombre</span><input placeholder="Servidor de Minecraft"></label>
  <div class="al-campo"><span>Tipo</span><div class="al-seg"><button type="button" class="on" onclick="alSeg(this)">${ic("globe")}Página web</button><button type="button" onclick="alSeg(this)">${ic("plug")}Servidor y puerto</button></div></div>
  <label class="al-campo"><span>Dirección</span><input placeholder="https://panel.example.org"></label>
  <label class="al-campo al-puerto"><span>Puerto</span><input type="number" placeholder="25565"></label>
  <button class="btn primario al-agregar" type="submit">${ic("plus")}Agregar</button></form>`;
function alSeg(b) { b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); }
const alAvisar = () => `<div class="al-avisar">
  ${[["monitor", "PC de jokee", "Aviso en la pantalla", true], ["smartphone", "A56 de jokee", "Notificación del celular", true], ["tablet", "Tablet", "Notificación", false]].map(([i, n, d, on]) => `<div class="al-av-f"><span class="al-av-i">${ic(i)}</span><span class="al-av-t"><b>${n}</b><small>${d}</small></span>${alSw(on, "")}</div>`).join("")}
  <div class="al-av-op"><span>Avisar también cuando vuelva</span>${alSw(true, "")}</div>
  <div class="al-av-op"><span>No molestar de 0:00 a 7:00 <small>(solo caídas importantes)</small></span>${alSw(false, "")}</div></div>`;
Object.assign(PAGINAS, {
  "alertas-1"() {
    const k = alCuenta();
    const srv = (s) => `<div class="al1-fila al1-srv"><span class="al1-ic">${ic("server")}</span><div class="al1-t"><b>${s.n}</b><small>${s.d} · revisado ${s.rev}</small></div>${alInsig(s.est)}<div class="al1-umbs">${alUmb("Procesador", s.cpu)}${alUmb("Memoria", s.ram)}${alUmb("Disco", s.disco)}</div>${alSw(s.vig)}</div>`;
    const mon = (m) => `<div class="al1-fila"><span class="al1-ic">${ic(m.t === "http" ? "globe" : "plug")}</span><div class="al1-t"><b>${m.n}</b><small>${alDestino(m)}${m.ms ? ` · ${m.ms} ms` : ""} · ${m.rev}</small></div><div class="al1-hist">${alBarras(m)}<span class="al1-up">${m.up == null ? "—" : m.up + " %"}</span></div>${alInsig(m.est)}<button class="btn icono chico" aria-label="Quitar">${ic("trash-2")}</button></div>`;
    return `<div class="pagina al al1">${encabezado("Alertas de caída", "Se revisa cada 60 s. Te avisamos cuando algo se cae o vuelve, o cuando la memoria o el disco pasan tu límite.", `<button class="btn primario">${ic("plus")}Monitor</button>`)}
      <div class="al1-banda ${k.c ? "mal" : ""}"><span class="al1-b-ic">${ic(k.c ? "circle-alert" : "circle-check")}</span><div><h2>${k.c ? `${k.c} cosa caída` : "Todo en línea"}</h2><p>${k.a} de ${k.t} en línea · Servidor de Minecraft no responde desde hace 4 min</p></div><a class="btn borde" href="#/termius-sesion">${ic("terminal")}Revisar en la terminal</a></div>
      <section class="tarjeta al1-sec"><div class="al-h"><h3>${ic("siren")} Tus servidores</h3><small>Avisa si pasa del límite que pongas</small></div>${AL_SRV.map(srv).join("")}</section>
      <section class="tarjeta al1-sec"><div class="al-h"><h3>${ic("radar")} Monitores <small class="al-cnt">${AL_MON.length}</small></h3>${alLeyBarras}</div>${AL_MON.slice(0, 5).map(mon).join("")}${rdPag(2)}</section></div>`;
  },
  "alertas-2"() {
    const k = alCuenta();
    const tile = (m, srv) => `<article class="al2-t ${alTono(m.est)}"><header><span class="al2-ic">${ic(srv ? "server" : m.t === "http" ? "globe" : "plug")}</span>${alInsig(m.est)}</header><b class="al2-n">${m.n}</b><small class="al2-d">${srv ? m.d : alDestino(m)}</small>
      <div class="al2-num"><div><span>Respuesta</span><b>${m.ms ? m.ms + " ms" : "—"}</b></div><div><span>Arriba 30 días</span><b>${m.up == null ? "—" : m.up + " %"}</b></div></div>
      ${m.up == null ? `<div class="al2-vacio">Aún no se revisa</div>` : rdChispa(rdSerie(m.sem || 3, 40, 50, 22, 5), m.est === "caido" ? "var(--peligro)" : "var(--acento)")}
      <footer>${srv ? `<span class="al2-chips"><i>CPU ${m.cpu ?? "—"}%</i><i>RAM ${m.ram}%</i><i>Disco ${m.disco}%</i></span>` : `<span>${m.caido ? "Caído " + m.caido : "Revisado " + m.rev}</span>`}${srv ? alSw(m.vig) : `<button class="btn icono chico" aria-label="Más">${ic("ellipsis")}</button>`}</footer></article>`;
    const chip = (t, n, on) => `<button class="al2-chip ${on ? "on" : ""}" onclick="alSeg(this)">${t}<b>${n}</b></button>`;
    return `<div class="pagina al al2">${encabezado("Alertas de caída", "Todo lo que vigilas, de un vistazo. Se revisa cada 60 s.", `<button class="btn primario">${ic("plus")}Monitor</button>`)}
      <div class="al2-filtros">${chip("Todos", k.t, true)}${chip("Caídos", k.c)}${chip("En línea", k.a)}${chip("Sin revisar", 1)}<span class="al2-esp"></span><span class="al2-busca">${ic("search")}<span>Buscar</span></span></div>
      <div class="al2-rej">${tile(AL_MON[1])}${AL_SRV.map((s) => tile(s, true)).join("")}${AL_MON.filter((m, i) => i !== 1).slice(0, 4).map((m) => tile(m)).join("")}<button class="al2-t al2-mas">${ic("plus")}<b>Nuevo monitor</b><small>Página web o servidor y puerto</small></button></div>${rdPag(2)}</div>`;
  },
  "alertas-3"() {
    const inc = (x) => `<li class="al3-i ${x.tipo} ${x.vivo ? "vivo" : ""}"><span class="al3-pt"></span><div class="al3-c"><div class="al3-ct"><b>${x.n}</b><span class="al-ins ${x.tipo === "caido" ? "peligro" : "aviso"}"><i></i>${x.q}</span></div><small>${x.c} · ${x.dur}</small></div>${x.vivo ? `<a class="btn borde chico" href="#/termius-sesion">${ic("terminal")}Revisar</a>` : ""}</li>`;
    const mini = (m) => `<div class="al3-m"><span class="punto ${m.est === "arriba" ? "ok" : ""}" style="${m.est === "caido" ? "background:var(--peligro)" : ""}"></span><span class="al3-mn">${m.n}</span><small>${m.ms ? m.ms + " ms" : alTexto(m.est)}</small></div>`;
    return `<div class="pagina al al3">${encabezado("Alertas de caída", "Qué se cayó, cuándo y cuánto duró. Se revisa cada 60 s.", `<button class="btn primario">${ic("plus")}Monitor</button>`)}
      <div class="al3-cuerpo">
        <aside class="tarjeta al3-ahora"><div class="al-h"><h3>${ic("radar")} Ahora</h3><small>${alCuenta().a} de ${alCuenta().t}</small></div>${AL_SRV.map((s) => mini(s)).join("")}<div class="al3-sep"></div>${AL_MON.map(mini).join("")}</aside>
        <section class="tarjeta al3-hist"><div class="al-h"><h3>${ic("history")} Historial de caídas</h3><div class="al3-rango"><button class="on" onclick="alSeg(this)">7 días</button><button onclick="alSeg(this)">30 días</button><button onclick="alSeg(this)">90 días</button></div></div>
          <div class="al3-res"><div><small>Caídas</small><b>3</b></div><div><small>Avisos de límite</small><b>2</b></div><div><small>Tiempo total caído</small><b>23 min</b></div><div><small>Tiempo arriba</small><b>99.7 %</b></div></div>
          <ol class="al3-linea">${AL_INC.map(inc).join("")}</ol>${rdPag(3)}</section>
        <aside class="tarjeta al3-quien"><div class="al-h"><h3>${ic("bell")} A quién avisar</h3></div>${alAvisar()}<p class="al3-nota">${ic("circle-alert")}Las personas con permiso en Cuentas y permisos también reciben el aviso.</p></aside>
      </div></div>`;
  },
  "alertas-4"() {
    const filaS = (s) => `<tr><td><span class="al4-n">${ic("server")}<b>${s.n}</b></span><small class="al4-sub">${s.d}</small></td><td>Servidor</td><td>${alInsig(s.est)}</td><td class="al4-num">${s.ms} ms</td><td class="al4-num">${s.up} %</td><td><span class="al4-lim">CPU ${s.cpu ?? "—"} · RAM ${s.ram} · Disco ${s.disco}</span></td><td>${alSw(s.vig, "")}</td><td><button class="btn icono chico" aria-label="Editar">${ic("pencil")}</button></td></tr>`;
    const filaM = (m) => `<tr class="${m.est === "caido" ? "mal" : ""}"><td><span class="al4-n">${ic(m.t === "http" ? "globe" : "plug")}<b>${m.n}</b></span><small class="al4-sub">${m.d}</small></td><td>${m.t === "http" ? "Página web" : "Servidor y puerto"}</td><td>${alInsig(m.est)}</td><td class="al4-num">${m.ms ? m.ms + " ms" : "—"}</td><td class="al4-num">${m.up == null ? "—" : m.up + " %"}</td><td><span class="al4-lim">${m.caido ? "Caído " + m.caido : m.rev}</span></td><td>${alSw(true, "")}</td><td><button class="btn icono chico" aria-label="Quitar">${ic("trash-2")}</button></td></tr>`;
    return `<div class="pagina al al4">${encabezado("Alertas de caída", "Todo en una tabla para revisar y cambiar rápido. Se revisa cada 60 s.")}
      <div class="al4-cuerpo"><section class="tarjeta al4-tabla"><div class="al-h"><h3>${ic("list-filter")} Lo que vigilas</h3><div class="al4-busca">${ic("search")}<span>Buscar por nombre o dirección</span></div></div>
        <div class="al4-scroll"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th class="al4-num">Respuesta</th><th class="al4-num">Arriba 30 d</th><th>Límites / última vez</th><th>Vigilar</th><th></th></tr></thead>
        <tbody><tr class="al4-g"><td colspan="8">Servidores</td></tr>${AL_SRV.map(filaS).join("")}<tr class="al4-g"><td colspan="8">Monitores</td></tr>${AL_MON.map(filaM).join("")}</tbody></table></div>${rdPag(2)}</section>
        <aside class="al4-lado"><section class="tarjeta"><div class="al-h"><h3>${ic("plus")} Nuevo monitor</h3></div>${alNuevo()}</section>
          <section class="tarjeta"><div class="al-h"><h3>${ic("sliders-horizontal")} Límites del vps</h3></div>${[["Procesador", 90], ["Memoria", 85], ["Disco", 90]].map(([t, v]) => `<div class="al4-sl"><div class="al4-slt"><span>${t}</span><b>${v} %</b></div><div class="al4-riel"><i style="width:${v}%"></i><span style="left:${v}%"></span></div></div>`).join("")}<small class="al4-ayuda">Te avisa cuando pase de este número.</small></section></aside></div></div>`;
  },
});
