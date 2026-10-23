import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Camera, ChevronLeft, ExternalLink, Gauge, Info, Link2, Maximize2, Minimize2, Plus, Timer, Trash2, Video, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePaginado } from "../components/Paginas";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Tarjeta, Vacio, avisarError, cx } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { useModoPagina } from "../lib/marco";
import { abrirExterno } from "../lib/plataforma";
import { useSesion } from "../lib/sesion";

interface Elemento {
  nombre: string;
  url: string;
}

interface DatosCasa {
  camaras: Elemento[];
  accesos: Elemento[];
}

interface Resultado {
  bajada: number;
  subida: number;
  ping: number;
}

const AYUDA_CAMARAS = "Pon la dirección web de la cámara (imagen en vivo MJPEG o la página de go2rtc). Las cámaras RTSP necesitan go2rtc en tu VPS o home lab; las Blink o Ring no lo permiten.";
const AYUDA_ACCESOS = "Páginas o apps de tu casa: el panel de tu módem (192.168.1.254), la app de tu internet, Alexa (alexa.amazon.com)…";
const COLORES_ACCESO = ["#7cb7ff", "#3ddc84", "#b497ff", "#f5c451", "#ff6b81"];

const suave = (color: string) => ({ background: `color-mix(in srgb, ${color} 16%, transparent)`, color });

const esImagen = (url: string) => /\.(jpe?g|mjpe?g)(\?|$)|mjpeg|snapshot/i.test(url);

async function medir(alPaso: (t: string) => void): Promise<Resultado> {
  const cabeceras = { authorization: `Bearer ${useSesion.getState().accessToken ?? ""}` };
  alPaso("Midiendo ping…");
  const pings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await fetch(`${API_BASE}/api/casa/ping`, { headers: cabeceras, cache: "no-store" });
    pings.push(performance.now() - t);
  }
  alPaso("Midiendo bajada…");
  let t = performance.now();
  const r = await fetch(`${API_BASE}/api/casa/velocidad?mb=20`, { headers: cabeceras, cache: "no-store" });
  if (!r.ok) throw new Error("No se pudo medir (¿sesión vencida? recarga la página)");
  const bajados = (await r.arrayBuffer()).byteLength;
  const bajada = (bajados * 8) / ((performance.now() - t) / 1000) / 1e6;
  alPaso("Midiendo subida…");
  const datos = new Uint8Array(8 * 1024 * 1024);
  crypto.getRandomValues(datos.subarray(0, 65536));
  t = performance.now();
  await fetch(`${API_BASE}/api/casa/velocidad`, { method: "POST", headers: { ...cabeceras, "content-type": "application/octet-stream" }, body: datos });
  const subida = (datos.byteLength * 8) / ((performance.now() - t) / 1000) / 1e6;
  return { bajada, subida, ping: Math.min(...pings) };
}

function Dato({ titulo, valor, unidad, icono: Icono, color }: { titulo: string; valor: string; unidad: string; icono: LucideIcon; color: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-borde bg-fondo p-3">
      <p className="flex items-center gap-1.5 text-xs text-tenue">
        <Icono className="h-3.5 w-3.5" style={{ color }} />
        {titulo}
      </p>
      <p className="mt-1 truncate text-2xl font-bold tabular-nums md:text-3xl">
        {valor}
        <small className="ml-1 text-xs font-medium text-tenue">{unidad}</small>
      </p>
    </div>
  );
}

function Velocidad() {
  const [paso, setPaso] = useState<string | null>(null);
  const [r, setR] = useState<Resultado | null>(null);
  const probar = async () => {
    setR(null);
    try {
      setR(await medir(setPaso));
    } catch (err) {
      avisarError(err);
    } finally {
      setPaso(null);
    }
  };
  return (
    <section className="grid min-w-0 gap-4 rounded-tarjeta border border-borde bg-superficie p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={suave("var(--acento)")}>
          <Gauge className="h-5 w-5" />
        </span>
        <div className="min-w-[12rem] flex-1">
          <h3 className="text-sm font-semibold">Velocidad de internet</h3>
          <p className="text-xs text-tenue">Mide tu internet contra tu servidor (lo que importa para la app y tus juegos en el VPS).</p>
        </div>
        <Boton variante="primario" icono={Gauge} className="w-full sm:w-auto" disabled={paso !== null} onClick={() => void probar()}>
          {paso ?? "Probar velocidad"}
        </Boton>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Dato titulo="Bajada" valor={r ? r.bajada.toFixed(1) : "—"} unidad="Mbps" icono={ArrowDown} color="#7cb7ff" />
        <Dato titulo="Subida" valor={r ? r.subida.toFixed(1) : "—"} unidad="Mbps" icono={ArrowUp} color="#3ddc84" />
        <Dato titulo="Ping" valor={r ? String(Math.round(r.ping)) : "—"} unidad="ms" icono={Timer} color="#f5c451" />
      </div>
    </section>
  );
}

