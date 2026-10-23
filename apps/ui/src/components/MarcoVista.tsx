import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../lib/api";

/** Arma una página completa con el HTML, CSS y JavaScript escritos. */
export function documentoDe(c: { html: string; css: string; js: string }): string {
  const seguro = (t: string, etiqueta: string) => t.replace(new RegExp(`</${etiqueta}`, "gi"), `<\\/${etiqueta}`);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${seguro(c.css, "style")}</style></head><body>${c.html}<script>${seguro(c.js, "script")}</script></body></html>`;
}

export const TAMANOS_VISTA = { celular: { ancho: 375, icono: Smartphone }, tableta: { ancho: 768, icono: Tablet }, pc: { ancho: 1280, icono: Monitor } } as const;

/**
 * Marco aislado con la página. Se adapta al ancho disponible: si el tamaño
 * elegido (ej. PC, 1280 px) no cabe en el celular, se ve completo a escala.
 */
export function MarcoVista({ doc, ancho, alto = 0.5, actualizar }: { doc: string; ancho: number; alto?: number; actualizar: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const marco = useRef<HTMLIFrameElement>(null);
  const listo = useRef(false);
  const ultimo = useRef(doc);
  ultimo.current = doc;
  const [disponible, setDisponible] = useState(ancho);
  const [altoCaja, setAltoCaja] = useState(400);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => {
      setDisponible(el.clientWidth || ancho);
      // alto < 0: llenar el panel que lo contiene; ≤ 1: parte de la pantalla; si no, píxeles.
      const deseado = alto < 0 ? (el.parentElement?.clientHeight ?? 400) - 4 : alto <= 1 ? window.innerHeight * alto : alto;
      setAltoCaja(Math.max(200, Math.round(deseado)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ancho, alto]);
  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      if (e.source !== marco.current?.contentWindow || e.data !== "vista-previa-lista") return;
      listo.current = true;
      marco.current?.contentWindow?.postMessage(ultimo.current, "*");
    };
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, []);
  useEffect(() => {
    if (listo.current) marco.current?.contentWindow?.postMessage(ultimo.current, "*");
  }, [actualizar]);
  const escala = Math.min(1, disponible / ancho);
  return (
    <div ref={caja} className="w-full overflow-hidden rounded-xl border border-borde bg-white" style={{ height: altoCaja }}>
      {/* Página aislada del servidor + sandbox sin allow-same-origin: el código corre sin acceso a la app ni a tu sesión. */}
      <iframe
        ref={marco}
        title="Vista previa"
        sandbox="allow-scripts allow-modals"
        src={`${API_BASE}/vista-previa`}
        style={{ width: ancho, height: altoCaja / escala, transform: `scale(${escala})`, transformOrigin: "top left", marginLeft: escala === 1 ? Math.max(0, (disponible - ancho) / 2) : 0 }}
        className="block border-0"
      />
    </div>
  );
}

