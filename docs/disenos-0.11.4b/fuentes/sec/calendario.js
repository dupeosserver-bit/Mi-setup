iconosExtra(`<symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol><symbol id="i-trash-2" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></symbol><symbol id="i-calendar" viewBox="0 0 24 24"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></symbol><symbol id="i-calendar-range" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M17 14h-6"/><path d="M13 18H7"/><path d="M7 14h.01"/><path d="M17 18h.01"/></symbol><symbol id="i-calendar-plus" viewBox="0 0 24 24"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/></symbol><symbol id="i-calendar-check" viewBox="0 0 24 24"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></symbol><symbol id="i-arrow-left" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></symbol><symbol id="i-cake" viewBox="0 0 24 24"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></symbol><symbol id="i-filter" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></symbol><symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol><symbol id="i-map-pin" viewBox="0 0 24 24"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></symbol><symbol id="i-align-left" viewBox="0 0 24 24"><path d="M15 12H3"/><path d="M17 18H3"/><path d="M21 6H3"/></symbol><symbol id="i-repeat" viewBox="0 0 24 24"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></symbol><symbol id="i-alarm-clock" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/></symbol><symbol id="i-credit-card" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></symbol><symbol id="i-receipt-text" viewBox="0 0 24 24"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></symbol><symbol id="i-sun-medium" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v1"/><path d="M12 20v1"/><path d="M3 12h1"/><path d="M20 12h1"/><path d="m18.364 5.636-.707.707"/><path d="m6.343 17.657-.707.707"/><path d="m5.636 5.636.707.707"/><path d="m17.657 17.657.707.707"/></symbol>`);
const CA_TIPOS = { evento: ["Evento", "#60a5fa"], recordatorio: ["Recordatorio", "#f59e0b"], suscripcion: ["Suscripción", "#a78bfa"], cobro: ["Cobro", "#4ade80"], vencimiento: ["Vencimiento", "#f87171"] };
const CA_EV = [
  [1, "Pago de cliente: sitio web", "cobro", "10:00"], [3, "Junta con proveedores", "evento", "11:00"], [5, "Spotify Premium", "suscripcion", ""], [8, "Revisión del panel", "evento", "16:00"],
  [10, "Pagar la renta", "vencimiento", ""], [12, "Servicio de video", "suscripcion", ""], [14, "Clase de inglés", "evento", "19:00"], [15, "Pagar el agua", "vencimiento", ""],
  [17, "Comida familiar", "evento", "14:00"], [20, "Plan Panel · 3 clientes", "cobro", ""], [20, "Pagar Spotify", "recordatorio", "09:00"], [21, "Mandar fotos a mamá", "recordatorio", "19:30"],
  [22, "Llamar al dentista", "recordatorio", "12:30"], [22, "Revisión del servidor", "evento", "17:00"], [22, "Sacar la basura", "recordatorio", "20:00"], [22, "Almacenamiento en la nube", "suscripcion", ""],
  [23, "Renovar el dominio", "recordatorio", "09:00"], [23, "Comprar regalo", "evento", "18:00"], [24, "Partido de fútbol", "evento", "10:00"], [25, "Cumpleaños de mamá", "evento", ""], [25, "Cambiar el filtro del agua", "recordatorio", "10:00"],
  [27, "Junta del proyecto", "evento", "16:00"], [28, "Respaldo mensual", "evento", "03:00"], [29, "Pagar la luz", "vencimiento", ""], [30, "Dominio misetup", "vencimiento", ""], [31, "Noche de películas", "evento", "20:00"], [31, "Actualizar Mi Setup", "recordatorio", "19:00"],
  [33, "Cobro mensual de hosting", "cobro", ""], [36, "Cita del auto", "evento", "11:00"],
].map(([d, t, tipo, h], id) => ({ id, d, t, tipo, h }));
const caEst = { dia: 22, filtros: Object.fromEntries(Object.keys(CA_TIPOS).map((k) => [k, true])), pag: 2, semDia: 22 };
const CA_DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CA_DIAS_L = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const caDiaSem = (d) => (d + 2) % 7;
const caNombreDia = (d) => { const t = caNombreDia0(d); return t[0].toUpperCase() + t.slice(1); };
const caNombreDia0 = (d) => d > 31 ? `${CA_DIAS_L[caDiaSem(d)]} ${d - 31} de noviembre` : d < 1 ? `${CA_DIAS_L[caDiaSem(d)]} ${30 + d} de septiembre` : `${CA_DIAS_L[caDiaSem(d)]} ${d} de octubre`;
const caNum = (d) => (d > 31 ? d - 31 : d < 1 ? 30 + d : d);
const caDe = (d) => CA_EV.filter((e) => e.d === d && caEst.filtros[e.tipo]).sort((a, b) => (a.h || "00").localeCompare(b.h || "00"));
const caHora = (h) => { if (!h) return "Todo el día"; const [H, M] = h.split(":").map(Number); return `${((H + 11) % 12) + 1}:${String(M).padStart(2, "0")} ${H < 12 ? "a.m." : "p.m."}`; };
const caPunto = (tipo) => `<i class="ca-p" style="background:${CA_TIPOS[tipo][1]}"></i>`;
const caLeyenda = () => `<div class="ca-ley">${Object.entries(CA_TIPOS).map(([k, [n, c]]) => `<button class="${caEst.filtros[k] ? "" : "off"}" onclick="caEst.filtros['${k}']=!caEst.filtros['${k}'];pintarPagina()"><i class="ca-p" style="background:${c}"></i>${n}</button>`).join("")}</div>`;
const caNav = (titulo = "Octubre 2026") => `<div class="ca-nav"><button class="btn icono borde" aria-label="Anterior">${ic("chevron-left")}</button><button class="btn borde chico" onclick="caEst.dia=22;caEst.semDia=22;pintarPagina()">Hoy</button><button class="btn icono borde" aria-label="Siguiente">${ic("chevron-right")}</button><h2>${titulo}</h2></div>`;
const caEnc = (der = "") => encabezado("Calendario", "Eventos, recordatorios, suscripciones, cobros y vencimientos juntos.", der);
const caNuevo = () => `<a class="btn primario" href="#/calendario-4/abierta">${ic("plus")}<span class="ca-txt">Nuevo evento</span></a>`;
const caItem = (e) => `<div class="ca-item" style="--c:${CA_TIPOS[e.tipo][1]}"><span class="ca-barra"></span><div class="ca-item-t"><b>${esc(e.t)}</b><small>${CA_TIPOS[e.tipo][0]} · ${caHora(e.h)}</small></div>${e.tipo === "evento" ? `<button class="btn icono chico" aria-label="Borrar">${ic("trash-2")}</button>` : ""}</div>`;
const caAgregar = () => `<form class="ca-agregar" onsubmit="event.preventDefault();avisar('Evento agregado')"><label>Nuevo evento</label><input placeholder="Cumpleaños, cita, junta…"><div><input type="time" aria-label="Hora (vacío = todo el día)"><button class="btn primario">${ic("plus")}Agregar</button></div><small>Sin hora = todo el día.</small></form>`;
function caMini(sel, alClic = "caEst.dia") {
  const celdas = Array.from({ length: 42 }, (_, i) => i - 2);
  return `<div class="ca-mini"><div class="ca-mini-cab"><b>Octubre 2026</b><span><button class="btn icono chico" aria-label="Anterior">${ic("chevron-left")}</button><button class="btn icono chico" aria-label="Siguiente">${ic("chevron-right")}</button></span></div><div class="ca-mini-g">${["L", "M", "M", "J", "V", "S", "D"].map((d) => `<span class="ca-mini-d">${d}</span>`).join("")}${celdas.map((d) => `<button class="${d < 1 || d > 31 ? "fuera" : ""} ${d === 22 ? "hoy" : ""} ${d === sel ? "sel" : ""} ${caDe(d).length ? "con" : ""}" onclick="${alClic}=${d};pintarPagina()">${caNum(d)}</button>`).join("")}</div></div>`;
}
function caPager(actual, total, fn) {
  return `<div class="ca-pager"><button ${actual === 1 ? "disabled" : ""} onclick="${fn}(${actual - 1})" aria-label="Anterior">${ic("chevron-left")}</button>${Array.from({ length: total }, (_, i) => `<button class="${i + 1 === actual ? "sel" : ""}" onclick="${fn}(${i + 1})">${i + 1}</button>`).join("")}<button ${actual === total ? "disabled" : ""} onclick="${fn}(${actual + 1})" aria-label="Siguiente">${ic("chevron-right")}</button></div>`;
}

