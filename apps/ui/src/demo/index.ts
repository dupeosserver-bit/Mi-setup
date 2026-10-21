/**
 * Modo demo (build con `vite build --mode demo`): la app funciona sin servidor.
 * Las lecturas salen de datos.json (grabado con scripts/demo-grabar.mjs a partir de
 * datos de ejemplo); nada se guarda y no hay ningún VPS detrás.
 */
import { MODULE_IDS, type ModuleId } from "@mi-setup/shared";
import { useSesion } from "../lib/sesion";
import datos from "./datos.json";

/** Apartados que enseña la demo (sin VPS, cuentas ni bóveda). */
const MODULOS_DEMO: readonly ModuleId[] = [
  "recordatorios", "notas", "calendario", "finanzas_personales", "chat", "portapapeles", "equipos",
  "clientes", "finanzas", "negocio", "vencimientos", "novedades", "noticias", "cripto", "inversiones", "divisas",
  "herramientas", "documentos", "convertidor", "enlaces", "compartir", "codigo", "ejercicios", "sitios",
  "editor_fotos", "editor_video", "musica", "videos", "ia", "ia_creativa", "ciberseguridad", "ajustes",
];

export const AVISO_DEMO = "Demo: nada se guarda. Descarga Mi Setup para usarlo de verdad.";

const respuestas = datos as Record<string, unknown>;
const porRuta = new Map<string, unknown>();
for (const [clave, valor] of Object.entries(respuestas)) {
  const ruta = clave.split("?")[0]!;
  if (!porRuta.has(ruta)) porRuta.set(ruta, valor);
}

function me() {
  const base = respuestas["/api/auth/me"] as { usuario: Record<string, unknown> } & Record<string, unknown>;
  const permisos = Object.fromEntries(MODULE_IDS.map((m) => [m, MODULOS_DEMO.includes(m) ? "escritura" : "ninguno"]));
  return { ...base, usuario: { ...base.usuario, role: "usuario" }, permisos };
}

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

function responder(url: URL, metodo: string): Response {
  const ruta = url.pathname.replace(/^.*?(\/api\/)/, "/api/");
  if (ruta === "/api/auth/refresh") return json({ accessToken: "demo", refreshToken: "demo", usuario: me().usuario });
  if (metodo !== "GET") return json({ error: AVISO_DEMO, codigo: "demo" }, 403);
  if (ruta === "/api/auth/me") return json(me());
  const exacta = respuestas[ruta + url.search];
  if (exacta !== undefined) return json(exacta);
  if (porRuta.has(ruta)) return json(porRuta.get(ruta));
  return json({ error: "Esto no está en la demo." }, 404);
}

/** Se llama antes de pintar la app. */
export function activarDemo(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (entrada, init) => {
    const texto = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const url = new URL(texto, location.href);
    if (url.origin === location.origin && url.pathname.includes("/api/")) {
      await new Promise((r) => setTimeout(r, 120));
      return responder(url, (init?.method ?? (entrada instanceof Request ? entrada.method : "GET")).toUpperCase());
    }
    return original(entrada, init);
  };
  const u = me().usuario as never;
  useSesion.setState({ accessToken: "demo", refreshToken: "demo", usuario: u });
  try {
    const id = (u as { id: string }).id;
    localStorage.setItem(`mi-setup.tutorial.${id}`, "1");
    localStorage.setItem(`mi-setup.tutorial.${id}.0.11.2b`, "1");
  } catch {
    /* sin almacenamiento */
  }
  const aviso = document.createElement("div");
  aviso.id = "aviso-demo";
  aviso.textContent = AVISO_DEMO;
  aviso.setAttribute("style", "position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:70;background:#fbbf24;color:#111;font:600 12px system-ui;padding:6px 12px;border-radius:999px;pointer-events:none;max-width:calc(100% - 24px);text-align:center");
  document.body.appendChild(aviso);
}