function VistaCamara({ camara, className }: { camara: Elemento; className?: string }) {
  return esImagen(camara.url) ? (
    <img src={camara.url} alt={camara.nombre} className={cx("h-full w-full bg-black object-contain", className)} />
  ) : (
    <iframe title={camara.nombre} src={camara.url} className={cx("h-full w-full border-0 bg-black", className)} allow="fullscreen" />
  );
}

function Formulario({ alAgregar }: { alAgregar: (e: Elemento) => void }) {
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  return (
    <form
      className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!nombre.trim() || !url.trim()) return;
        alAgregar({ nombre: nombre.trim(), url: url.trim() });
        setNombre("");
        setUrl("");
      }}
    >
      <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" aria-label="Nombre" />
      <Entrada value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dirección" aria-label="Dirección" />
      <Boton type="submit" icono={Plus}>
        Agregar
      </Boton>
    </form>
  );
}

function Cuenta({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-tarjeta px-2 py-0.5 text-xs text-tenue">{children}</span>;
}

function Camaras({ camaras, puede, alCambiar, alAbrir }: { camaras: Elemento[]; puede: boolean; alCambiar: (l: Elemento[]) => void; alAbrir: (i: number) => void }) {
  const { visibles, paginas, pagina } = usePaginado(camaras, 4);
  const base = (pagina - 1) * 4;
  return (
    <Tarjeta titulo="Cámaras" icono={Camera} acciones={<Cuenta>{camaras.length === 1 ? "1 cámara" : `${camaras.length} cámaras`}</Cuenta>}>
      <div className="space-y-3">
        {!camaras.length ? <Vacio icono={Camera} texto={AYUDA_CAMARAS} /> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibles.map((c, k) => {
            const i = base + k;
            return (
              <figure key={`${c.nombre}-${i}`} className="group relative m-0 aspect-video min-w-0 overflow-hidden rounded-xl border border-borde bg-black">
                <VistaCamara camara={c} />
                <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 text-white">
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{c.nombre}</b>
                    <small className="text-[11px] opacity-80">{esImagen(c.url) ? "Imagen en vivo" : "Página de go2rtc"}</small>
                  </span>
                </figcaption>
                <div className="absolute right-2 top-2 flex gap-1">
                  <Boton tamano="icono" variante="secundario" icono={Maximize2} aria-label={`Ver ${c.nombre} en pantalla completa`} onClick={() => alAbrir(i)} />
                  {puede ? <Boton tamano="icono" variante="secundario" icono={Trash2} aria-label="Quitar" onClick={() => alCambiar(camaras.filter((_, j) => j !== i))} /> : null}
                </div>
              </figure>
            );
          })}
        </div>
        {paginas}
        {puede ? <Formulario alAgregar={(e) => alCambiar([...camaras, e])} /> : null}
        {camaras.length ? <p className="text-xs text-tenue">{AYUDA_CAMARAS}</p> : null}
      </div>
    </Tarjeta>
  );
}

function Accesos({ accesos, puede, alCambiar }: { accesos: Elemento[]; puede: boolean; alCambiar: (l: Elemento[]) => void }) {
  const { visibles, paginas, pagina } = usePaginado(accesos, 5);
  const base = (pagina - 1) * 5;
  return (
    <Tarjeta titulo="Accesos rápidos" icono={Link2} acciones={<Cuenta>{accesos.length === 1 ? "1 acceso" : `${accesos.length} accesos`}</Cuenta>}>
      <div className="space-y-3">
        {!accesos.length ? <Vacio icono={Link2} texto={AYUDA_ACCESOS} /> : null}
        <div className="space-y-2">
          {visibles.map((a, k) => {
            const i = base + k;
            const color = COLORES_ACCESO[i % COLORES_ACCESO.length] ?? "#b497ff";
            return (
              <div key={`${a.nombre}-${i}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-borde bg-fondo p-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={suave(color)}>
                  <ExternalLink className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{a.nombre}</b>
                  <small className="block truncate text-xs text-tenue">{a.url}</small>
                </span>
                <Boton tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(/^\w+:/.test(a.url) ? a.url : `http://${a.url}`)}>
                  Abrir
                </Boton>
                {puede ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar" onClick={() => alCambiar(accesos.filter((_, j) => j !== i))} /> : null}
              </div>
            );
          })}
        </div>
        {paginas}
        {puede ? <Formulario alAgregar={(e) => alCambiar([...accesos, e])} /> : null}
        {accesos.length ? <p className="text-xs text-tenue">{AYUDA_ACCESOS}</p> : null}
      </div>
    </Tarjeta>
  );
}

function CamaraCompleta({ camaras, indice, alElegir, alCerrar }: { camaras: Elemento[]; indice: number; alElegir: (i: number) => void; alCerrar: () => void }) {
  useModoPagina("completa");
  const actual = camaras[indice];
  if (!actual) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-fondo" style={{ height: "var(--alto-app, 100dvh)" }}>
      <header className="flex items-center gap-2 border-b border-borde px-3 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <Boton tamano="icono" variante="fantasma" icono={ChevronLeft} aria-label="Volver" onClick={alCerrar} />
        <b className="min-w-0 truncate">{actual.nombre}</b>
        <span className="hidden text-xs text-tenue sm:inline">{esImagen(actual.url) ? "Imagen en vivo" : "Página de go2rtc"}</span>
        <span className="flex-1" />
        <Boton tamano="sm" variante="secundario" icono={Minimize2} onClick={alCerrar}>
          <span className="hidden sm:inline">Salir de pantalla completa</span>
        </Boton>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-borde bg-black">
          <VistaCamara camara={actual} />
        </div>
        {camaras.length > 1 ? (
          <aside className="flex shrink-0 gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden" aria-label="Otras cámaras">
            {camaras.map((c, i) => (
              <button
                key={`${c.nombre}-${i}`}
                type="button"
                onClick={() => alElegir(i)}
                aria-current={i === indice ? "true" : undefined}
                className={cx(
                  "flex min-w-[9rem] items-center gap-2 rounded-xl border p-2 text-left text-sm lg:min-w-0",
                  i === indice ? "border-acento text-texto" : "border-borde text-tenue hover:text-texto",
                )}
                style={i === indice ? suave("var(--acento)") : undefined}
              >
                <span className="grid h-9 w-12 shrink-0 place-items-center rounded-md bg-black">
                  <Video className="h-4 w-4 text-white/70" />
                </span>
                <span className="min-w-0 truncate">{c.nombre}</span>
              </button>
            ))}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export default function Casa() {
  const puede = usePuede("casa", "escritura");
  const [abierta, setAbierta] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["casa"], queryFn: () => api<DatosCasa>("/api/casa") });
  const guardar = useMutation({
    mutationFn: (d: DatosCasa) => api("/api/casa", { metodo: "PUT", cuerpo: d }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["casa"] }),
    onError: avisarError,
  });
  const datos = q.data ?? { camaras: [], accesos: [] };
  if (abierta !== null && datos.camaras[abierta]) {
    return <CamaraCompleta camaras={datos.camaras} indice={abierta} alElegir={setAbierta} alCerrar={() => setAbierta(null)} />;
  }
  return (
    <div className="space-y-4">
      <Encabezado titulo="Mi casa" descripcion="Tu internet, tus cámaras y accesos rápidos." />
      <Velocidad />
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Camaras camaras={datos.camaras} puede={puede} alCambiar={(camaras) => guardar.mutate({ ...datos, camaras })} alAbrir={setAbierta} />
        <Accesos accesos={datos.accesos} puede={puede} alCambiar={(accesos) => guardar.mutate({ ...datos, accesos })} />
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-borde bg-superficie p-3 text-xs text-tenue">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Alexa no deja controlarse desde apps de otros (solo con sus propias "skills"); por eso aquí van accesos directos a su página o app.</span>
      </p>
    </div>
  );
}
