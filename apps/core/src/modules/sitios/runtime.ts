/**
 * Script que se carga en cada sitio publicado (/_ms/runtime.js). Hace que el
 * diseño funcione como app sin que el dueño escriba código:
 * - Formularios → llegan a Mi Setup (y avisan al dueño).
 * - [data-ms-tabla] → muestra filas de una tabla de datos.
 * - [data-ms-producto] + carrito → pedido por WhatsApp (y queda guardado).
 * - [data-ms-login] / [data-ms-salir] → cuentas del área privada.
 * - [data-ms-bloque] → contador, clima, último video, en vivo, servidores.
 * - Estadísticas privadas (visitas y clics), sin cookies de rastreo.
 * - App instalable (service worker) si el dueño la activó.
 */
export const RUNTIME = `(function () {
  "use strict";
  var MS = window.__MS || {};
  function enviar(ruta, datos) {
    return fetch(ruta, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(datos), credentials: "same-origin" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "Error"); return j; });
    });
  }
  function texto(el) { return (el.getAttribute("data-ms-evento") || el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ").slice(0, 60); }
  function dinero(n) { try { return Number(n).toLocaleString("es-MX", { style: "currency", currency: MS.moneda || "MXN" }); } catch (e) { return "$" + n; } }
  function aviso(msg) {
    var d = document.createElement("div");
    d.textContent = msg;
    d.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:12px 18px;border-radius:12px;z-index:99999;font:14px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.3)";
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 3500);
  }

  // ---------------------------------------------------------- estadísticas
  try {
    var ref = document.referrer ? new URL(document.referrer).hostname : "";
    if (ref === location.hostname) ref = "";
    enviar("/_ms/evento", { tipo: "visita", clave: location.pathname, ref: ref }).catch(function () {});
  } catch (e) {}
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("a,button,[data-ms-evento]") : null;
    if (el && !el.closest("[data-ms-ignorar]")) enviar("/_ms/evento", { tipo: "clic", clave: texto(el) || el.tagName.toLowerCase() }).catch(function () {});
  }, true);

  // ---------------------------------------------------------- formularios
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (!f || f.tagName !== "FORM" || f.hasAttribute("data-ms-normal") || f.hasAttribute("data-ms-login")) return;
    e.preventDefault();
    var datos = {};
    new FormData(f).forEach(function (v, k) { if (typeof v === "string") datos[k] = v.slice(0, 2000); });
    var boton = f.querySelector("[type=submit],button");
    if (boton) boton.disabled = true;
    enviar("/_ms/formulario", { formulario: f.getAttribute("name") || f.id || "contacto", datos: datos })
      .then(function () { f.reset(); aviso(f.getAttribute("data-ms-gracias") || "¡Enviado! Gracias."); })
      .catch(function (err) { aviso(err.message); })
      .then(function () { if (boton) boton.disabled = false; });
  });

  // ---------------------------------------------------------- tablas de datos
  function llenar(nodo, fila) {
    nodo.querySelectorAll("[data-campo]").forEach(function (el) {
      var v = fila[el.getAttribute("data-campo")];
      if (v === undefined || v === null) v = "";
      if (el.tagName === "IMG") el.src = String(v);
      else if (el.tagName === "A") el.href = String(v);
      else el.textContent = el.hasAttribute("data-dinero") ? dinero(v) : String(v);
    });
    if (nodo.hasAttribute("data-ms-producto")) {
      if (fila.nombre !== undefined) nodo.setAttribute("data-nombre", fila.nombre);
      if (fila.precio !== undefined) nodo.setAttribute("data-precio", fila.precio);
    }
  }
  document.querySelectorAll("[data-ms-tabla]").forEach(function (cont) {
    var plantilla = cont.querySelector("[data-ms-plantilla]");
    if (plantilla) plantilla.remove();
    fetch("/_ms/datos/" + encodeURIComponent(cont.getAttribute("data-ms-tabla"))).then(function (r) { return r.json(); }).then(function (d) {
      (d.filas || []).forEach(function (fila) {
        var nodo;
        if (plantilla) {
          nodo = plantilla.cloneNode(true);
          nodo.removeAttribute("data-ms-plantilla");
          llenar(nodo, fila);
        } else {
          nodo = document.createElement("div");
          nodo.className = "ms-tarjeta";
          Object.keys(fila).forEach(function (k) {
            var v = fila[k];
            if (/^https?:.*\\.(png|jpe?g|webp|gif)$/i.test(String(v)) || (String(v).indexOf("/_archivos/") === 0)) { var i = document.createElement("img"); i.src = v; i.alt = ""; nodo.appendChild(i); }
            else { var p = document.createElement("p"); p.textContent = (k === "precio" ? dinero(v) : String(v)); nodo.appendChild(p); }
          });
        }
        cont.appendChild(nodo);
      });
      prepararProductos(cont);
    }).catch(function () {});
  });

  // ---------------------------------------------------------- carrito y pedidos
  var carrito = [];
  try { carrito = JSON.parse(sessionStorage.getItem("ms-carrito") || "[]"); } catch (e) {}
  var boton = null;
  function guardarCarrito() {
    try { sessionStorage.setItem("ms-carrito", JSON.stringify(carrito)); } catch (e) {}
    var n = carrito.reduce(function (t, i) { return t + i.cantidad; }, 0);
    if (!boton && n) {
      boton = document.createElement("button");
      boton.setAttribute("data-ms-ignorar", "");
      boton.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:99998;border:0;border-radius:999px;padding:14px 20px;background:" + (MS.color || "#16a34a") + ";color:#fff;font:600 15px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.3);cursor:pointer";
      boton.onclick = abrirCarrito;
      document.body.appendChild(boton);
    }
    if (boton) { boton.textContent = "🛒 " + n + " · " + dinero(total()); boton.style.display = n ? "" : "none"; }
  }
  function total() { return carrito.reduce(function (t, i) { return t + i.precio * i.cantidad; }, 0); }
  function prepararProductos(raiz) {
    (raiz || document).querySelectorAll("[data-ms-producto]").forEach(function (p) {
      if (p.__ms) return;
      p.__ms = true;
      var b = p.querySelector("[data-ms-agregar]");
      if (!b) { b = document.createElement("button"); b.textContent = "Agregar"; b.setAttribute("data-ms-agregar", ""); b.className = "ms-agregar"; p.appendChild(b); }
      b.addEventListener("click", function (e) {
        e.preventDefault();
        var nombre = p.getAttribute("data-nombre") || "Producto";
        var precio = Number(p.getAttribute("data-precio") || 0);
        var ya = carrito.filter(function (i) { return i.nombre === nombre; })[0];
        if (ya) ya.cantidad++; else carrito.push({ nombre: nombre, precio: precio, cantidad: 1 });
        guardarCarrito();
        aviso("Agregado: " + nombre);
      });
    });
  }
  function abrirCarrito() {
    var fondo = document.createElement("div");
    fondo.setAttribute("data-ms-ignorar", "");
    fondo.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:flex-end;justify-content:center;font:15px system-ui";
    var caja = document.createElement("div");
    caja.style.cssText = "background:#fff;color:#111;width:100%;max-width:440px;max-height:85vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px";
    function pintar() {
      caja.innerHTML = "";
      var h = document.createElement("h3"); h.textContent = "Tu pedido"; h.style.margin = "0 0 10px"; caja.appendChild(h);
      carrito.forEach(function (i, idx) {
        var fila = document.createElement("div");
        fila.style.cssText = "display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #eee";
        var t = document.createElement("span"); t.style.flex = "1"; t.textContent = i.cantidad + " × " + i.nombre + " · " + dinero(i.precio * i.cantidad);
        var menos = document.createElement("button"); menos.textContent = "−"; menos.onclick = function () { i.cantidad--; if (i.cantidad <= 0) carrito.splice(idx, 1); guardarCarrito(); pintar(); };
        fila.appendChild(t); fila.appendChild(menos); caja.appendChild(fila);
      });
      var tot = document.createElement("p"); tot.style.fontWeight = "700"; tot.textContent = "Total: " + dinero(total()); caja.appendChild(tot);
      var form = document.createElement("form");
      form.setAttribute("data-ms-normal", "");
      form.innerHTML = '<input name="nombre" required placeholder="Tu nombre" style="width:100%;padding:10px;margin:4px 0;border:1px solid #ccc;border-radius:10px">' +
        '<input name="telefono" placeholder="Teléfono" style="width:100%;padding:10px;margin:4px 0;border:1px solid #ccc;border-radius:10px">' +
        '<textarea name="notas" placeholder="Notas (sabor, fecha de entrega…)" style="width:100%;padding:10px;margin:4px 0;border:1px solid #ccc;border-radius:10px"></textarea>' +
        '<button style="width:100%;padding:12px;border:0;border-radius:12px;background:' + (MS.color || "#16a34a") + ';color:#fff;font-weight:700">' + (MS.whatsapp ? "Enviar pedido por WhatsApp" : "Enviar pedido") + "</button>";
      form.onsubmit = function (e) {
        e.preventDefault();
        if (!carrito.length) return;
        var c = {}; new FormData(form).forEach(function (v, k) { c[k] = String(v).slice(0, 500); });
        var lineas = carrito.map(function (i) { return i.cantidad + " × " + i.nombre + " (" + dinero(i.precio * i.cantidad) + ")"; });
        var mensaje = "Hola, quiero hacer este pedido:\\n" + lineas.join("\\n") + "\\nTotal: " + dinero(total()) + "\\nNombre: " + c.nombre + (c.telefono ? "\\nTel: " + c.telefono : "") + (c.notas ? "\\nNotas: " + c.notas : "");
        var whats = MS.whatsapp ? window.open("about:blank", "_blank") : null;
        enviar("/_ms/pedido", { items: carrito, cliente: c }).then(function () {
          if (whats) whats.location.href = "https://wa.me/" + MS.whatsapp + "?text=" + encodeURIComponent(mensaje);
          carrito = []; guardarCarrito(); fondo.remove(); aviso("¡Pedido enviado!");
        }).catch(function (err) { if (whats) whats.close(); aviso(err.message); });
      };
      caja.appendChild(form);
    }
    pintar();
    fondo.appendChild(caja);
    fondo.onclick = function (e) { if (e.target === fondo) fondo.remove(); };
    document.body.appendChild(fondo);
  }
  prepararProductos(document);
  guardarCarrito();

  // ---------------------------------------------------------- cuentas (área privada)
  document.querySelectorAll("form[data-ms-login]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = {}; new FormData(f).forEach(function (v, k) { d[k] = String(v); });
      enviar("/_ms/entrar", { correo: d.correo || d.email, clave: d.clave || d.password }).then(function () {
        location.href = f.getAttribute("data-ms-destino") || new URLSearchParams(location.search).get("volver") || "/";
      }).catch(function (err) { aviso(err.message); });
    });
  });
  document.querySelectorAll("[data-ms-salir]").forEach(function (b) {
    b.addEventListener("click", function (e) { e.preventDefault(); enviar("/_ms/salir", {}).then(function () { location.href = "/"; }); });
  });
  if (document.querySelector("[data-ms-usuario]")) {
    fetch("/_ms/yo").then(function (r) { return r.json(); }).then(function (d) {
      document.querySelectorAll("[data-ms-usuario]").forEach(function (el) { el.textContent = d.nombre || d.correo || ""; });
    }).catch(function () {});
  }

  // ---------------------------------------------------------- bloques en vivo
  document.querySelectorAll("[data-ms-bloque]").forEach(function (b) {
    var tipo = b.getAttribute("data-ms-bloque");
    if (tipo === "contador") {
      var fin = new Date(b.getAttribute("data-fecha") || Date.now()).getTime();
      var t = function () {
        var s = Math.max(0, Math.floor((fin - Date.now()) / 1000));
        b.textContent = s ? Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h " + Math.floor((s % 3600) / 60) + "m " + (s % 60) + "s" : (b.getAttribute("data-final") || "¡Llegó el día!");
      };
      t(); setInterval(t, 1000);
    } else if (tipo === "envivo") {
      var canal = (b.getAttribute("data-twitch") || "").replace(/[^\\w]/g, "");
      var kick = (b.getAttribute("data-kick") || "").replace(/[^\\w-]/g, "");
      var src = canal ? "https://player.twitch.tv/?channel=" + canal + "&parent=" + location.hostname + "&muted=true" : kick ? "https://player.kick.com/" + kick : "";
      if (src) b.innerHTML = '<iframe src="' + src + '" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px" allowfullscreen></iframe>';
    } else {
      var q = new URLSearchParams();
      ["canal", "lat", "lon"].forEach(function (k) { var v = b.getAttribute("data-" + k); if (v) q.set(k, v); });
      fetch("/_ms/bloque/" + encodeURIComponent(tipo) + "?" + q.toString()).then(function (r) { return r.json(); }).then(function (d) {
        if (tipo === "youtube" && d.video) b.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(d.video) + '" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px" allowfullscreen></iframe>';
        else if (tipo === "clima" && d.temperatura !== undefined) b.textContent = Math.round(d.temperatura) + "°C · " + (d.texto || "");
        else if (tipo === "servidores" && d.servidores) b.innerHTML = d.servidores.map(function (s) {
          return '<div class="ms-servidor"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (s.encendido ? "#22c55e" : "#ef4444") + '"></span> <strong></strong> <span class="ms-ip"></span></div>';
        }).join("");
        if (tipo === "servidores" && d.servidores) b.querySelectorAll(".ms-servidor").forEach(function (el, i) {
          el.querySelector("strong").textContent = d.servidores[i].nombre;
          el.querySelector(".ms-ip").textContent = d.servidores[i].direccion || "";
        });
      }).catch(function () {});
    }
  });

  // ---------------------------------------------------------- app instalable
  if (MS.app && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(function () {});
})();
`;

/** Service worker mínimo: guarda las páginas para abrir sin internet. */
export const SERVICE_WORKER = `self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin || new URL(r.url).pathname.indexOf("/_ms/") === 0) return;
  e.respondWith(fetch(r).then(function (res) {
    var copia = res.clone();
    caches.open("ms-sitio").then(function (c) { c.put(r, copia); });
    return res;
  }).catch(function () { return caches.match(r); }));
});
`;
