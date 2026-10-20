/** Navegador privado: ventana con partición efímera (sin historial ni cookies persistentes) y bloqueo de rastreadores. */
import { EyeOff, Globe, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Boton, Encabezado, Entrada, Tarjeta } from "../components/ui";
import { escritorio, esMovil } from "../lib/plataforma";

function normalizar(texto: string): string | undefined {
  const t = texto.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t)) return `https://${t}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
}

export default function NavegadorPrivado() {
  const pc = escritorio();
  const [texto, setTexto] = useState("");
  return (
    <div className="space-y-4">
      <Encabezado titulo="Navegador privado" descripcion="Todo se borra al cerrar la ventana: historial, cookies, caché y sesiones." />
      {pc ? (
        <Tarjeta titulo="Abrir ventana privada" icono={EyeOff}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              pc.abrirNavegadorPrivado(normalizar(texto));
              setTexto("");
            }}
          >
            <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Dirección o búsqueda (DuckDuckGo)" />
            <Boton type="submit" variante="primario" icono={Globe}>
              Abrir
            </Boton>
          </form>
        </Tarjeta>
      ) : (
        <Tarjeta titulo="Solo en la app de PC" icono={EyeOff}>
          <p className="text-sm text-tenue">
            {esMovil()
              ? "En el celular usa la pestaña de incógnito de tu navegador; la app de Android no incluye un navegador propio."
              : "Abre Mi Setup en la app de Windows para usar el navegador privado (también desde el menú Ver o la bandeja)."}
          </p>
        </Tarjeta>
      )}
      <Tarjeta titulo="Qué protege" icono={ShieldCheck}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-tenue">
          <li>Sesión aislada en memoria: no comparte cookies con la app ni con otras ventanas.</li>
          <li>Bloqueo básico de rastreadores y anuncios conocidos.</li>
          <li>Sin permisos de cámara, micrófono, ubicación ni notificaciones.</li>
          <li>No oculta tu IP.</li>
        </ul>
      </Tarjeta>
    </div>
  );
}
