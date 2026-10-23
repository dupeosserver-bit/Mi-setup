function ppPagina(b) { b.parentElement.querySelectorAll(".btn").forEach((x) => x.classList.remove("activo")); b.classList.add("activo"); }
const PP_ORIGEN = { pc: ["monitor", "PC de jokee", "#7c5cff"], cel: ["smartphone", "A56 de jokee", "#2e9e6b"], web: ["globe", "Navegador", "#f59e0b"] };
const PP_TIPO = { texto: ["type", "Texto"], enlace: ["link-2", "Enlace"], codigo: ["code-2", "Comando"], lista: ["list-checks", "Lista"] };
const PP = [
  { de: "cel", tipo: "texto", t: "Recordar comprar focos para la sala y pilas AA para el control.", h: "Hace 2 min", dia: "Hoy" },
  { de: "pc", tipo: "codigo", t: "docker compose up -d --build", h: "Hace 15 min", dia: "Hoy" },
  { de: "web", tipo: "enlace", t: "https://ejemplo.com/receta-de-pozole-rojo", dom: "ejemplo.com", h: "Hace 1 h", dia: "Hoy" },
  { de: "cel", tipo: "lista", t: "Súper: leche, huevos, tortillas, aguacate, café, jabón para trastes", h: "Hace 3 h", dia: "Hoy" },
  { de: "pc", tipo: "texto", t: "Junta del equipo el jueves a las 5 p.m. Llevar la presentación y el cargador.", h: "Ayer, 7:40 p.m.", dia: "Ayer" },
  { de: "pc", tipo: "codigo", t: "df -h /", h: "Ayer, 6:12 p.m.", dia: "Ayer" },
  { de: "cel", tipo: "enlace", t: "https://ejemplo.org/tutorial-de-fotos-nocturnas", dom: "ejemplo.org", h: "Ayer, 1:05 p.m.", dia: "Ayer" },
  { de: "web", tipo: "texto", t: "Ideas para el video: intro corta, mostrar el setup, prueba de sonido, despedida con preguntas.", h: "Lun 20 oct", dia: "Esta semana" },
];
const PP_LARGO = `Ideas para el video del canal

1. Intro de 10 segundos con la música nueva.
2. Mostrar el escritorio completo: monitor vertical, luces y el micrófono.
3. Explicar cómo ordené los cables por debajo de la mesa.
4. Prueba de sonido: con y sin la espuma del micrófono.
5. Enseñar Mi Setup en la PC y en el celular al mismo tiempo.
6. Despedida: pedir que dejen preguntas para el siguiente video.

Pendiente: grabar tomas extra de las manos tecleando y del monitor girando.`;
const ppOrigen = (c, solo) => { const [i, n, col] = PP_ORIGEN[c.de]; return `<span class="pp-origen" style="--c:${col}">${ic(i)}${solo ? "" : `<span>${n}</span>`}</span>`; };
const ppAcc = () => `<span class="pp-acc"><button class="btn icono chico" aria-label="Copiar" onclick="avisar('Copiado: ya lo puedes pegar')">${ic("copy")}</button><button class="btn icono chico" aria-label="Borrar">${ic("trash-2")}</button></span>`;
const ppPag = (n, act = 1) => `<nav class="pp-pag" aria-label="Páginas"><button class="btn icono chico" aria-label="Anterior">${ic("chevron-left")}</button>${Array.from({ length: n }, (_, i) => `<button class="btn chico ${i + 1 === act ? "activo" : ""}" onclick="ppPagina(this)">${i + 1}</button>`).join("")}<button class="btn icono chico" aria-label="Siguiente">${ic("chevron-right")}</button></nav>`;
const ppTexto = (c) => c.tipo === "codigo" ? `<code class="pp-code">${esc(c.t)}</code>` : c.tipo === "enlace" ? `<span class="pp-enlace">${esc(c.t)}</span>` : `<span class="pp-txt">${esc(c.t)}</span>`;
const ppDestinos = () => `<div class="pp-dest"><span class="pp-dchip on">${ic("monitor-smartphone")}Todos mis equipos</span><span class="pp-dchip">${ic("smartphone")}A56 de jokee</span><span class="pp-dchip">${ic("tablet")}Tablet de la sala</span></div>`;
const ppNota = () => `<span class="pp-nota">Se guardan los últimos 50</span>`;

