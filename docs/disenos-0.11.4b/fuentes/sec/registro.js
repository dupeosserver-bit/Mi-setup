iconosExtra(`<symbol id="i-user" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol><symbol id="i-bot" viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></symbol><symbol id="i-download" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></symbol><symbol id="i-lock" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></symbol><symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol><symbol id="i-list-filter" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></symbol><symbol id="i-braces" viewBox="0 0 24 24"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></symbol><symbol id="i-activity" viewBox="0 0 24 24"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></symbol><symbol id="i-calendar" viewBox="0 0 24 24"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></symbol><symbol id="i-maximize-2" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></symbol><symbol id="i-arrow-left" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></symbol><symbol id="i-circle-x" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></symbol><symbol id="i-triangle-alert" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></symbol><symbol id="i-list" viewBox="0 0 24 24"><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/></symbol><symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></symbol>`);
const RG_EV = [
  ["10:42", "Hoy", "usuario", "Yahir", "Entró a Mi Setup", "Cuenta", "PC de jokee", "198.51.100.14", "ok", { equipo: "PC de jokee · Windows 11", metodo: "Contraseña + huella" }],
  ["10:38", "Hoy", "ia", "IA", "Propuso reiniciar el panel", "Pterodactyl", "panel", "—", "ok", { propuesta: "cd /var/www/pterodactyl && php artisan up", riesgo: "Revisar" }],
  ["10:39", "Hoy", "usuario", "Yahir", "Aprobó la propuesta de la IA", "Pterodactyl", "panel", "198.51.100.14", "ok", { propuesta: "Reiniciar el panel", aprobado_con: "Huella" }],
  ["10:39", "Hoy", "sistema", "Sistema", "Ejecutó el comando aprobado", "Pterodactyl", "panel", "—", "ok", { duracion: "2.4 s", salida: "Application is now live." }],
  ["09:47", "Hoy", "sistema", "Sistema", "Bloqueó una dirección", "Seguridad del servidor", "vps", "198.51.100.23", "denegado", { motivo: "8 contraseñas fallidas", bloqueo: "1 hora" }],
  ["09:12", "Hoy", "usuario", "Sofía", "Intentó abrir Contraseñas y 2FA", "Contraseñas y 2FA", "Bóveda", "203.0.113.61", "denegado", { motivo: "Su rol no tiene permiso", rol: "Invitada" }],
  ["08:30", "Hoy", "usuario", "Yahir", "Guardó una nota", "Bloc de notas", "Pendientes de la semana", "203.0.113.40", "ok", { equipo: "A56 de jokee · Android 16" }],
  ["06:00", "Hoy", "sistema", "Sistema", "Creó un respaldo automático", "Respaldos", "Base de Mi Setup", "—", "ok", { tamano: "18 MB", guardado_en: "/root/mi-setup/backups" }],
  ["04:30", "Hoy", "sistema", "Sistema", "Revisión del antivirus", "Seguridad del servidor", "vps", "—", "ok", { archivos: "48,210", amenazas: 0 }],
  ["23:14", "Ayer", "ia", "IA", "Propuso borrar archivos sueltos", "Archivos", "/root/descargas", "—", "ok", { archivos: 14, espacio: "1.2 GB" }],
  ["23:15", "Ayer", "usuario", "Yahir", "Rechazó la propuesta de la IA", "Archivos", "/root/descargas", "198.51.100.14", "ok", { motivo: "Los quiero revisar primero" }],
  ["21:10", "Ayer", "usuario", "Yahir", "Abrió el puerto 25565", "Seguridad del servidor", "vps", "198.51.100.14", "ok", { protocolo: "tcp", para: "Minecraft" }],
  ["19:02", "Ayer", "sistema", "Sistema", "No pudo enviar un aviso", "Alertas de caída", "mexicanland.net", "—", "error", { error: "El celular no respondió", reintento: "en 5 min" }],
  ["17:45", "Ayer", "usuario", "Diego", "Cambió una suscripción", "Mis finanzas", "Spotify", "203.0.113.77", "ok", { antes: "$129", despues: "$149" }],
];
const RG_ICO = { usuario: "user", ia: "bot", sistema: "server" };
const RG_RES = { ok: "Correcto", denegado: "Denegado", error: "Error" };
const rgPag = (n, act = 1) => `<nav class="rg-pag" aria-label="Páginas"><button type="button" class="btn icono chico" aria-label="Anterior">${ic("chevron-left")}</button>${Array.from({ length: n }, (_, i) => `<button type="button" class="btn chico ${i + 1 === act ? "activo" : ""}" onclick="rgPagina(this)">${i + 1}</button>`).join("")}<button type="button" class="btn icono chico" aria-label="Siguiente">${ic("chevron-right")}</button></nav>`;
function rgPagina(b) { b.parentElement.querySelectorAll(".btn").forEach((x) => x.classList.remove("activo")); b.classList.add("activo"); }
const rgIns = (r) => `<span class="rg-ins ${r}">${RG_RES[r]}</span>`;
const rgQuien = (a, u) => `<span class="rg-q ${a}">${ic(RG_ICO[a])}</span>`;
const rgDet = (d) => `<dl class="rg-det">${Object.entries(d).map(([k, v]) => `<div><dt>${k.replace(/_/g, " ")}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
const rgSel = (t) => `<button type="button" class="rg-sel"><span>${t}</span>${ic("chevron-down")}</button>`;
const rgFiltros = () => `<div class="rg-filtros">${rgSel("Todos los módulos")}${rgSel("Todas las acciones")}${rgSel("Usuarios, IA y sistema")}${rgSel("Cualquier resultado")}</div>`;
const rgExport = `<button type="button" class="btn borde">${ic("download")}Exportar CSV</button>`;
const rgDesc = "Nadie puede editarlo ni borrarlo. Incluye cada propuesta, aprobación y resultado de la IA.";
const rgCandado = `<span class="rg-candado">${ic("lock")}Solo lectura</span>`;
Object.assign(PAGINAS, {
  "registro-1"() {
    const fila = ([h, d, a, u, ac, m, o, ip, r, det], k) => `<div class="rg1-f ${k === 1 ? "abierta" : ""}"><div class="rg1-r"><span class="rg1-h">${d === "Hoy" ? "" : "Ayer "}${h}</span><span class="rg1-quien">${rgQuien(a)}<b>${u}</b></span><span class="rg1-acc"><b>${ac}</b><small>${o}</small></span><span class="rg1-mod">${m}</span><span class="rg1-ip">${ip}</span>${rgIns(r)}<span class="rg1-v">${ic(k === 1 ? "chevron-down" : "chevron-right")}</span></div>${k === 1 ? rgDet(det) : ""}</div>`;
    return `<div class="pagina rg rg1">${encabezado("Registro de actividad", rgDesc, rgExport)}
      <div class="rg1-barra"><div class="rg-busca">${ic("search")}<span>Buscar en el registro…</span></div>${rgFiltros()}</div>
      <div class="tarjeta rg1-tabla"><div class="rg1-cab"><span>Cuándo</span><span>Quién</span><span>Qué pasó</span><span>Módulo</span><span>Desde</span><span>Resultado</span><span></span></div>${RG_EV.slice(0, 10).map(fila).join("")}</div>
      <div class="rg1-pie"><small>Mostrando 1–10 de 1,284</small>${rgPag(5)}${rgCandado}</div></div>`;
  },
  "registro-2"() {
    const dias = ["Hoy", "Ayer"];
    const ev = ([h, , a, u, ac, m, o, ip, r]) => `<div class="rg2-ev ${r}"><span class="rg2-pto ${a}">${ic(RG_ICO[a])}</span><div class="rg2-c"><div class="rg2-l1"><b>${ac}</b>${r !== "ok" ? rgIns(r) : ""}<span class="rg2-h">${h}</span></div><small>${u} · ${m} · ${o}${ip !== "—" ? ` · ${ip}` : ""}</small></div></div>`;
    const cuenta = (r) => RG_EV.filter((e) => e[8] === r).length;
    return `<div class="pagina rg rg2">${encabezado("Registro de actividad", rgDesc, rgExport)}
      <div class="rg2-chips">${[["Todo", ""], ["Usuarios", "user"], ["IA", "bot"], ["Sistema", "server"], ["Denegado", "triangle-alert"], ["Error", "circle-x"]].map(([t, i], k) => `<button type="button" class="${k === 0 ? "on" : ""}">${i ? ic(i) : ""}${t}</button>`).join("")}<span class="rg2-esp"></span>${rgSel("Todos los módulos")}</div>
      <div class="rg2-marco"><section class="rg2-linea">${dias.map((d) => `<div class="rg2-dia"><h4>${d}<small>${d === "Hoy" ? "jueves 22 de octubre" : "miércoles 21 de octubre"}</small></h4>${RG_EV.filter((e) => e[1] === d).map(ev).join("")}</div>`).join("")}${rgPag(6)}</section>
        <aside class="rg2-lado"><div class="tarjeta"><h3>${ic("activity")}Últimos 7 días</h3><div class="rg2-tot"><span><b>1,284</b>cosas</span><span><b class="ok">${cuenta("ok") * 88}</b>correctas</span><span><b class="aviso">${cuenta("denegado") * 9}</b>denegadas</span><span><b class="mal">${cuenta("error") * 3}</b>errores</span></div>
          <div class="rg2-quien">${[["user", "Usuarios", 52], ["bot", "IA", 18], ["server", "Sistema", 30]].map(([i, t, p]) => `<div><span>${ic(i)}${t}</span><span class="rg2-b"><i style="width:${p}%"></i></span><small>${p} %</small></div>`).join("")}</div></div>
          <div class="tarjeta"><h3>${ic("bot")}La IA esta semana</h3><div class="rg2-ia"><span><b>11</b>propuso</span><span><b class="ok">8</b>aprobaste</span><span><b class="mal">3</b>rechazaste</span></div><p class="rg-sub">Nada de la IA se hace sin tu «Aprobar». Cada paso queda aquí.</p></div>
          <div class="tarjeta rg2-inm">${ic("lock")}<div><b>Registro sellado</b><p class="rg-sub">Nadie puede editarlo ni borrarlo, ni siquiera tú.</p></div></div></aside></div></div>`;
  },
  "registro-3"() {
    const it = ([h, d, a, u, ac, m, , , r], k) => `<button type="button" class="rg3-it ${k === 1 ? "on" : ""}">${rgQuien(a)}<span class="rg3-t"><b>${ac}</b><small>${u} · ${m}</small></span><span class="rg3-d"><small>${d === "Hoy" ? h : "Ayer"}</small><i class="rg-pt ${r}"></i></span></button>`;
    const e = RG_EV[1];
    const cadena = [[RG_EV[1], "Propuesta"], [RG_EV[2], "Aprobación"], [RG_EV[3], "Resultado"]];
    return `<div class="pagina rg rg3">${encabezado("Registro de actividad", rgDesc, rgExport)}
      <div class="rg3-marco"><section class="tarjeta rg3-lista"><div class="rg-busca">${ic("search")}<span>Buscar…</span><button type="button" class="btn icono chico" aria-label="Filtros">${ic("list-filter")}</button></div>${RG_EV.slice(0, 9).map(it).join("")}${rgPag(4)}</section>
        <section class="tarjeta rg3-det"><div class="rg3-dcab">${rgQuien(e[2])}<div><h2>${e[4]}</h2><small>Hoy, ${e[0]} · ${e[5]} · ${e[6]}</small></div>${rgIns(e[8])}</div>
          <div class="rg3-datos">${[["Quién", "La IA (asistente)"], ["Módulo", e[5]], ["Sobre qué", e[6]], ["Desde", "Servidor de Mi Setup"], ["Cuándo", "jueves 22 oct 2026, 10:38:12"], ["Número", "#48,211"]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("")}</div>
          <h4>Lo que propuso</h4><pre class="rg3-cod">cd /var/www/pterodactyl && php artisan up</pre>
          <h4>Qué pasó después</h4><div class="rg3-cadena">${cadena.map(([x, t], k) => `<div class="rg3-paso ${k === 0 ? "on" : ""}"><span class="rg3-n">${k + 1}</span><div><small>${t} · ${x[0]}</small><b>${x[4]}</b><span>${x[3]}${x[9].aprobado_con ? ` · con ${x[9].aprobado_con.toLowerCase()}` : ""}${x[9].salida ? ` · «${x[9].salida}»` : ""}</span></div></div>`).join("")}</div>
          <details class="rg3-crudo"><summary>${ic("braces")}Ver datos completos</summary></details></section></div></div>`;
  },
  "registro-4"() {
    if (rutaActual().sub === "abierta") return rgConsola();
    const horas = [2, 1, 0, 0, 3, 1, 9, 4, 12, 18, 22, 7, 5, 8, 6, 4, 9, 14, 11, 8, 13, 10, 7, 4];
    const max = Math.max(...horas);
    const top = [["Entró a Mi Setup", 214], ["Guardó una nota", 188], ["Revisión del antivirus", 96], ["Creó un respaldo automático", 84], ["Propuesta de la IA", 41]];
    return `<div class="pagina rg rg4">${encabezado("Registro de actividad", rgDesc, `${rgExport}<a class="btn primario" href="#/registro-4/abierta">${ic("maximize-2")}Abrir registro completo</a>`)}
      <div class="rg4-nums">${[["1,284", "cosas esta semana", ""], ["8", "aprobaciones de la IA", "ok"], ["23", "denegadas", "aviso"], ["3", "errores", "mal"]].map(([n, t, c]) => `<div class="tarjeta rg4-n"><b class="${c}">${n}</b><small>${t}</small></div>`).join("")}</div>
      <div class="rg4-dos"><div class="tarjeta"><h3>${ic("activity")}Hoy, por hora</h3><div class="rg4-barras">${horas.map((v, h) => `<span title="${h}:00 · ${v}"><i style="height:${Math.max(4, (v / max) * 100)}%"></i>${h % 6 === 0 ? `<small>${h}:00</small>` : ""}</span>`).join("")}</div></div>
        <div class="tarjeta"><h3>${ic("list")}Lo que más pasa</h3>${top.map(([t, n]) => `<div class="rg4-top"><span>${t}</span><span class="rg4-tb"><i style="width:${(n / 214) * 100}%"></i></span><b>${n}</b></div>`).join("")}</div></div>
      <div class="tarjeta"><div class="rg4-ucab"><h3>${ic("triangle-alert")}Lo que merece un vistazo</h3>${rgFiltros()}</div>${RG_EV.filter((e) => e[8] !== "ok").concat(RG_EV.filter((e) => e[2] === "ia")).map(([h, d, a, u, ac, m, o, ip, r]) => `<div class="rg4-f">${rgQuien(a)}<span class="rg4-t"><b>${ac}</b><small>${u} · ${m} · ${o}${ip !== "—" ? ` · ${ip}` : ""}</small></span>${rgIns(r)}<small class="rg4-h">${d === "Hoy" ? h : `Ayer ${h}`}</small></div>`).join("")}${rgPag(3)}</div></div>`;
  },
});
function rgConsola() {
  const col = { ok: "c-verde", denegado: "c-amarillo", error: "c-rojo" };
  const lin = RG_EV.concat(RG_EV.map((e) => [e[0], "Ayer", ...e.slice(2)])).map(([h, d, a, u, ac, m, o, ip, r, det], k) => `<div class="rg4c-l ${k === 4 ? "on" : ""}"><span class="rg4c-n">${48211 - k}</span><span class="rg4c-h">${d === "Hoy" ? "22-10" : "21-10"} ${h}:${String(12 + k * 3).padStart(2, "0")}</span><span class="rg4c-a ${a}">${a.toUpperCase().padEnd(7)}</span><span class="${col[r]}">${r.toUpperCase().padEnd(8)}</span><span class="rg4c-t">${esc(m)} · ${esc(ac)} · ${esc(o)}${ip !== "—" ? ` · ${ip}` : ""} <span class="rg4c-j">${esc(JSON.stringify(det))}</span></span></div>`).join("");
  return `<div class="pagina pleno rg rg4c"><header class="rg4c-top"><a class="btn icono" href="#/registro-4" aria-label="Volver">${ic("arrow-left")}</a><b>Registro completo</b>${rgCandado}<div class="rg-busca rg4c-busca">${ic("search")}<span>Bloqueó</span><small>1 de 4</small></div><span class="rg4c-esp"></span>${rgExport}</header>
    <div class="rg4c-fil">${rgFiltros()}<button type="button" class="btn chico borde">${ic("calendar")}Últimos 7 días</button><label class="rg4c-sw"><input type="checkbox" checked> Ver datos</label></div>
    <main class="rg4c-log">${lin}</main><footer class="rg4c-pie"><small>Líneas 48,184–48,211 de 48,211 · se agregan solas</small>${rgPag(9)}</footer></div>`;
}
