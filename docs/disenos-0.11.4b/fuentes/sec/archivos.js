const AR_RUTA = "/root/mi-setup/app";
const AR_LISTA = [
  { n: "apps", t: "dir", f: "hoy, 9:12", p: "755", c: "4 carpetas" },
  { n: "deploy", t: "dir", f: "ayer", p: "755", c: "3 archivos" },
  { n: "packages", t: "dir", f: "lun 20 oct", p: "755", c: "1 carpeta" },
  { n: "scripts", t: "dir", f: "lun 20 oct", p: "755", c: "6 archivos" },
  { n: "docker-compose.yml", t: "yml", f: "hoy, 9:40", p: "644", c: "6.4 KB" },
  { n: "README.md", t: "md", f: "ayer", p: "644", c: "5.0 KB" },
  { n: "package.json", t: "json", f: "ayer", p: "644", c: "1.8 KB" },
  { n: "pnpm-lock.yaml", t: "yml", f: "ayer", p: "644", c: "412 KB" },
  { n: ".env.ejemplo", t: "env", f: "dom 19 oct", p: "600", c: "1.1 KB" },
  { n: "instalar.sh", t: "sh", f: "dom 19 oct", p: "755", c: "4.8 KB" },
  { n: "logo.png", t: "img", f: "sáb 18 oct", p: "644", c: "38 KB" },
  { n: "MiSetup-0.11.3b.tar.gz", t: "zip", f: "sáb 18 oct", p: "644", c: "21 MB" },
];
const AR_TIPO = { dir: ["folder", "#b497ff"], yml: ["file-code", "#7cb7ff"], md: ["file-text", "#9a96b0"], json: ["file-json", "#f5c451"], env: ["lock", "#ff6b81"], sh: ["square-terminal", "#3ddc84"], img: ["image", "#ec4899"], zip: ["file-archive", "#f59e0b"] };
const AR_YML = [
  "services:",
  "  core:",
  "    build: ./apps/core",
  "    restart: unless-stopped",
  "    env_file: ../.env",
  "    depends_on:",
  "      db:",
  "        condition: service_healthy",
  "    <<: *registros",
  "  db:",
  "    image: postgres:16-alpine",
  "    volumes:",
  "      - datos:/var/lib/postgresql/data",
  "    healthcheck:",
  "      test: [\"CMD\", \"pg_isready\", \"-U\", \"misetup\"]",
  "      interval: 10s",
  "  caddy:",
  "    image: caddy:2.8",
  "    ports:",
  "      - \"80:80\"",
  "      - \"443:443\"",
  "    environment:",
  "      APP_HOST: ${APP_HOST}",
];
const arIco = (x, t = 34) => { const [i, c] = AR_TIPO[x.t] || ["file", "#9a96b0"]; return `<span class="ar-ico ${x.t === "dir" ? "dir" : ""}" style="--c:${c};width:${t}px;height:${t}px">${ic(i)}</span>`; };
const arResaltar = (l) => {
  const e = esc(l);
  if (/^\s*#/.test(l)) return `<span class="cg-hc">${e}</span>`;
  return e
    .replace(/\$\{[A-Z_]+\}/g, (m) => `<span class="cg-hv">${m}</span>`)
    .replace(/&quot;.*?&quot;/g, (m) => `<span class="cg-hs">${m}</span>`)
    .replace(/^(\s*-?\s*)([\w&lt;*]+)(:)/, (m, a, b, c) => `${a}<span class="cg-hk">${b}</span>${c}`)
    .replace(/: (\d+s?|unless-stopped|service_healthy)$/, (m, a) => `: <span class="cg-hf">${a}</span>`);
};
const arEditor = (lineas, opt = {}) => `<div class="cg-ed ar-ed"><div class="cg-ed-in">${lineas.map((l, i) => `<div class="cg-ln ${(opt.marcas || {})[i] || ""}"><span class="cg-n">${i + 1}</span><code>${(opt.buscar ? arResaltar(l).replace(opt.buscar, `<mark>${opt.buscar}</mark>`) : arResaltar(l)) || " "}</code></div>`).join("")}</div></div>`;
const arPag = (n = 3) => `<nav class="cg-pag" aria-label="Páginas"><button class="btn icono chico" aria-label="Anterior">${ic("chevron-left")}</button>${Array.from({ length: n }, (_, i) => `<button class="btn chico ${i === 0 ? "activo" : ""}" onclick="cgPagina(this)">${i + 1}</button>`).join("")}<button class="btn icono chico" aria-label="Siguiente">${ic("chevron-right")}</button></nav>`;
const arMigas = () => `<nav class="ar-migas"><button class="btn icono chico" aria-label="Subir de nivel">${ic("arrow-up")}</button>${["/", "root", "mi-setup", "app"].map((p, k, a) => `<button class="${k === a.length - 1 ? "on" : ""}">${p === "/" ? ic("hard-drive") : p}</button>${k < a.length - 1 && k > 0 ? `<span>${ic("chevron-right")}</span>` : ""}`).join("")}</nav>`;
const arAcciones = (cls = "") => `<div class="ar-acc ${cls}"><button class="btn borde">${ic("folder-plus")}<span class="ar-t">Carpeta</span></button><button class="btn borde">${ic("wand-sparkles")}<span class="ar-t">Organizar</span></button><button class="btn borde">${ic("eraser")}<span class="ar-t">Limpiar basura</span></button><button class="btn borde">${ic("square-terminal")}<span class="ar-t">Abrir terminal aquí</span></button><button class="btn primario">${ic("upload")}<span class="ar-t">Subir aquí</span></button></div>`;
const arHead = (der) => encabezado("Archivos", "Los archivos de tu servidor. Al guardar un archivo se deja una copia .bak del anterior.", der);
const arServ = () => `<button class="btn borde cg-serv">${ic("server")}<span>vps</span>${ic("chevron-down")}</button><button class="btn icono borde" aria-label="Buscar archivos" title="Buscar por nombre">${ic("search")}</button>`;
const arFilaAcc = (x) => x.t === "dir" ? `<button class="btn icono chico" aria-label="Renombrar">${ic("pencil")}</button><button class="btn icono chico" aria-label="Borrar">${ic("trash-2")}</button>` : `<button class="btn icono chico" aria-label="Descargar">${ic("download")}</button><a class="btn icono chico" href="#/archivos-1/abierta" aria-label="Editar texto">${ic("file-text")}</a><button class="btn icono chico" aria-label="Enviar a otro servidor">${ic("send")}</button><button class="btn icono chico" aria-label="Renombrar">${ic("pencil")}</button><button class="btn icono chico" aria-label="Borrar">${ic("trash-2")}</button>`;
const arPermisos = (p = "644") => { const d = [...p].map((n) => +n); const f = (v, b) => (v & b ? "on" : ""); return `<div class="ar-perm"><div></div><small>Leer</small><small>Escribir</small><small>Ejecutar</small>${[["Dueño", d[0]], ["Grupo", d[1]], ["Otros", d[2]]].map(([n, v]) => `<b>${n}</b><span class="${f(v, 4)}">${v & 4 ? ic("check") : ""}</span><span class="${f(v, 2)}">${v & 2 ? ic("check") : ""}</span><span class="${f(v, 1)}">${v & 1 ? ic("check") : ""}</span>`).join("")}</div>`; };

Object.assign(PAGINAS, {
  "archivos-1"() {
    const sel = AR_LISTA[4];
    const arbol = [["root", 0, false], [".ssh", 1], ["mi-setup", 1, true], ["app", 2, true, true], ["apps", 3], ["deploy", 3], ["packages", 3], ["scripts", 3], ["backups", 2], ["descargas", 2]];
    return `<div class="pagina cg ar ar1">${arHead(arServ())}
      <div class="ar1-barra">${arMigas()}${arAcciones()}</div>
      <div class="ar1-cuerpo"><aside class="ar1-arbol"><div class="ar-sec">Carpetas</div>${arbol.map(([n, nv, ab, on]) => `<button class="ar1-a ${on ? "on" : ""}" style="--nv:${nv}">${ic(ab ? "chevron-down" : "chevron-right")}${ic(ab ? "folder-open" : "folder")}<span>${n}</span></button>`).join("")}<div class="ar-sec">Accesos</div><button class="ar1-a" style="--nv:0">${ic("star")}<span>Respaldos</span></button><button class="ar1-a" style="--nv:0">${ic("star")}<span>Descargas de la app</span></button><div class="ar1-disco"><small>Disco del vps</small><div class="ar-barra"><i style="width:19%"></i></div><small>18 GB de 97 GB</small></div></aside>
        <section class="ar1-lista"><div class="ar1-th"><span>Nombre</span><span class="ar-tam">Tamaño</span><span class="ar-fec">Cambiado</span><span class="ar-per">Permisos</span><span></span></div>
          ${AR_LISTA.map((x) => `<div class="ar1-f ${x === sel ? "on" : ""}">${arIco(x, 30)}<span class="ar1-n">${esc(x.n)}</span><span class="ar-tam">${x.t === "dir" ? "—" : x.c}</span><span class="ar-fec">${x.f}</span><span class="ar-per">${x.p}</span><span class="ar1-acc">${arFilaAcc(x)}</span></div>`).join("")}${arPag()}</section>
        <aside class="ar1-det"><div class="ar1-dcab">${arIco(sel, 56)}<div><h3>${sel.n}</h3><small>${sel.c} · cambiado ${sel.f}</small></div></div>
          <div class="ar1-prev">${arEditor(AR_YML.slice(0, 9))}</div>
          <div class="ar1-dbot"><a class="btn primario" href="#/archivos-1/abierta">${ic("file-text")}Editar texto</a><button class="btn borde">${ic("download")}Descargar</button><button class="btn borde">${ic("send")}Enviar a otro servidor</button><button class="btn borde">${ic("pencil")}Renombrar</button></div>
          <h4>Permisos <span class="kbd">644</span></h4>${arPermisos("644")}
          <div class="ar1-ruta"><small>Ruta</small><code>${AR_RUTA}/${sel.n}</code></div><button class="btn borde cg-rojo ar1-borrar">${ic("trash-2")}Borrar archivo</button></aside></div></div>`;
  },
  "archivos-2"() {
    const sel = new Set(["docker-compose.yml", "README.md"]);
    const srv = [["vps", "203.0.113.10", 19, true], ["panel", "203.0.113.20", 58, false]];
    return `<div class="pagina cg ar ar2">${arHead(`<button class="btn icono borde" aria-label="Buscar archivos">${ic("search")}</button><button class="btn primario">${ic("upload")}<span class="ar-t">Subir aquí</span></button>`)}
      <div class="ar2-srv">${srv.map(([n, ip, d, on]) => `<button class="ar2-s ${on ? "on" : ""}"><span class="ar2-si">${ic("server")}</span><span class="ar2-st"><b>${n}</b><small>${ip}</small><span class="ar-barra"><i style="width:${d}%"></i></span><small>${d}% del disco usado</small></span>${on ? `<span class="punto ok"></span>` : `<span class="punto aviso"></span>`}</button>`).join("")}<button class="ar2-s nuevo">${ic("plus")}<span>Otro servidor</span></button></div>
      <div class="ar2-rap">${[["house", "Inicio"], ["folder", "Mi Setup"], ["download", "Descargas de la app"], ["hard-drive", "Respaldos"], ["file-text", "Registros"]].map(([i, n], k) => `<button class="${k === 1 ? "on" : ""}">${ic(i)}${n}</button>`).join("")}</div>
      <div class="ar2-barra">${arMigas()}<span class="cg-esp"></span><div class="ar2-vista"><button class="on" aria-label="Cuadros">${ic("layout-grid")}</button><button aria-label="Lista">${ic("list")}</button></div>${arAcciones("solo-ic")}</div>
      <div class="ar2-rej">${AR_LISTA.map((x) => `<div class="ar2-c ${sel.has(x.n) ? "on" : ""}"><span class="ar2-cb">${sel.has(x.n) ? ic("check") : ""}</span>${x.t === "img" ? `<span class="ar2-img"></span>` : arIco(x, 64)}<b>${esc(x.n)}</b><small>${x.c}</small></div>`).join("")}</div>${arPag()}
      <div class="ar2-sel"><b>2 elegidos</b><small>11.4 KB</small><span class="cg-esp"></span><button class="btn chico">${ic("download")}<span class="ar-t">Descargar</span></button><a class="btn chico" href="#/archivos-2/abierta">${ic("file-text")}<span class="ar-t">Editar</span></a><button class="btn chico">${ic("send")}<span class="ar-t">Enviar</span></button><button class="btn chico">${ic("pencil")}<span class="ar-t">Renombrar</span></button><button class="btn chico cg-rojo">${ic("trash-2")}<span class="ar-t">Borrar</span></button><button class="btn icono chico" aria-label="Quitar selección">${ic("x")}</button></div></div>`;
  },
  "archivos-3"() {
    const pc = [{ n: "Descargas", t: "dir", c: "", f: "hoy" }, { n: "Escritorio", t: "dir", c: "", f: "hoy" }, { n: "setup", t: "dir", c: "", f: "ayer" }, { n: "MiSetup-0.11.4b.tar.gz", t: "zip", c: "22 MB", f: "hoy, 10:05" }, { n: "Caddyfile", t: "yml", c: "1.2 KB", f: "hoy" }, { n: "notas-del-servidor.md", t: "md", c: "3 KB", f: "ayer" }, { n: "fondo-nuevo.png", t: "img", c: "2.4 MB", f: "lun 20 oct" }];
    const lado = (titulo, ico, ruta, l, onIdx) => `<section class="ar3-p"><div class="ar3-pc">${ic(ico)}<b>${titulo}</b><code>${ruta}</code><span class="cg-esp"></span><button class="btn icono chico" aria-label="Subir de nivel">${ic("arrow-up")}</button><button class="btn icono chico" aria-label="Buscar">${ic("search")}</button></div><div class="ar3-th"><span>Nombre</span><span class="ar-tam">Tamaño</span><span class="ar-fec">Cambiado</span></div><div class="ar3-l">${l.map((x, k) => `<div class="ar3-f ${k === onIdx ? "on" : ""}">${arIco(x, 26)}<span class="ar1-n">${esc(x.n)}</span><span class="ar-tam">${x.t === "dir" ? "" : x.c}</span><span class="ar-fec">${x.f}</span></div>`).join("")}</div></section>`;
    const cola = [["MiSetup-0.11.4b.tar.gz", "Esta PC → vps", 64, "upload", "14 MB de 22 MB · 6 s"], ["misetup-2026-10-22.sql.gz", "vps → Esta PC", 100, "download", "Listo · 18 MB"], ["docker-compose.yml", "vps → panel", 100, "send", "Listo · enviado a otro servidor"]];
    return `<div class="pagina cg ar ar3">${arHead(arServ())}
      <div class="ar3-tabsm"><button>${ic("monitor")}Esta PC</button><button class="on">${ic("server")}vps</button></div>
      <div class="ar3-dos">${lado("Esta PC", "monitor", "C:\\Users\\jokee\\Desktop", pc, 3)}<div class="ar3-mid"><button class="btn primario icono" aria-label="Subir al servidor">${ic("chevron-right")}</button><button class="btn borde icono" aria-label="Bajar a esta PC">${ic("chevron-left")}</button><button class="btn borde icono" aria-label="Enviar a otro servidor">${ic("arrow-right-left")}</button></div>${lado("vps", "server", AR_RUTA, AR_LISTA.slice(0, 10), 4)}</div>
      <div class="ar3-pie"><div class="ar3-ops">${arAcciones()}</div><div class="ar3-cola"><div class="ar3-ch"><b>${ic("arrow-right-left")}Transferencias</b><small>1 en curso · 2 listas</small><span class="cg-esp"></span><button class="btn chico">Limpiar listas</button></div>${cola.map(([n, r, pc2, i, d]) => `<div class="ar3-t"><span class="ar3-ti ${pc2 === 100 ? "ok" : ""}">${ic(pc2 === 100 ? "circle-check" : i)}</span><div class="ar3-tt"><b>${n}</b><small>${r} · ${d}</small><span class="ar-barra ${pc2 === 100 ? "ok" : ""}"><i style="width:${pc2}%"></i></span></div><button class="btn icono chico" aria-label="${pc2 === 100 ? "Abrir" : "Cancelar"}">${ic(pc2 === 100 ? "folder-open" : "x")}</button></div>`).join("")}</div></div></div>`;
  },
  "archivos-4"() {
    const col = (titulo, l, onN, ancho = "") => `<div class="ar4-col ${ancho}"><div class="ar4-ct">${titulo}</div>${l.map((x) => `<button class="ar4-i ${x.n === onN ? "on" : ""}">${arIco(x, 26)}<span>${esc(x.n)}</span>${x.t === "dir" ? ic("chevron-right") : ""}</button>`).join("")}</div>`;
    const d = (n) => ({ n, t: "dir" });
    const sel = AR_LISTA[4];
    return `<div class="pagina cg ar ar4">${arHead(arServ())}
      <div class="ar4-barra">${arMigas()}${arAcciones()}</div>
      <div class="ar4-ia"><span class="ar4-iai">${ic("sparkles")}</span><div><b>Encontré 14 archivos sueltos en /root</b><p>Propongo moverlos a carpetas (Respaldos, Instaladores, Notas) y mandar 3 archivos de basura (2.1 GB) a borrar. Nada se mueve hasta que apruebes.</p></div><div class="ar4-iab"><button class="btn primario chico">${ic("check")}Ver y aprobar</button><button class="btn chico">Ahora no</button></div></div>
      <div class="ar4-cols">${col("/root", [d(".ssh"), d("mi-setup"), { n: "notas.txt", t: "md" }, { n: "instalar.sh", t: "sh" }], "mi-setup")}${col("mi-setup", [d("app"), d("backups"), d("descargas"), { n: ".env", t: "env" }], "app")}${col("app", AR_LISTA.slice(0, 10), sel.n, "ancha")}
        <div class="ar4-prev"><div class="ar4-pcab">${arIco(sel, 64)}<h3>${sel.n}</h3><small>Archivo YAML · ${sel.c}</small></div><div class="ar4-pcod">${arEditor(AR_YML.slice(0, 12))}</div>
          <dl><dt>Cambiado</dt><dd>${sel.f}</dd><dt>Permisos</dt><dd><code>-rw-r--r--</code> · 644</dd><dt>Dueño</dt><dd>root</dd></dl>
          <div class="ar4-pb"><a class="btn primario" href="#/archivos-4/abierta">${ic("file-text")}Editar texto</a><button class="btn borde">${ic("download")}Descargar</button><button class="btn borde icono" aria-label="Enviar a otro servidor">${ic("send")}</button><button class="btn borde icono" aria-label="Renombrar">${ic("pencil")}</button><button class="btn borde icono cg-rojo" aria-label="Borrar">${ic("trash-2")}</button></div></div></div>
      <div class="ar4-movil">${AR_LISTA.map((x) => `<a class="ar4-m" href="#/archivos-4/abierta">${arIco(x, 40)}<span><b>${esc(x.n)}</b><small>${x.t === "dir" ? x.c : `${x.c} · ${x.f}`}</small></span>${ic(x.t === "dir" ? "chevron-right" : "ellipsis-vertical")}</a>`).join("")}${arPag()}</div></div>`;
  },
});

function arAbierta(n) {
  const top = (nombre, der, nota = "Sin cambios") => `<header class="cg-ab-top"><a class="btn icono" href="javascript:history.back()" aria-label="Volver">${ic("arrow-left")}</a><div class="cg-ab-tit"><b>${nombre}</b><small class="${nota === "Sin cambios" ? "" : "ar-nota"}">${nota}</small></div><span class="cg-esp"></span>${der}</header>`;
  const guardar = `<button class="btn borde"><span class="cg-t">Salir</span>${ic("x")}</button><button class="btn primario">${ic("save")}<span class="cg-t">Guardar</span></button>`;
  if (n === 1) return `<div class="pagina pleno cg cg-ab ar-ab ar1-ab">${top(`docker-compose.yml <span class="ar-ruta">${AR_RUTA}</span>`, guardar, "1 cambio sin guardar")}
    <div class="ar1-ab-pest"><span class="on">${ic("file-code")}docker-compose.yml<i></i></span><span>${ic("file-code")}Caddyfile ${ic("x")}</span><span>${ic("lock")}.env.ejemplo ${ic("x")}</span></div>
    ${arEditor(AR_YML, { marcas: { 3: "act" } })}${cgTeclas()}
    <div class="cg-ed-pie"><span>YAML</span><span>UTF-8</span><span>LF</span><span class="ar-bak">${ic("history")}Al guardar se deja una copia .bak</span><span class="cg-esp"></span><span>Línea 4, col 22</span></div></div>`;
  if (n === 2) return `<div class="pagina pleno cg cg-ab ar-ab ar2-ab">${top("docker-compose.yml", `<button class="btn icono" aria-label="Deshacer">${ic("undo-2")}</button><button class="btn icono" aria-label="Rehacer">${ic("redo-2")}</button><button class="btn icono" aria-label="Ajustar líneas">${ic("wrap-text")}</button>${guardar}`)}
    <div class="ar2-ab-bus"><div class="ar2-ab-in">${ic("search")}<span>restart</span><small>1 de 3</small></div><div class="ar2-ab-in">${ic("replace")}<span>always</span></div><div class="ar2-ab-bb"><button class="btn icono chico" aria-label="Anterior">${ic("chevron-left")}</button><button class="btn icono chico" aria-label="Siguiente">${ic("chevron-right")}</button><button class="btn chico borde">Cambiar</button><button class="btn chico borde">Cambiar todos</button><button class="btn icono chico" aria-label="Cerrar">${ic("x")}</button></div></div>
    ${arEditor(AR_YML, { buscar: "restart" })}${cgTeclas()}
    <div class="ar2-ab-pie"><button>${ic("search")}<span>Buscar</span></button><button>${ic("type")}<span>Letra</span></button><button>${ic("wrap-text")}<span>Ajustar</span></button><button>${ic("square-terminal")}<span>Terminal aquí</span></button><button>${ic("download")}<span>Descargar</span></button></div></div>`;
  if (n === 3) {
    const antes = AR_YML.slice(0, 14).map((l, i) => (i === 3 ? "    restart: always" : l));
    const ahora = AR_YML.slice(0, 14);
    return `<div class="pagina pleno cg cg-ab ar-ab ar3-ab">${top("docker-compose.yml · antes y ahora", `<button class="btn borde">${ic("undo-2")}<span class="cg-t">Volver al .bak</span></button>${guardar}`, "Comparando con docker-compose.yml.bak")}
      <div class="ar3-ab-tabs"><button>Antes (.bak)</button><button class="on">Ahora</button></div>
      <div class="ar3-ab-cuerpo"><section class="ar3-ab-l"><div class="ar3-ab-h">${ic("history")}Antes · copia .bak de hoy 9:40</div>${arEditor(antes, { marcas: { 3: "menos" } })}</section><section class="ar3-ab-l ahora"><div class="ar3-ab-h">${ic("pencil")}Ahora · lo que vas a guardar</div>${arEditor(ahora, { marcas: { 3: "mas" } })}</section></div>
      <div class="ar3-ab-res">${ic("info")}<b>1 línea cambió</b><span>«restart: always» → «restart: unless-stopped»</span></div></div>`;
  }
  return `<div class="pagina pleno cg cg-ab ar-ab ar4-ab">${top(`docker-compose.yml <span class="ar-ruta">${AR_RUTA}</span>`, guardar)}
    <div class="ar4-ab-cuerpo"><aside class="ar4-ab-mapa"><div class="ar-sec">En este archivo</div>${["services", "core", "db", "caddy", "volumes"].map((s, k) => `<button class="${k === 1 ? "on" : ""}" style="--nv:${k === 0 || k === 4 ? 0 : 1}">${ic(k === 0 || k === 4 ? "braces" : "chevron-right")}${s}</button>`).join("")}<div class="ar-sec">Carpeta</div>${AR_LISTA.slice(4, 10).map((x) => `<button class="${x.n === "docker-compose.yml" ? "on2" : ""}" style="--nv:0">${arIco(x, 20)}${esc(x.n)}</button>`).join("")}</aside>
      <section class="ar4-ab-centro">${arEditor(AR_YML)}${cgTeclas()}
        <div class="ar4-ab-term"><div class="ar4-ab-th">${ic("square-terminal")}<b>Terminal aquí</b><code>${AR_RUTA}</code><span class="cg-esp"></span><button class="btn icono chico" aria-label="Agrandar">${ic("maximize-2")}</button><button class="btn icono chico" aria-label="Cerrar terminal">${ic("x")}</button></div><pre><span class="c-verde c-b">root@vps</span>:<span class="c-azul c-b">~/mi-setup/app</span># docker compose config --quiet && echo "todo bien"
todo bien
<span class="c-verde c-b">root@vps</span>:<span class="c-azul c-b">~/mi-setup/app</span># <span class="cg-cursor"></span></pre></div></section></div></div>`;
}
const arListas = { "archivos-1": PAGINAS["archivos-1"], "archivos-2": PAGINAS["archivos-2"], "archivos-3": PAGINAS["archivos-3"], "archivos-4": PAGINAS["archivos-4"] };
Object.keys(arListas).forEach((k, i) => { PAGINAS[k] = () => (rutaActual().sub === "abierta" ? arAbierta(i + 1) : arListas[k]()); });
