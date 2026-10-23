/** Agentes de IA en tu VPS: catálogo que se instala con un botón y búsqueda en GitHub (la IA te ayuda a instalar esos). */
import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BrainCircuit, Download, ExternalLink, Search, Sparkles, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";
import { SelectorServidor, useServidores } from "../lib/vps";
import { localeActual } from "../lib/idioma";

interface Agente {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: "docker" | "npm" | "pipx" | "ollama";
  ramMb: number;
  uso: string;
  web: string;
  puerto: number | null;
}
interface Repo {
  nombre: string;
  url: string;
  descripcion: string;
  estrellas: number;
  lenguaje: string | null;
  licencia: string | null;
  actualizado: string;
  temas: string[];
}

const TIPO = { docker: "Docker", npm: "Terminal (npm)", pipx: "Terminal (Python)", ollama: "Modelo local" } as const;

function Catalogo({ servidor }: { servidor: string }) {
  const puede = usePuede("vps_agentes", "administrar");
  const servidores = useServidores();
  const nombre = servidores.data?.find((s) => s.id === servidor)?.nombre ?? "";
  const catalogo = useQuery({ queryKey: ["agentes", "catalogo"], queryFn: () => api<Agente[]>("/api/vps/agentes/catalogo") });
  const estado = useQuery({ queryKey: ["agentes", "estado", servidor], queryFn: () => api<{ instalados: string[]; ram: { totalMb: number; libreMb: number } }>(`/api/vps/servidores/${servidor}/agentes`) });
  const [salida, setSalida] = useState<{ titulo: string; texto: string; uso?: string } | null>(null);
  const accion = useMutation({
    mutationFn: (d: { agente: Agente; accion: "instalar" | "quitar" }) =>
      api<{ ok: boolean; salida: string; uso: string }>(`/api/vps/servidores/${servidor}/agentes/${d.agente.id}`, { cuerpo: { accion: d.accion, confirmacion: nombre } }),
    onSuccess: (r, d) => {
      setSalida({ titulo: r.ok ? `${d.agente.nombre}: listo` : `${d.agente.nombre}: hubo un problema`, texto: r.salida, ...(r.ok && d.accion === "instalar" ? { uso: r.uso } : {}) });
      void queryClient.invalidateQueries({ queryKey: ["agentes", "estado", servidor] });
    },
    onError: avisarError,
  });
  const pedir = async (a: Agente, que: "instalar" | "quitar") => {
    const ram = estado.data?.ram;
    const poca = que === "instalar" && ram && ram.libreMb < a.ramMb ? ` Ojo: pide unos ${a.ramMb} MB de RAM y tienes ${ram.libreMb} MB libres.` : "";
    const ok = await confirmar({
      titulo: `${que === "instalar" ? "Instalar" : "Quitar"} ${a.nombre}`,
      mensaje: `${que === "instalar" ? "Se instala en tu servidor." : "Se quita del servidor (los datos de sus volúmenes se quedan)."}${poca} Después se pedirá tu contraseña o huella.`,
      peligroso: true,
      textoExacto: nombre,
      boton: que === "instalar" ? "Instalar" : "Quitar",
    });
    if (ok) accion.mutate({ agente: a, accion: que });
  };
  const pgAg = usePaginado(catalogo.data, 12);
  return (
    <>
      <ErrorCaja error={catalogo.error ?? estado.error} />
      {estado.data ? (
        <p className="text-xs text-tenue">
          RAM del servidor: {estado.data.ram.libreMb} MB libres de {estado.data.ram.totalMb} MB.
        </p>
      ) : null}
      {accion.isPending ? <Cargando texto="Instalando en el servidor (puede tardar unos minutos)…" /> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {pgAg.visibles.map((a) => {
          const instalado = estado.data?.instalados.includes(a.id);
          return (
            <Tarjeta key={a.id} titulo={a.nombre} icono={BrainCircuit} acciones={instalado ? <Insignia tono="ok">Instalado</Insignia> : <Insignia>{TIPO[a.tipo]}</Insignia>}>
              <p className="text-sm">{a.descripcion}</p>
              <p className="mt-1 text-xs text-tenue">
                RAM aprox.: {a.ramMb >= 1024 ? `${(a.ramMb / 1024).toFixed(1)} GB` : `${a.ramMb} MB`}
                {a.puerto ? ` · panel en 127.0.0.1:${a.puerto}` : ""}
              </p>
              {instalado ? <p className="mt-1 text-xs">{a.uso}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {puede ? (
                  instalado ? (
                    <Boton tamano="sm" variante="fantasma" icono={Trash2} disabled={accion.isPending} onClick={() => void pedir(a, "quitar")}>
                      Quitar
                    </Boton>
                  ) : (
                    <Boton tamano="sm" variante="primario" icono={Download} disabled={accion.isPending} onClick={() => void pedir(a, "instalar")}>
                      Instalar
                    </Boton>
                  )
                ) : null}
                <Boton tamano="sm" variante="fantasma" icono={ExternalLink} onClick={() => abrirExterno(a.web)}>
                  Ver
                </Boton>
              </div>
            </Tarjeta>
          );
        })}
      </div>
      {pgAg.paginas}
      <Modal abierto={salida !== null} titulo={salida?.titulo ?? ""} alCerrar={() => setSalida(null)}>
        {salida?.uso ? <p className="mb-2 rounded-xl bg-ok/10 p-2 text-sm">{salida.uso}</p> : null}
        <pre className="max-h-80 overflow-auto rounded-xl bg-black/80 p-3 font-mono text-xs text-white">{salida?.texto || "(sin salida)"}</pre>
      </Modal>
    </>
  );
}

function BuscarGithub() {
  const navegar = useNavigate();
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState({ q: "", pagina: 1 });
  const q = useQuery({
    queryKey: ["agentes", "github", busqueda],
    queryFn: () => api<{ total: number; pagina: number; resultados: Repo[] }>(`/api/vps/agentes/buscar?q=${encodeURIComponent(busqueda.q)}&pagina=${busqueda.pagina}`),
    retry: false,
  });
  const paginas = Math.max(1, Math.ceil((q.data?.total ?? 0) / 12));
  const ayudaIa = (r: Repo) => {
    try {
      sessionStorage.setItem(
        "mi-setup.pregunta",
        `Quiero instalar el agente ${r.nombre} (${r.url}) en mi VPS. Revisa su README, dime qué hace, cuánta RAM pide y si es seguro, y propón los comandos (de preferencia con Docker, escuchando solo en 127.0.0.1) para que yo los apruebe.`,
      );
    } catch {
      /* sin almacenamiento */
    }
    navegar("/ia?pregunta=@sesion");
  };
  return (
    <Tarjeta titulo="Buscar más agentes en GitHub" icono={Search}>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBusqueda({ q: texto.trim(), pagina: 1 });
        }}
      >
        <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. coding, browser, voice, discord…" maxLength={80} />
        <Boton type="submit" icono={Search}>
          Buscar
        </Boton>
      </form>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data && !q.data.resultados.length ? <Vacio icono={Search} texto="Nada con eso; prueba otra palabra (en inglés suele haber más)." /> : null}
      <div className="space-y-2">
        {q.data?.resultados.map((r) => (
          <div key={r.nombre} className="rounded-xl border border-borde p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline" onClick={() => abrirExterno(r.url)}>
                {r.nombre}
              </button>
              <span className="flex items-center gap-1 text-xs text-tenue">
                <Star className="h-3 w-3" /> {r.estrellas.toLocaleString(localeActual())}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-tenue">{r.descripcion}</p>
            <p className="mt-1 text-[11px] text-tenue">
              {[r.lenguaje, r.licencia, `actualizado ${haceCuanto(r.actualizado)}`].filter(Boolean).join(" · ")}
            </p>
            <Boton className="mt-2" tamano="sm" variante="secundario" icono={Sparkles} onClick={() => ayudaIa(r)}>
              Instalar con ayuda de la IA
            </Boton>
          </div>
        ))}
      </div>
      {q.data && paginas > 1 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
          <Boton tamano="sm" variante="secundario" disabled={busqueda.pagina <= 1} onClick={() => setBusqueda({ ...busqueda, pagina: busqueda.pagina - 1 })}>
            Anterior
          </Boton>
          {Array.from({ length: Math.min(5, paginas) }, (_, i) => Math.min(Math.max(1, busqueda.pagina - 2), Math.max(1, paginas - 4)) + i).map((n) => (
            <Boton key={n} tamano="sm" variante={n === busqueda.pagina ? "primario" : "fantasma"} onClick={() => setBusqueda({ ...busqueda, pagina: n })}>
              {n}
            </Boton>
          ))}
          <Boton tamano="sm" variante="secundario" disabled={busqueda.pagina >= paginas} onClick={() => setBusqueda({ ...busqueda, pagina: busqueda.pagina + 1 })}>
            Siguiente
          </Boton>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-tenue">Lo de GitHub lo hizo otra gente: la IA revisa el proyecto y propone los comandos, y nada corre hasta que tú lo apruebes.</p>
    </Tarjeta>
  );
}

export default function VpsAgentes() {
  const [servidor, setServidor] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Agentes de IA"
        descripcion="Claude Code, Gemini, Aider, modelos locales (Llama, Qwen) y paneles como Open WebUI o n8n, corriendo en tu VPS."
        acciones={<SelectorServidor valor={servidor} alCambiar={setServidor} />}
      />
      {servidor ? <Catalogo servidor={servidor} /> : <Vacio icono={BrainCircuit} texto="Elige o agrega tu servidor en VPS → Terminal." />}
      <BuscarGithub />
      <p className="text-xs text-tenue">
        Consejo: antes de instalar varios, revisa la RAM. Si el VPS se queda sin memoria, activa «Protección contra cuelgues» y «Memoria de respaldo» en Seguridad del servidor. {""}
        <button type="button" className="underline" onClick={() => avisar("Los paneles quedan solo dentro del VPS: ábrelos con un túnel SSH o pon un subdominio en Sitios.")}>
          ¿Cómo abro los paneles?
        </button>
      </p>
    </div>
  );
}
