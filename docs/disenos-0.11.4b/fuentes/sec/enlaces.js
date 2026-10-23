iconosExtra(`<symbol id="i-qr-code" viewBox="0 0 24 24"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></symbol>
<symbol id="i-mouse-pointer-click" viewBox="0 0 24 24"><path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/></symbol>
<symbol id="i-trash-2" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></symbol>
<symbol id="i-link-2" viewBox="0 0 24 24"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></symbol>
<symbol id="i-chart-column" viewBox="0 0 24 24"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></symbol>
<symbol id="i-external-link" viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></symbol>
<symbol id="i-power" viewBox="0 0 24 24"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
<symbol id="i-scissors-line-dashed" viewBox="0 0 24 24"><path d="M5.42 9.42 8 12"/><circle cx="4" cy="8" r="2"/><path d="m14 6-8.58 8.58"/><circle cx="4" cy="16" r="2"/><path d="M10.8 14.8 14 18"/><path d="M16 12h-2"/><path d="M22 12h-2"/></symbol>
<symbol id="i-calendar" viewBox="0 0 24 24"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></symbol>
<symbol id="i-ellipsis" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></symbol>
<symbol id="i-map-pin" viewBox="0 0 24 24"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></symbol>
`);
function enPagina(b) { b.parentElement.querySelectorAll(".btn").forEach((x) => x.classList.remove("activo")); b.classList.add("activo"); }
const enPag = (n, act = 1) => `<nav class="en-pag" aria-label="Páginas"><button class="btn icono chico" aria-label="Anterior">${ic("chevron-left")}</button>${Array.from({ length: n }, (_, i) => `<button class="btn chico ${i + 1 === act ? "activo" : ""}" onclick="enPagina(this)">${i + 1}</button>`).join("")}<button class="btn icono chico" aria-label="Siguiente">${ic("chevron-right")}</button></nav>`;
const EN_DOM = "setup.ejemplo.net/e/";
const EN = [
  { c: "torneo", u: "https://forms.ejemplo.com/torneo-de-minecraft-inscripciones-octubre-2026", k: 342, on: true, f: "12 oct", s: [4, 9, 12, 30, 22, 41, 58] },
  { c: "canal", u: "https://videos.ejemplo.com/canal/mi-setup-tour-completo-del-escritorio", k: 1284, on: true, f: "2 oct", s: [80, 120, 96, 140, 210, 180, 230] },
  { c: "menu-tacos", u: "https://drive.ejemplo.com/archivo/menu-de-la-taqueria-pdf-version-final", k: 97, on: true, f: "28 sep", s: [10, 14, 9, 18, 12, 20, 14] },
  { c: "descargas", u: "https://setup.ejemplo.net/descargas", k: 516, on: true, f: "20 sep", s: [40, 52, 60, 48, 70, 88, 95] },
  { c: "rifa", u: "https://forms.ejemplo.com/rifa-de-la-escuela-boletos-2026", k: 61, on: false, f: "4 sep", s: [12, 8, 6, 4, 2, 0, 0] },
  { c: "cv-yahir", u: "https://docs.ejemplo.com/curriculum-actualizado-2026", k: 23, on: true, f: "29 ago", s: [1, 3, 2, 5, 2, 4, 6] },
];
const enCorto = (e) => `<span class="en-corto"><span>${EN_DOM}</span><b>${e.c}</b></span>`;
const enEstado = (on) => `<span class="en-est ${on ? "on" : ""}">${on ? "Activo" : "Apagado"}</span>`;
const enSw = (on) => `<span class="en-sw ${on ? "on" : ""}" role="switch" aria-checked="${on}"><i></i></span>`;
const enAcc = () => `<span class="en-acc"><button class="btn icono chico" aria-label="Copiar" onclick="avisar('Copiado')">${ic("copy")}</button><button class="btn icono chico" aria-label="Hacer un QR con este enlace">${ic("qr-code")}</button><button class="btn icono chico" aria-label="Borrar">${ic("trash-2")}</button></span>`;
const enChispa = (s, c = "var(--acento)") => { const m = Math.max(...s, 1), p = s.map((v, i) => `${(i / (s.length - 1)) * 100},${30 - (v / m) * 26}`).join(" "); return `<svg class="en-chispa" viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="${p}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`; };
const enNuevo = (cls = "") => `<div class="en-nuevo ${cls}"><label class="en-campo en-largo"><small>Enlace largo</small><span class="en-in">${ic("link-2")}<span class="ph">https://www.instagram.com/…</span></span></label><label class="en-campo en-cort"><small>Nombre corto (opcional)</small><span class="en-in"><span class="en-pre">${EN_DOM}</span><span class="ph">abc123</span></span></label><button class="btn primario en-crear">${ic("scissors-line-dashed")}Acortar y copiar</button></div>`;
const enQR = (t = "") => { let r = ""; const n = 21; const h = (x, y) => ((x * 73856093) ^ (y * 19349663) ^ 0x5bd1e995) % 7 < 3; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const ojo = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); if (ojo) { const lx = x > 13 ? x - 14 : x, ly = y > 13 ? y - 14 : y; if (lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx > 1 && lx < 5 && ly > 1 && ly < 5)) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } else if (h(x, y)) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } return `<svg class="en-qr" viewBox="-2 -2 25 25" aria-label="QR ${t}"><rect x="-2" y="-2" width="25" height="25" fill="#fff"/><g fill="#15121f">${r}</g></svg>`; };