function ca1Mes() {
  const celdas = Array.from({ length: 42 }, (_, i) => i - 2);
  return `<div class="ca1-mes">${CA_DIAS.map((d) => `<span class="ca1-dsem">${d}</span>`).join("")}${celdas.map((d) => {
    const l = caDe(d);
    return `<button class="ca1-celda ${d < 1 || d > 31 ? "fuera" : ""} ${d === 22 ? "hoy" : ""} ${d === caEst.dia ? "sel" : ""}" onclick="caEst.dia=${d};pintarPagina()"><span class="ca1-num">${caNum(d)}</span><span class="ca1-pills">${l.slice(0, 3).map((e) => `<span class="ca1-pill" style="--c:${CA_TIPOS[e.tipo][1]}">${e.h ? `<em>${e.h}</em>` : ""}${esc(e.t)}</span>`).join("")}${l.length > 3 ? `<span class="ca1-mas">+${l.length - 3} más</span>` : ""}</span><span class="ca1-puntos">${l.slice(0, 4).map((e) => caPunto(e.tipo)).join("")}</span></button>`;
  }).join("")}</div>`;
}

const CA2_HORAS = Array.from({ length: 16 }, (_, i) => i + 7);
function ca2Semana() {
  const lunes = caEst.semDia - caDiaSem(caEst.semDia);
  const dias = Array.from({ length: 7 }, (_, i) => lunes + i);
  const bloque = (e) => { const [H, M] = e.h.split(":").map(Number); const top = (H - 7 + M / 60) * 100 / 16; return H < 7 ? "" : `<div class="ca2-ev" style="--c:${CA_TIPOS[e.tipo][1]};top:${top}%;height:calc(${100 / 16}% - 3px)"><b>${esc(e.t)}</b><small>${caHora(e.h)}</small></div>`; };
  return `<div class="ca2-sem" style="--n:7">
    <div class="ca2-cab"><span></span>${dias.map((d) => `<button class="ca2-dcab ${d === 22 ? "hoy" : ""} ${d === caEst.semDia ? "sel" : ""}" onclick="caEst.semDia=${d};pintarPagina()"><small>${CA_DIAS[caDiaSem(d)]}</small><b>${caNum(d)}</b></button>`).join("")}</div>
    <div class="ca2-todo"><span>Todo el día</span>${dias.map((d) => `<div>${caDe(d).filter((e) => !e.h).map((e) => `<span class="ca2-chip" style="--c:${CA_TIPOS[e.tipo][1]}">${esc(e.t)}</span>`).join("")}</div>`).join("")}</div>
    <div class="ca2-rejilla"><div class="ca2-horas">${CA2_HORAS.map((h) => `<span>${caHora(String(h).padStart(2, "0") + ":00").replace(":00", "")}</span>`).join("")}</div>${dias.map((d) => `<div class="ca2-col ${d === caEst.semDia ? "sel" : ""} ${d === 22 ? "hoy" : ""}">${caDe(d).filter((e) => e.h).map(bloque).join("")}${d === 22 ? `<span class="ca2-ahora" style="top:${(11.2 - 7) * 100 / 16}%"></span>` : ""}</div>`).join("")}</div>
  </div>`;
}

