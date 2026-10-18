/** Música: controla tu Spotify y escucha la música que subiste al VPS. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2, Music2, Pause, Play, Search, SkipBack, SkipForward, Unlink } from "lucide-react";
import { useState } from "react";
import { Biblioteca } from "../components/Biblioteca";
import { Boton, Encabezado, Entrada, ErrorCaja, FaltaConfigurar, Tarjeta, Vacio, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";

interface Estado {
  conectado: boolean;
  configurado: boolean;
  sonando?: boolean;
  equipo?: string | null;
  cancion?: { nombre: string; artistas: string; portada: string | null; duracion: number; progreso: number } | null;
}
interface Pista {
  uri: string;
  nombre: string;
  artistas: string;
  portada: string | null;
}

function Spotify() {
  const puede = usePuede("musica", "escritura");
  const estado = useQuery({ queryKey: ["spotify"], queryFn: () => api<Estado>("/api/musica/spotify/estado"), refetchInterval: 10_000, retry: false });
  const [q, setQ] = useState("");
  const [buscado, setBuscado] = useState("");
  const resultados = useQuery({
    queryKey: ["spotify", "buscar", buscado],
    queryFn: () => api<Pista[]>(`/api/musica/spotify/buscar?q=${encodeURIComponent(buscado)}`),
    enabled: Boolean(buscado && estado.data?.conectado),
  });
  const control = useMutation({
    mutationFn: (d: { accion: "play" | "pause" | "next" | "previous"; uri?: string }) => api("/api/musica/spotify/control", { metodo: "POST", cuerpo: d }),
    onSuccess: () => setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["spotify"] }), 600),
    onError: avisarError,
  });
  const conectar = useMutation({
    mutationFn: () => api<{ url: string }>("/api/musica/spotify/conectar"),
    onSuccess: (r) => abrirExterno(r.url),
    onError: avisarError,
  });
  const desconectar = useMutation({
    mutationFn: () => api("/api/musica/spotify", { metodo: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["spotify"] }),
  });

  const d = estado.data;
  return (
    <Tarjeta
      titulo="Spotify"
      icono={Music2}
      acciones={
        d?.conectado && puede ? <Boton tamano="icono" variante="fantasma" icono={Unlink} aria-label="Desconectar Spotify" onClick={() => desconectar.mutate()} /> : null
      }
    >
      <ErrorCaja error={estado.error} />
      {d && !d.configurado ? <FaltaConfigurar variable="SPOTIFY_CLIENT_ID" detalle="Crea una app en developer.spotify.com y pon sus claves en Ajustes → Servicios y claves." /> : null}
      {d && d.configurado && !d.conectado ? (
        <Vacio
          icono={Music2}
          texto="Conecta tu cuenta para ver qué suena y controlarlo (pausar, siguiente, buscar). Controlar necesita Spotify Premium."
          accion={
            puede ? (
              <Boton variante="primario" icono={Link2} onClick={() => conectar.mutate()}>
                Conectar Spotify
              </Boton>
            ) : null
          }
        />
      ) : null}
      {d?.conectado ? (
        <div className="space-y-4">
          {d.cancion ? (
            <div className="flex items-center gap-3">
              {d.cancion.portada ? <img src={d.cancion.portada} alt="" className="h-16 w-16 shrink-0 rounded-lg" /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.cancion.nombre}</p>
                <p className="truncate text-sm text-tenue">{d.cancion.artistas}</p>
                {d.equipo ? <p className="text-xs text-tenue">En: {d.equipo}</p> : null}
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-fondo">
                  <div className="h-full bg-[#1db954]" style={{ width: `${(d.cancion.progreso / d.cancion.duracion) * 100}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-tenue">No suena nada. Abre Spotify en tu celular, PC o bocina y dale play.</p>
          )}
          {puede ? (
            <div className="flex justify-center gap-2">
              <Boton tamano="icono" icono={SkipBack} aria-label="Anterior" onClick={() => control.mutate({ accion: "previous" })} />
              <Boton tamano="icono" variante="primario" icono={d.sonando ? Pause : Play} aria-label={d.sonando ? "Pausar" : "Reproducir"} onClick={() => control.mutate({ accion: d.sonando ? "pause" : "play" })} />
              <Boton tamano="icono" icono={SkipForward} aria-label="Siguiente" onClick={() => control.mutate({ accion: "next" })} />
            </div>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setBuscado(q.trim());
            }}
          >
            <Entrada value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar canción o artista" />
            <Boton type="submit" icono={Search} aria-label="Buscar" />
          </form>
          <ErrorCaja error={resultados.error} />
          <ul className="space-y-1">
            {resultados.data?.map((p) => (
              <li key={p.uri}>
                <button type="button" disabled={!puede} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-fondo" onClick={() => control.mutate({ accion: "play", uri: p.uri })}>
                  {p.portada ? <img src={p.portada} alt="" className="h-10 w-10 shrink-0 rounded" /> : null}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.nombre}</span>
                    <span className="block truncate text-xs text-tenue">{p.artistas}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Tarjeta>
  );
}

export default function Musica() {
  return (
    <div className="space-y-4">
      <Encabezado titulo="Música" descripcion="Tu Spotify y tu propia música en el servidor." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Spotify />
        <Biblioteca tipo="musica" />
      </div>
    </div>
  );
}