Object.assign(PAGINAS, {
  "enlaces-1"() {
    const fila = (e) => `<div class="en1-fila ${e.on ? "" : "apagado"}"><span class="en1-ic">${ic("link-2")}</span><span class="en1-t">${enCorto(e)}<small>${esc(e.u)}</small></span><span class="en1-k"><b>${e.k.toLocaleString("es-MX")}</b><small>clics</small></span><span class="en1-f">${e.f}</span>${enSw(e.on)}${enAcc()}</div>`;
    return `<div class="pagina en en1">${encabezado("Enlaces cortos", "Convierte un enlace largo en uno corto de tu dominio y mira cuántas veces lo abren.")}
      <section class="en1-hero"><h3>${ic("scissors-line-dashed")}Nuevo enlace</h3>${enNuevo()}</section>
      <section class="tarjeta en1-lista"><div class="en-h"><h3>${ic("list-checks")}Tus enlaces <span class="en-num">${EN.length * 3 - 2}</span></h3><div class="en-busca">${ic("search")}<span>Buscar</span></div></div>${EN.map(fila).join("")}${enPag(3)}</section></div>`;
  },
  "enlaces-2"() {
    const top = [...EN].sort((a, b) => b.k - a.k)[0];
    const card = (e, k) => `<article class="en2-card ${e.on ? "" : "apagado"}"><div class="en2-top">${enEstado(e.on)}<span class="en-sep"></span>${enSw(e.on)}</div><div class="en2-c">/${e.c}</div><small class="en2-u">${esc(e.u.replace(/^https?:\/\//, ""))}</small><div class="en2-num"><b>${e.k.toLocaleString("es-MX")}</b><small>clics · desde el ${e.f}</small></div>${enChispa(e.s, e.on ? ["#b497ff", "#7cb7ff", "#5be39e", "#ff9a3c", "#ff6b81", "#f5c451"][k % 6] : "var(--apagado)")}<div class="en2-pie"><button class="btn borde chico" onclick="avisar('Copiado')">${ic("copy")}Copiar</button><button class="btn icono chico" aria-label="QR">${ic("qr-code")}</button><button class="btn icono chico" aria-label="Borrar">${ic("trash-2")}</button></div></article>`;
    const tot = EN.reduce((a, e) => a + e.k, 0);
    return `<div class="pagina en en2">${encabezado("Enlaces cortos", "Cada enlace con sus clics de la semana.", `<button class="btn primario">${ic("plus")}Nuevo enlace</button>`)}
      <div class="en2-stats"><div class="en2-stat"><small>Clics en total</small><b>${tot.toLocaleString("es-MX")}</b></div><div class="en2-stat"><small>Enlaces activos</small><b>${EN.filter((e) => e.on).length}<span> de ${EN.length}</span></b></div><div class="en2-stat ancho"><small>El más abierto</small><b>/${top.c}</b><span class="en2-barra"><i style="width:100%"></i></span></div></div>
      <div class="en2-filtros">${["Todos", "Activos", "Apagados"].map((t, k) => `<button class="en-chip ${k === 0 ? "on" : ""}">${t}</button>`).join("")}<span class="en-sep"></span><div class="en-busca">${ic("search")}<span>Buscar</span></div></div>
      <div class="en2-grid">${EN.map(card).join("")}</div>${enPag(2)}</div>`;
  },
  "enlaces-3"() {
    const e = EN[1], dias = [52, 61, 48, 70, 66, 90, 74, 58, 49, 80, 95, 88, 102, 76, 60, 55, 72, 84, 96, 110, 92, 71, 64, 88, 120, 132, 98, 86, 115, 140];
    const m = Math.max(...dias);
    const item = (x, k) => `<button class="en3-item ${k === 1 ? "on" : ""} ${x.on ? "" : "apagado"}"><span class="en3-p ${x.on ? "on" : ""}"></span><span class="en3-it"><b>/${x.c}</b><small>${esc(x.u.replace(/^https?:\/\//, ""))}</small></span><span class="en3-k">${x.k.toLocaleString("es-MX")}</span></button>`;
    return `<div class="pagina en en3">${encabezado("Enlaces cortos", "Elige uno para ver cómo le va.", `<button class="btn primario">${ic("plus")}Nuevo enlace</button>`)}
      <div class="en3-cuerpo">
        <aside class="tarjeta en3-lista"><div class="en-busca">${ic("search")}<span>Buscar enlace</span></div>${EN.map(item).join("")}${enPag(3)}</aside>
        <section class="tarjeta en3-det">
          <div class="en3-cab"><div class="en3-tit">${enCorto(e)}<small>${ic("arrow-right")}${esc(e.u)}</small></div><div class="en3-bot"><button class="btn borde chico" onclick="avisar('Copiado')">${ic("copy")}Copiar</button><button class="btn borde chico">${ic("external-link")}Abrir</button>${enSw(e.on)}</div></div>
          <div class="en3-nums"><div><small>Clics</small><b>${e.k.toLocaleString("es-MX")}</b></div><div><small>Últimos 7 días</small><b>356</b></div><div><small>Mejor día</small><b>140</b></div><div><small>Creado</small><b>${e.f}</b></div></div>
          <div class="en3-graf"><div class="en3-gt"><b>Clics por día</b><small>Últimos 30 días</small></div><div class="en3-barras">${dias.map((d, i) => `<i style="height:${(d / m) * 100}%" class="${i === 29 ? "hoy" : ""}" title="${d}"></i>`).join("")}</div><div class="en3-eje"><span>23 sep</span><span>8 oct</span><span>Hoy</span></div></div>
          <div class="en3-abajo"><div class="en3-qr">${enQR(e.c)}<div><b>Su QR</b><small>Listo para imprimir o compartir.</small><button class="btn borde chico">${ic("download")}Descargar PNG</button></div></div><div class="en3-destino"><b>Cambiar a dónde lleva</b><small>El enlace corto sigue igual, solo cambia el destino.</small><span class="en-in">${ic("link-2")}<span>${esc(e.u)}</span></span><div class="en3-db"><button class="btn borde chico" style="color:var(--peligro)">${ic("trash-2")}Borrar enlace</button><button class="btn primario chico">Guardar</button></div></div></div>
        </section></div></div>`;
  },
  "enlaces-4"() {
    const fila = (e, k) => `<tr class="${e.on ? "" : "apagado"} ${k === 1 ? "sel" : ""}"><td><span class="en4-casilla ${k === 1 || k === 4 ? "on" : ""}">${k === 1 || k === 4 ? ic("check") : ""}</span></td><td>${enCorto(e)}</td><td class="en4-u">${esc(e.u)}</td><td class="en4-n">${e.k.toLocaleString("es-MX")}</td><td>${enChispa(e.s)}</td><td>${e.f}</td><td>${enEstado(e.on)}</td><td>${enAcc()}</td></tr>`;
    const tarjeta = (e, k) => `<div class="en4-tarj ${e.on ? "" : "apagado"}"><span class="en4-casilla ${k === 1 || k === 4 ? "on" : ""}">${k === 1 || k === 4 ? ic("check") : ""}</span><div class="en4-tt">${enCorto(e)}<small>${esc(e.u)}</small><span class="en4-meta"><b>${e.k.toLocaleString("es-MX")} clics</b>· ${e.f} ${enEstado(e.on)}</span></div>${enAcc()}</div>`;
    return `<div class="pagina en en4">${encabezado("Enlaces cortos", "Todos tus enlaces en una tabla.")}
      <div class="en4-cuerpo">
        <section class="tarjeta en4-tabla"><div class="en4-barra"><div class="en-busca">${ic("search")}<span>Buscar</span></div>${["Todos 16", "Activos 13", "Apagados 3"].map((t, k) => `<button class="en-chip ${k === 0 ? "on" : ""}">${t}</button>`).join("")}<span class="en-sep"></span></div>
          <div class="en4-sel"><b>2 elegidos</b><button class="btn chico">${ic("power")}Apagar</button><button class="btn chico">${ic("copy")}Copiar</button><button class="btn chico" style="color:var(--peligro)">${ic("trash-2")}Borrar</button></div>
          <table><thead><tr><th></th><th>Enlace corto</th><th>Lleva a</th><th>Clics</th><th>7 días</th><th>Creado</th><th>Estado</th><th></th></tr></thead><tbody>${EN.map(fila).join("")}</tbody></table>
          <div class="en4-tarjetas">${EN.map(tarjeta).join("")}</div>${enPag(3)}</section>
        <aside class="tarjeta en4-lado"><h3>${ic("plus")}Nuevo enlace</h3>${enNuevo("columna")}<div class="en4-prev"><small>Así queda</small>${enQR("nuevo")}<span class="en-corto"><span>${EN_DOM}</span><b>tu-nombre</b></span></div></aside>
      </div></div>`;
  },
});
