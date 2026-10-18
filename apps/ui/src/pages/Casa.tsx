/**
 * Mi casa: prueba de velocidad de internet, cámaras (si dan una dirección web)
 * y accesos rápidos a las apps de la casa.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, ExternalLink, Gauge, Link2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Tarjeta, Vacio, avisarError } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";
import { useSesion } from "../lib/sesion";

interface DatosCasa {
  camaras: { nombre: string; url: string }[];
  accesos: { nombre: string; url: string }[];
}

interface Resultado {
  bajada: number;
  subida: number;
  ping: number;
}

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
  const dato = (titulo: string, valor: string) => (
    <div className="rounded-xl bg-fondo p-3 text-center">
      <p className="text-xs text-tenue">{titulo}</p>
      <p className="text-2xl font-bold">{valor}</p>
    </div>
  );
  return (
    <Tarjeta titulo="Velocidad de internet" icono={Gauge}>
      <div className="space-y-3">
        <p className="text-sm text-tenue">Mide tu internet contra tu servidor (lo que importa para la app y tus juegos en el VPS).</p>
        <Boton variante="primario" icono={Gauge} disabled={paso !== null} onClick={() => void probar()}>
          {paso ?? "Probar velocidad"}
        </Boton>
        {r ? (
          <div className="grid grid-cols-3 gap-2">
            {dato("Bajada", `${r.bajada.toFixed(1)} Mbps`)}
            {dato("Subida", `${r.subida.toFixed(1)} Mbps`)}
            {dato("Ping", `${Math.round(r.ping)} ms`)}
          </div>
        ) : null}
      </div>
    </Tarjeta>
  );
}

function Lista({ titulo, icono, elementos, puede, alCambiar, ayuda, mostrar }: {
  titulo: string;
  icono: typeof Camera;
  elementos: { nombre: string; url: string }[];
  puede: boolean;
  alCambiar: (l: { nombre: string; url: string }[]) => void;
  ayuda: string;
  mostrar: (e: { nombre: string; url: string }) => React.ReactNode;
}) {
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  return (
    <Tarjeta titulo={titulo} icono={icono}>
      <div className="space-y-3">
        {!elementos.length ? <Vacio texto={ayuda} /> : null}
        {elementos.map((e, i) => (
          <div key={`${e.nombre}-${i}`} className="space-y-2 rounded-xl bg-fondo p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{e.nombre}</p>
              {puede ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar" onClick={() => alCambiar(elementos.filter((_, j) => j !== i))} /> : null}
            </div>
            {mostrar(e)}
          </div>
        ))}
        {puede ? (
          <form
            className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!nombre.trim() || !url.trim()) return;
              alCambiar([...elementos, { nombre: nombre.trim(), url: url.trim() }]);
              setNombre("");
              setUrl("");
            }}
          >
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
            <Entrada value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dirección" />
            <Boton type="submit" icono={Plus}>
              Agregar
            </Boton>
          </form>
        ) : null}
        <p className="text-xs text-tenue">{ayuda}</p>
      </div>
    </Tarjeta>
  );
}

export default function Casa() {
  const puede = usePuede("casa", "escritura");
  const q = useQuery({ queryKey: ["casa"], queryFn: () => api<DatosCasa>("/api/casa") });
  const guardar = useMutation({
    mutationFn: (d: DatosCasa) => api("/api/casa", { metodo: "PUT", cuerpo: d }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["casa"] }),
    onError: avisarError,
  });
  const datos = q.data ?? { camaras: [], accesos: [] };
  return (
    <div className="space-y-4">
      <Encabezado titulo="Mi casa" descripcion="Tu internet, tus cámaras y accesos rápidos." />
      <Velocidad />
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Lista
          titulo="Cámaras"
          icono={Camera}
          elementos={datos.camaras}
          puede={puede}
          alCambiar={(camaras) => guardar.mutate({ ...datos, camaras })}
          ayuda="Pon la dirección web de la cámara (imagen en vivo MJPEG o la página de go2rtc). Las cámaras RTSP necesitan go2rtc en tu VPS o home lab; las Blink o Ring no lo permiten."
          mostrar={(e) =>
            /\.(jpe?g|mjpe?g)(\?|$)|mjpeg|snapshot/i.test(e.url) ? (
              <img src={e.url} alt={e.nombre} className="w-full rounded-lg bg-black" />
            ) : (
              <iframe title={e.nombre} src={e.url} className="aspect-video w-full rounded-lg border-0 bg-black" allow="fullscreen" />
            )
          }
        />
        <Lista
          titulo="Accesos rápidos"
          icono={Link2}
          elementos={datos.accesos}
          puede={puede}
          alCambiar={(accesos) => guardar.mutate({ ...datos, accesos })}
          ayuda="Páginas o apps de tu casa: el panel de tu módem (192.168.1.254), la app de tu internet, Alexa (alexa.amazon.com)…"
          mostrar={(e) => (
            <Boton tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(/^\w+:/.test(e.url) ? e.url : `http://${e.url}`)}>
              Abrir
            </Boton>
          )}
        />
      </div>
      <p className="text-xs text-tenue">
        Alexa no deja controlarse desde apps de otros (solo con sus propias "skills"); por eso aquí van accesos directos a su página o app.
      </p>
    </div>
  );
}