function ca3Agenda() {
  const semanas = [[19, 25], [26, 32], [33, 39], [12, 18]];
  const orden = [semanas[3], semanas[0], semanas[1], semanas[2]];
  const [a, b] = orden[caEst.pag - 1];
  const dias = Array.from({ length: b - a + 1 }, (_, i) => a + i).filter((d) => caDe(d).length);
  return `<div class="ca3-ag" id="ca3-ag"><div class="ca3-sem-t">Semana del ${caNum(a)} ${a > 31 ? "de noviembre" : b > 31 ? "de octubre" : ""} al ${caNum(b)} ${b > 31 ? "de noviembre" : "de octubre"}</div><div class="ca3-dias">${dias.map((d) => `<div class="ca3-dia ${d === 22 ? "hoy" : ""}"><div class="ca3-fecha"><b>${caNum(d)}</b><small>${CA_DIAS[caDiaSem(d)]}</small></div><div class="ca3-lista">${caDe(d).map((e) => `<div class="ca3-ev" style="--c:${CA_TIPOS[e.tipo][1]}"><span class="ca3-h">${caHora(e.h)}</span><span class="ca-barra"></span><div><b>${esc(e.t)}</b><small>${CA_TIPOS[e.tipo][0]}</small></div></div>`).join("")}</div></div>`).join("") || `<p class="ca-vacio">Nada esta semana.</p>`}</div>${caPager(caEst.pag, 4, "ca3Ir")}</div>`;
}
function ca3Ir(n) { caEst.pag = n; const el = document.getElementById("ca3-ag"); if (el) el.outerHTML = ca3Agenda(); }