Object.assign(PAGINAS, {
  "portapapeles-1"() {
    return `<div class="pagina pp pp1">${encabezado("Portapapeles", "Copia en un equipo y pega en otro, al momento.")}
      <section class="pp1-envio">
        <textarea class="pp1-area" placeholder="Escribe o pega aquí lo que quieres mandar…">Recordar comprar focos para la sala</textarea>
        <div class="pp1-barra">${ppDestinos()}<span class="pp-sep"></span><button class="btn borde">${ic("clipboard-paste")}Pegar de este equipo</button><button class="btn primario">${ic("send")}Enviar</button></div>
      </section>
      <div class="pp-h"><h3>${ic("history")} Lo último que copiaste</h3>${ppNota()}</div>
      <section class="tarjeta pp1-lista">${PP.map((c, i) => `<div class="pp1-fila ${i > 5 ? "pp1-extra" : ""}"><span class="pp1-tipo">${ic(PP_TIPO[c.tipo][0])}</span><div class="pp1-cuerpo">${ppTexto(c)}<small>${ppOrigen(c)} · ${c.h}</small></div>${ppAcc()}</div>`).join("")}${ppPag(4)}</section>
    </div>`;
  },
  "portapapeles-2"() {
    const filtros = [["Todo", 50], ["Textos", 21], ["Enlaces", 12], ["Comandos", 9], ["Listas", 8]];
    const card = (c, i) => `<article class="pp2-card pp2-${c.tipo} ${i === 0 ? "nuevo" : ""}"><div class="pp2-top"><span class="pp2-tipo">${ic(PP_TIPO[c.tipo][0])}${PP_TIPO[c.tipo][1]}</span>${i === 0 ? `<span class="pp2-nuevo">Nuevo</span>` : ""}</div>
      ${c.tipo === "enlace" ? `<div class="pp2-prev"><span>${ic("globe")}</span><b>${c.dom}</b></div>` : ""}${c.tipo === "lista" ? `<ul class="pp2-ul">${c.t.split(": ")[1].split(", ").map((x) => `<li>${ic("square-check-big")}${x}</li>`).join("")}</ul>` : ppTexto(c)}
      <div class="pp2-pie">${ppOrigen(c, true)}<small>${c.h}</small>${ppAcc()}</div></article>`;
    return `<div class="pagina pp pp2">${encabezado("Portapapeles", "Todo lo que mandas entre tus equipos, como un muro.", `<button class="btn borde">${ic("clipboard-paste")}Pegar de este equipo</button>`)}
      <div class="pp2-filtros"><div class="pp2-busca">${ic("search")}<span>Buscar en lo copiado…</span></div><div class="pp2-chips">${filtros.map(([n, c], i) => `<span class="pp-dchip ${i === 0 ? "on" : ""}">${n} <b>${c}</b></span>`).join("")}</div></div>
      <div class="pp2-muro">${PP.map(card).join("")}</div>
      ${ppPag(4)}
      <div class="pp2-envio"><input placeholder="Escribe algo para mandarlo a tus equipos…"><button class="btn icono" aria-label="Pegar">${ic("clipboard-paste")}</button><button class="btn primario">${ic("send")}<span class="pp-txt-btn">Enviar</span></button></div>
    </div>`;
  },
  "portapapeles-3"() {
    const tab = window.ppTab || "pc";
    const col = (k) => { const [i, n, c] = PP_ORIGEN[k]; const l = PP.filter((x) => x.de === k); return `<section class="pp3-col ${tab === k ? "ver" : ""}"><header style="--c:${c}"><span class="pp3-ic">${ic(i)}</span><span class="pp3-n"><b>${n}</b><small>${l.length} cosas · ${k === "pc" ? "este equipo" : k === "cel" ? "en línea" : "hace 1 h"}</small></span></header>${l.map((x) => `<div class="pp3-item">${ppTexto(x)}<div class="pp3-pie"><small>${x.h}</small>${ppAcc()}</div></div>`).join("")}</section>`; };
    return `<div class="pagina pp pp3">${encabezado("Portapapeles", "Ordenado por el equipo desde donde lo copiaste.")}
      <div class="pp3-envio">${ic("clipboard")}<input placeholder="Escribe o pega algo y mándalo a todos tus equipos…"><button class="btn borde chico">${ic("clipboard-paste")}<span class="pp-txt-btn">Pegar</span></button><button class="btn primario chico">${ic("send")}<span class="pp-txt-btn">Enviar</span></button></div>
      <div class="pestanas-pag pp3-tabs">${Object.entries(PP_ORIGEN).map(([k, [i, n]]) => `<button class="${tab === k ? "activo" : ""}" onclick="window.ppTab='${k}';pintarPagina()">${ic(i)} ${n.replace(" de jokee", "")}</button>`).join("")}</div>
      <div class="pp3-cols">${["pc", "cel", "web"].map(col).join("")}</div>
      <div class="pp3-pie-pag">${ppNota()}${ppPag(3)}</div>
    </div>`;
  },
  "portapapeles-4"() {
    const abierta = rutaActual().sub === "abierta";
    if (abierta) return `<div class="pp4-pleno">
      <header class="pp4-pl-top"><button class="btn icono" onclick="ir('portapapeles-4')" aria-label="Regresar">${ic("chevron-left")}</button><div class="pp4-pl-tit"><b>Ideas para el video del canal</b><small>${ppOrigen(PP[7])} · Lun 20 oct · 512 letras</small></div><button class="btn borde">${ic("copy")}<span class="pp-txt-btn">Copiar</span></button><button class="btn primario">${ic("send")}<span class="pp-txt-btn">Enviar otra vez</span></button></header>
      <div class="pp4-pl-cuerpo"><textarea class="pp4-pl-area" spellcheck="false">${esc(PP_LARGO)}</textarea></div>
      <footer class="pp4-pl-pie"><span class="pp4-pl-info">${ic("pencil-line")} Puedes corregirlo antes de mandarlo</span><div class="pp4-pl-herr"><button class="btn icono" aria-label="Pegar">${ic("clipboard-paste")}</button><button class="btn icono" aria-label="Elegir equipos">${ic("monitor-smartphone")}</button><button class="btn icono" aria-label="Borrar">${ic("trash-2")}</button><button class="btn icono" aria-label="Salir de pantalla completa" onclick="ir('portapapeles-4')">${ic("minimize-2")}</button></div></footer>
    </div>`;
    const grupos = ["Hoy", "Ayer", "Esta semana"].map((d) => `<div class="pp4-dia">${d}</div>` + PP.map((c, i) => [c, i]).filter(([c]) => c.dia === d).map(([c, i]) => `<button class="pp4-item ${i === 7 ? "sel" : ""}" onclick="ir('portapapeles-4','abierta')"><span class="pp4-ic" style="--c:${PP_ORIGEN[c.de][2]}">${ic(PP_TIPO[c.tipo][0])}</span><span class="pp4-t"><b>${esc(c.t)}</b><small>${PP_ORIGEN[c.de][1]} · ${c.h}</small></span></button>`).join("")).join("");
    return `<div class="pagina pp pp4">${encabezado("Portapapeles", "Elige algo para leerlo completo o mandarlo otra vez.", `<button class="btn primario">${ic("plus")}Mandar algo nuevo</button>`)}
      <div class="pp4-cuerpo">
        <section class="tarjeta pp4-lista"><div class="pp2-busca">${ic("search")}<span>Buscar…</span></div><div class="pp4-scroll">${grupos}</div>${ppPag(3)}</section>
        <section class="tarjeta pp4-lector">
          <header class="pp4-cab"><span class="pp4-ic grande" style="--c:${PP_ORIGEN.web[2]}">${ic("type")}</span><div class="pp4-t"><b>Ideas para el video del canal</b><small>${ppOrigen(PP[7])} · Lun 20 oct · 512 letras</small></div><button class="btn icono" aria-label="Abrir completo" onclick="ir('portapapeles-4','abierta')">${ic("maximize-2")}</button></header>
          <pre class="pp4-texto">${esc(PP_LARGO)}</pre>
          <footer class="pp4-acc"><button class="btn borde">${ic("copy")}Copiar</button><button class="btn borde">${ic("send")}Enviar otra vez</button><button class="btn borde">${ic("maximize-2")}Abrir completo</button><span class="pp-sep"></span><button class="btn">${ic("trash-2")}Borrar</button></footer>
        </section>
      </div></div>`;
  },
});