function ca4Tira() {
  return `<div class="ca4-tira">${Array.from({ length: 14 }, (_, i) => 20 + i).map((d) => `<button class="${d === caEst.dia ? "sel" : ""} ${d === 22 ? "hoy" : ""}" onclick="caEst.dia=${d};pintarPagina()"><small>${CA_DIAS[caDiaSem(d)]}</small><b>${caNum(d)}</b><span>${caDe(d).slice(0, 3).map((e) => caPunto(e.tipo)).join("")}</span></button>`).join("")}</div>`;
}

Object.assign(PAGINAS, {
  "calendario-1"() {
    const l = caDe(caEst.dia);
    return `<div class="pagina ca-pag ca1">${caEnc(caNuevo())}
      <div class="ca1-cuerpo">
        <section class="tarjeta ca1-izq">${caNav()}${ca1Mes()}${caLeyenda()}</section>
        <aside class="tarjeta ca1-der"><div class="ca1-dia-t"><small>${caEst.dia === 22 ? "Hoy" : "Día elegido"}</small><h3>${caNombreDia(caEst.dia)}</h3></div><div class="ca1-items">${l.map(caItem).join("") || `<p class="ca-vacio">Nada este día.</p>`}</div>${caAgregar()}</aside>
      </div></div>`;
  },
  "calendario-2"() {
    const l = caDe(caEst.semDia);
    return `<div class="pagina ca-pag ca2">${caEnc(caNuevo())}
      <div class="ca2-cuerpo">
        <aside class="ca2-lado">${caMini(caEst.semDia, "caEst.semDia")}<div class="tarjeta ca2-filtros"><h3>${ic("filter")}Qué mostrar</h3>${caLeyenda()}</div><div class="tarjeta ca2-prox"><h3>${ic("credit-card")}Pagos de la semana</h3>${CA_EV.filter((e) => e.d >= 19 && e.d <= 32 && ["suscripcion", "cobro", "vencimiento"].includes(e.tipo)).map((e) => `<div class="ca2-pago"><span>${caPunto(e.tipo)}${esc(e.t)}</span><small>${caNum(e.d)} oct</small></div>`).join("")}</div></aside>
        <section class="tarjeta ca2-centro">${caNav("19 – 25 de octubre")}${ca2Semana()}
          <div class="ca2-dia-cel"><h3>${caNombreDia(caEst.semDia)}</h3>${l.map(caItem).join("") || `<p class="ca-vacio">Nada este día.</p>`}</div>
        </section>
      </div></div>`;
  },
  "calendario-3"() {
    const cuenta = (t) => CA_EV.filter((e) => e.tipo === t && e.d >= 1 && e.d <= 31).length;
    return `<div class="pagina ca-pag ca3">${caEnc(caNuevo())}
      <div class="ca3-cuerpo">
        <aside class="ca3-lado">${caMini(caEst.dia)}<div class="tarjeta"><h3>${ic("filter")}Qué mostrar</h3>${caLeyenda()}</div></aside>
        <section class="tarjeta ca3-centro"><div class="ca3-top"><h2>Agenda</h2><div class="ca3-chips">${caLeyenda()}</div></div>${ca3Agenda()}</section>
        <aside class="ca3-der">
          <div class="tarjeta ca3-num"><h3>${ic("calendar-check")}Octubre en números</h3>${Object.entries(CA_TIPOS).map(([k, [n, c]]) => `<div class="ca3-fila"><span>${caPunto(k)}${n}</span><b>${cuenta(k)}</b><i style="--w:${cuenta(k) * 9}%;--c:${c}"></i></div>`).join("")}</div>
          <div class="tarjeta ca3-cumple"><h3>${ic("cake")}Cumpleaños cerca</h3><div class="ca3-c"><span class="ca3-av">M</span><div><b>Mamá</b><small>Sábado 25 de octubre · en 3 días</small></div></div><div class="ca3-c"><span class="ca3-av" style="--c:#7cb7ff">L</span><div><b>Luis</b><small>Martes 11 de noviembre</small></div></div></div>
        </aside>
      </div></div>`;
  },
  "calendario-4"() {
    if (rutaActual().sub === "abierta") return ca5Editor();
    const l = caDe(caEst.dia);
    const pagos = CA_EV.filter((e) => e.d >= 22 && ["suscripcion", "cobro", "vencimiento"].includes(e.tipo));
    return `<div class="pagina ca-pag ca4">${caEnc(caNuevo())}
      ${ca4Tira()}
      <div class="ca4-cuerpo">
        <section class="ca4-hoy"><div class="ca4-hero"><div><small>${caEst.dia === 22 ? "Hoy" : "Día elegido"}</small><h2>${caNombreDia(caEst.dia)}</h2><p>${l.length} cosas en tu día · ${((n) => `${n} ${n === 1 ? "evento" : "eventos"}`)(l.filter((e) => e.tipo === "evento").length)}</p></div><span class="ca4-clima">${ic("sun-medium")}<b>24°</b></span></div>
          <div class="ca4-tl">${l.map((e) => `<div class="ca4-ev" style="--c:${CA_TIPOS[e.tipo][1]}"><span class="ca4-h">${caHora(e.h)}</span><div class="ca4-card"><b>${esc(e.t)}</b><small>${CA_TIPOS[e.tipo][0]}</small></div></div>`).join("") || `<p class="ca-vacio">Día libre.</p>`}<a class="ca4-mas" href="#/calendario-4/abierta">${ic("plus")}Agregar algo a este día</a></div>
        </section>
        <aside class="ca4-lado">
          <div class="tarjeta"><h3>${ic("credit-card")}Pagos y vencimientos que vienen</h3>${pagos.map((e) => `<div class="ca4-pago" style="--c:${CA_TIPOS[e.tipo][1]}"><span class="ca4-fecha"><b>${caNum(e.d)}</b><small>${e.d > 31 ? "nov" : "oct"}</small></span><div><b>${esc(e.t)}</b><small>${CA_TIPOS[e.tipo][0]}</small></div></div>`).join("")}</div>
          <div class="tarjeta ca4-leyenda"><h3>${ic("filter")}Qué mostrar</h3>${caLeyenda()}</div>
        </aside>
      </div></div>`;
  },
});
function ca5Editor() {
  const chip = (t, s) => `<button class="ca5-chip ${s ? "sel" : ""}">${t}</button>`;
  return `<div class="ca5">
    <div class="ca5-barra"><a class="btn" href="#/calendario-4">${ic("arrow-left")}<span class="ca-txt">Cancelar</span></a><b>Nuevo evento</b><button class="btn primario" onclick="avisar('Evento guardado');location.hash='#/calendario-4'">${ic("check")}Guardar</button></div>
    <div class="ca5-cuerpo">
      <div class="ca5-escribir">
        <input class="ca5-titulo" value="Cumpleaños de mamá" aria-label="Título">
        <div class="ca5-linea">${ic("map-pin")}<input placeholder="Lugar (opcional)" value="Casa de la abuela"></div>
        <div class="ca5-linea arriba">${ic("align-left")}<textarea placeholder="Notas (opcional)">Llevar el pastel de tres leches.
Llegar a las 2:00 p.m. para ayudar a preparar.
Comprar velas y globos.</textarea></div>
      </div>
      <aside class="ca5-ajustes">
        <div class="ca5-bloque"><h4>${ic("calendar")}Fecha</h4>${caMini(25, "void 0;caEst.x")}</div>
        <div class="ca5-bloque"><h4>${ic("alarm-clock")}Hora</h4><div class="ca5-dos"><label class="ca5-switch on"><span></span>Todo el día</label><input type="time" disabled aria-label="Hora"></div></div>
        <div class="ca5-bloque"><h4>${ic("repeat")}Repetir</h4><div class="ca5-chips">${chip("Una vez")}${chip("Cada semana")}${chip("Cada mes")}${chip("Cada año", 1)}</div></div>
        <div class="ca5-bloque"><h4>${ic("bell")}Avisarme</h4><div class="ca5-chips">${chip("Sin aviso")}${chip("1 día antes", 1)}${chip("1 hora antes")}</div></div>
      </aside>
    </div></div>`;
}
