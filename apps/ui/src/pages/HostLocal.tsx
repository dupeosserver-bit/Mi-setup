/**
 * Host local: crea y maneja servidores de juego en tu PC (app de Windows).
 * Minecraft Paper/Fabric/Forge/Vanilla con Java automático, consola, ajustes,
 * mods y plugins (Modrinth/CurseForge), playit.gg y pasar a tu VPS.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Boxes,
  CloudUpload,
  Code2,
  Download,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Globe,
  Package,
  Play,
  Plus,
  Power,
  Search,
  Send,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConsolaLocal } from "../components/ConsolaLocal";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { abrirExterno, escritorio, type Addon, type ClaseAddon, type ServidoresLocales, type ServidorLocal, type TipoServidor } from "../lib/plataforma";

const TIPOS: Record<TipoServidor, { nombre: string; detalle: string; grupo: string }> = {
  paper: { grupo: "Plugins", nombre: "Paper", detalle: "El más usado: rápido y con plugins (EssentialsX, WorldEdit, LuckPerms…)." },
  purpur: { grupo: "Plugins", nombre: "Purpur", detalle: "Paper con más opciones para personalizar el juego. Usa los mismos plugins." },
  folia: { grupo: "Plugins", nombre: "Folia", detalle: "De los creadores de Paper, para muchos jugadores (usa varios núcleos). Solo plugins hechos para Folia." },
  fabric: { grupo: "Mods", nombre: "Fabric", detalle: "Mods ligeros y modernos (Sodium, Lithium, Create Fabric…)." },
  quilt: { grupo: "Mods", nombre: "Quilt", detalle: "Parecido a Fabric y compatible con casi todos sus mods." },
  forge: { grupo: "Mods", nombre: "Forge", detalle: "Mods clásicos y modpacks grandes." },
  neoforge: { grupo: "Mods", nombre: "NeoForge", detalle: "La continuación de Forge: la mayoría de mods nuevos (1.20.2 en adelante) salen para NeoForge." },
  mohist: { grupo: "Mods y plugins", nombre: "Mohist", detalle: "Forge/NeoForge con plugins de Bukkit/Spigot al mismo tiempo." },
  arclight: { grupo: "Mods y plugins", nombre: "Arclight", detalle: "Mods (Forge, NeoForge o Fabric) y plugins juntos. Elige la versión con el cargador que quieras." },
  vanilla: { grupo: "Otros", nombre: "Vanilla (oficial)", detalle: "Minecraft tal cual, sin mods ni plugins." },
  velocity: { grupo: "Otros", nombre: "Velocity (proxy)", detalle: "Une varios servidores en uno (lobby, survival, minijuegos). Se configura en velocity.toml." },
  personalizado: { grupo: "Otros", nombre: "Otro juego", detalle: "Cualquier servidor (Terraria, Valheim, etc.): eliges su carpeta y el comando que lo enciende." },
};
const GRUPOS = ["Plugins", "Mods", "Mods y plugins", "Otros"];
const CARGADOR: Record<string, string> = { forge: "Forge", neoforge: "NeoForge", fabric: "Fabric" };
/** "1.21.1-neoforge" → "1.21.1 (NeoForge)". */
const textoVersion = (v: string) => v.replace(/-(forge|neoforge|fabric)$/, (_, c: string) => ` (${CARGADOR[c]})`);
const clasesDe = (s: ServidorLocal): ClaseAddon[] => s.clases ?? (s.tipo === "paper" ? ["plugins"] : s.tipo === "fabric" || s.tipo === "forge" ? ["mods"] : []);
const mcDe = (s: ServidorLocal) => s.mc ?? s.version;
const ESTADO = { detenido: { texto: "Apagado", tono: "neutro" }, iniciando: { texto: "Encendiendo…", tono: "aviso" }, encendido: { texto: "Encendido", tono: "ok" }, deteniendo: { texto: "Apagando…", tono: "aviso" } } as const;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
const sinAnsi = (t: string) => t.replace(ANSI, "");

function useProgreso(srv: ServidoresLocales) {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => srv.alProgreso((t) => setTexto(t === "Listo" ? null : t)), [srv]);
  return [texto, setTexto] as const;
}

function Crear({ srv, alCrear, alCerrar }: { srv: ServidoresLocales; alCrear: (s: ServidorLocal) => void; alCerrar: () => void }) {
  const [tipo, setTipo] = useState<TipoServidor>("paper");
  const [version, setVersion] = useState("");
  const [nombre, setNombre] = useState("Survival");
  const [ram, setRam] = useState(4096);
  const [puerto, setPuerto] = useState(25565);
  const [eula, setEula] = useState(false);
  const [comando, setComando] = useState("");
  const [progreso] = useProgreso(srv);
  const versiones = useQuery({ queryKey: ["host-local", "versiones", tipo], queryFn: () => srv.versiones(tipo), enabled: tipo !== "personalizado", staleTime: 30 * 60_000 });
  useEffect(() => {
    if (versiones.data?.[0]) setVersion(versiones.data[0]);
  }, [versiones.data]);
  const crear = useMutation({
    mutationFn: () => srv.crear({ nombre, tipo, version, ramMb: ram, puerto, eula, ...(tipo === "personalizado" ? { comando } : {}) }),
    onSuccess: (s) => {
      if (s) alCrear(s);
    },
    onError: avisarError,
  });
  const esMc = tipo !== "personalizado";
  const pideEula = esMc && tipo !== "velocity";
  return (
    <Modal abierto titulo="Crear servidor" alCerrar={alCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Tipo">
          <Selector value={tipo} onChange={(e) => setTipo(e.target.value as TipoServidor)}>
            {GRUPOS.map((g) => (
              <optgroup key={g} label={g}>
                {(Object.keys(TIPOS) as TipoServidor[])
                  .filter((t) => TIPOS[t].grupo === g)
                  .map((t) => (
                    <option key={t} value={t}>
                      {TIPOS[t].nombre}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Selector>
        </Campo>
        <p className="text-xs text-tenue">{TIPOS[tipo].detalle}</p>
        <Campo etiqueta="Nombre">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} />
        </Campo>
        {esMc ? (
          <Campo etiqueta={tipo === "velocity" ? "Versión de Velocity" : "Versión de Minecraft"}>
            {versiones.isLoading ? (
              <Cargando texto="Buscando versiones…" />
            ) : (
              <Selector value={version} onChange={(e) => setVersion(e.target.value)}>
                {(versiones.data ?? []).map((v) => (
                  <option key={v} value={v}>
                    {textoVersion(v)}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>
        ) : (
          <Campo etiqueta="Comando que lo enciende (dentro de su carpeta)">
            <Entrada value={comando} onChange={(e) => setComando(e.target.value)} placeholder="Ej. TerrariaServer.exe -config serverconfig.txt" />
          </Campo>
        )}
        <ErrorCaja error={versiones.error} />
        <Campo etiqueta={`Memoria RAM: ${(ram / 1024).toFixed(1)} GB`}>
          <input type="range" min={1024} max={16384} step={512} value={ram} onChange={(e) => setRam(Number(e.target.value))} className="w-full accent-acento" />
        </Campo>
        <Campo etiqueta="Puerto">
          <Entrada type="number" min={1024} max={65535} value={puerto} onChange={(e) => setPuerto(Number(e.target.value))} />
        </Campo>
        {pideEula ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={eula} onChange={(e) => setEula(e.target.checked)} className="mt-1" />
            <span>
              Acepto la{" "}
              <button type="button" className="underline" onClick={() => abrirExterno("https://aka.ms/MinecraftEULA")}>
                EULA de Minecraft
              </button>{" "}
              (obligatoria para cualquier servidor).
            </span>
          </label>
        ) : null}
        <Boton variante="primario" className="w-full" cargando={crear.isPending} disabled={!nombre.trim() || (esMc ? (pideEula && !eula) || !version : !comando.trim())} onClick={() => crear.mutate()}>
          {crear.isPending ? (progreso ?? "Preparando…") : esMc ? "Crear y descargar" : "Elegir carpeta y crear"}
        </Boton>
        {esMc ? <p className="text-xs text-tenue">La primera vez baja Java (unos 200 MB) y el servidor. Queda en Documentos\MiSetup Servidores.</p> : null}
      </div>
    </Modal>
  );
}

function Consola({ srv, s }: { srv: ServidoresLocales; s: ServidorLocal }) {
  const [log, setLog] = useState("");
  const [texto, setTexto] = useState("");
  const [historial, setHistorial] = useState<string[]>([]);
  const [indice, setIndice] = useState(-1);
  const caja = useRef<HTMLPreElement>(null);
  const pegado = useRef(true);
  useEffect(() => {
    let vivo = true;
    void srv.log(s.id).then((l) => vivo && setLog(sinAnsi(l)));
    const off = srv.alSalida((id, t) => {
      if (id === s.id) setLog((l) => (l + sinAnsi(t)).slice(-200_000));
    });
    return () => {
      vivo = false;
      off();
    };
  }, [srv, s.id]);
  useEffect(() => {
    if (pegado.current && caja.current) caja.current.scrollTop = caja.current.scrollHeight;
  }, [log]);
  const enviar = async (c: string) => {
    if (!c.trim()) return;
    try {
      await srv.comando(s.id, c.trim());
      setHistorial((h) => [c.trim(), ...h.filter((x) => x !== c.trim())].slice(0, 50));
      setIndice(-1);
      setTexto("");
    } catch (err) {
      avisarError(err);
    }
  };
  const encendido = s.estado === "encendido" || s.estado === "iniciando";
  return (
    <div className="space-y-2">
      <pre
        ref={caja}
        onScroll={(e) => {
          const t = e.currentTarget;
          pegado.current = t.scrollHeight - t.scrollTop - t.clientHeight < 40;
        }}
        className="h-[50vh] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-black p-3 font-mono text-xs text-green-300"
      >
        {log || "La consola aparece aquí cuando enciendes el servidor."}
      </pre>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <Entrada
          className="font-mono text-xs"
          disabled={!encendido}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && historial.length) {
              e.preventDefault();
              const i = Math.min(indice + 1, historial.length - 1);
              setIndice(i);
              setTexto(historial[i]!);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const i = indice - 1;
              setIndice(Math.max(i, -1));
              setTexto(i >= 0 ? historial[i]! : "");
            }
          }}
          placeholder={encendido ? "Comando (sin /): op TuNombre, list, say hola…" : "Enciende el servidor para escribir comandos"}
        />
        <Boton type="submit" tamano="icono" icono={Send} aria-label="Enviar" disabled={!encendido} />
      </form>
      {s.tipo !== "personalizado" ? (
        <div className="flex flex-wrap gap-1">
          {["list", "save-all", "time set day", "weather clear", "difficulty normal"].map((c) => (
            <button key={c} type="button" disabled={!encendido} onClick={() => void enviar(c)} className="rounded-lg border border-borde px-2 py-1 font-mono text-[11px] text-tenue hover:text-texto disabled:opacity-40">
              {c}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const PROPIEDADES: { clave: string; etiqueta: string; opciones?: string[]; ayuda?: string }[] = [
  { clave: "motd", etiqueta: "Mensaje en la lista de servidores (MOTD)" },
  { clave: "max-players", etiqueta: "Jugadores máximos" },
  { clave: "gamemode", etiqueta: "Modo de juego", opciones: ["survival", "creative", "adventure", "spectator"] },
  { clave: "difficulty", etiqueta: "Dificultad", opciones: ["peaceful", "easy", "normal", "hard"] },
  { clave: "pvp", etiqueta: "PvP (pelear entre jugadores)", opciones: ["true", "false"] },
  { clave: "online-mode", etiqueta: "Solo cuentas originales (premium)", opciones: ["true", "false"], ayuda: "false deja entrar cuentas no premium (menos seguro)." },
  { clave: "white-list", etiqueta: "Lista blanca (solo invitados)", opciones: ["false", "true"] },
  { clave: "view-distance", etiqueta: "Distancia de visión (chunks)" },
  { clave: "spawn-protection", etiqueta: "Protección del spawn (bloques)" },
  { clave: "level-seed", etiqueta: "Semilla del mundo (solo mundo nuevo)" },
];

function Ajustes({ srv, s, alCambio }: { srv: ServidoresLocales; s: ServidorLocal; alCambio: (s: ServidorLocal) => void }) {
  const [nombre, setNombre] = useState(s.nombre);
  const [ram, setRam] = useState(s.ramMb);
  const [puerto, setPuerto] = useState(s.puerto);
  const props = useQuery({ queryKey: ["host-local", "props", s.id], queryFn: () => srv.propiedades(s.id), enabled: s.tipo !== "personalizado" && s.tipo !== "velocity" });
  const [cambios, setCambios] = useState<Record<string, string>>({});
  const guardar = useMutation({
    mutationFn: async () => {
      const nuevo = await srv.actualizar(s.id, { nombre, ramMb: ram, puerto });
      if (Object.keys(cambios).length) await srv.guardarPropiedades(s.id, cambios);
      return nuevo;
    },
    onSuccess: (n) => {
      alCambio(n);
      setCambios({});
      void props.refetch();
      avisar(s.estado === "detenido" ? "Guardado" : "Guardado: se aplica al reiniciar el servidor");
    },
    onError: avisarError,
  });
  const valor = (k: string) => cambios[k] ?? props.data?.[k] ?? "";
  const conocidas = new Set(PROPIEDADES.map((p) => p.clave));
  const otras = Object.keys({ ...props.data, ...cambios })
    .filter((k) => !conocidas.has(k))
    .sort();
  const [nueva, setNueva] = useState({ clave: "", valor: "" });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo etiqueta="Nombre">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta={`RAM: ${(ram / 1024).toFixed(1)} GB`}>
          <input type="range" min={1024} max={16384} step={512} value={ram} onChange={(e) => setRam(Number(e.target.value))} className="w-full accent-acento" />
        </Campo>
        <Campo etiqueta="Puerto">
          <Entrada type="number" value={puerto} onChange={(e) => setPuerto(Number(e.target.value))} />
        </Campo>
      </div>
      {s.tipo === "velocity" ? <p className="text-sm text-tenue">Velocity se configura en velocity.toml (pestaña Archivos): ahí pones tus servidores (lobby, survival…).</p> : null}
      {s.tipo !== "personalizado" && s.tipo !== "velocity" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROPIEDADES.map((p) => (
            <Campo key={p.clave} etiqueta={p.etiqueta}>
              {p.opciones ? (
                <Selector value={valor(p.clave) || p.opciones[0]} onChange={(e) => setCambios({ ...cambios, [p.clave]: e.target.value })}>
                  {p.opciones.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Selector>
              ) : (
                <Entrada value={valor(p.clave)} onChange={(e) => setCambios({ ...cambios, [p.clave]: e.target.value })} />
              )}
              {p.ayuda ? <p className="mt-1 text-[11px] text-tenue">{p.ayuda}</p> : null}
            </Campo>
          ))}
        </div>
      ) : null}
      {s.tipo !== "personalizado" && s.tipo !== "velocity" && props.data ? (
        <details className="rounded-xl border border-borde p-3">
          <summary className="cursor-pointer text-sm font-medium">Todos los ajustes de server.properties ({otras.length + PROPIEDADES.length})</summary>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {otras.map((k) => {
              const v = valor(k);
              const booleano = v === "true" || v === "false";
              return (
                <label key={k} className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="w-44 shrink-0 truncate font-mono" title={k}>
                    {k}
                  </span>
                  {booleano ? (
                    <Selector className="min-w-0 flex-1" value={v} onChange={(e) => setCambios({ ...cambios, [k]: e.target.value })}>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </Selector>
                  ) : (
                    <Entrada className="min-w-0 flex-1" value={v} maxLength={200} onChange={(e) => setCambios({ ...cambios, [k]: e.target.value })} />
                  )}
                </label>
              );
            })}
          </div>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const clave = nueva.clave.trim().toLowerCase();
              if (!/^[a-z0-9.-]{1,60}$/.test(clave)) return avisarError(new Error("La clave solo lleva letras, números, puntos y guiones"));
              setCambios({ ...cambios, [clave]: nueva.valor });
              setNueva({ clave: "", valor: "" });
            }}
          >
            <Entrada className="w-48" value={nueva.clave} onChange={(e) => setNueva({ ...nueva, clave: e.target.value })} placeholder="nuevo-ajuste" />
            <Entrada className="min-w-0 flex-1" value={nueva.valor} onChange={(e) => setNueva({ ...nueva, valor: e.target.value })} placeholder="valor" />
            <Boton type="submit" tamano="sm">
              Agregar
            </Boton>
          </form>
          <p className="mt-2 text-[11px] text-tenue">Los cambios se escriben en server.properties al tocar «Guardar ajustes» y se aplican al reiniciar.</p>
        </details>
      ) : null}
      <Boton variante="primario" cargando={guardar.isPending} onClick={() => guardar.mutate()}>
        Guardar ajustes
      </Boton>
    </div>
  );
}

function Mods({ srv, s }: { srv: ServidoresLocales; s: ServidorLocal }) {
  const [fuente, setFuente] = useState<"modrinth" | "curseforge">("modrinth");
  const [texto, setTexto] = useState("");
  const [buscado, setBuscado] = useState("");
  const [progreso] = useProgreso(srv);
  const conPacks = ["fabric", "quilt", "forge", "neoforge"].includes(s.tipo) && Boolean(srv.modpackInstalar);
  const disponibles: (ClaseAddon | "modpacks")[] = [...clasesDe(s), ...(conPacks ? (["modpacks"] as const) : [])];
  const [clase, setClaseEstado] = useState<ClaseAddon | "modpacks">(disponibles[0] ?? "mods");
  const [pagina, setPagina] = useState(0);
  const setClase = (c: ClaseAddon | "modpacks") => {
    setClaseEstado(c);
    setPagina(0);
    if (c === "modpacks") setFuente("modrinth");
  };
  const mc = mcDe(s);
  // CurseForge: plugins de Bukkit, o mods del cargador del servidor (Folia y Velocity no están ahí).
  const cargador = s.cargadorMods ?? (["fabric", "quilt", "forge", "neoforge"].includes(s.tipo) ? s.tipo : null);
  const esPack = clase === "modpacks";
  const claseAddon: ClaseAddon = esPack ? "mods" : clase;
  const tipoCf = esPack ? null : clase === "plugins" ? (["folia", "velocity"].includes(s.tipo) ? null : "paper") : cargador;
  const instalados = useQuery({ queryKey: ["host-local", "addons", s.id, claseAddon], queryFn: () => srv.addons(s.id, claseAddon) });
  const resultados = useQuery({
    queryKey: ["host-local", "buscar", s.id, clase, fuente, buscado, pagina],
    queryFn: () =>
      fuente === "modrinth"
        ? srv.modrinthBuscar(s.id, buscado, clase, pagina)
        : api<Addon[]>(`/api/hostlocal/curseforge/buscar?tipo=${tipoCf}&version=${encodeURIComponent(mc)}&q=${encodeURIComponent(buscado)}&pagina=${pagina}`),
    enabled: fuente === "modrinth" || !!tipoCf,
  });
  const instalar = useMutation({
    mutationFn: async (a: Addon) => {
      if (esPack) {
        if (s.estado !== "detenido") throw new Error("Apaga el servidor antes de instalar el modpack");
        if (!(await confirmar({ titulo: `Instalar ${a.titulo}`, mensaje: "Se bajan todos sus mods y archivos dentro de este servidor; los que tengan el mismo nombre se reemplazan. Te recomendamos usarlo en un servidor nuevo." }))) {
          throw new Error("Cancelado");
        }
        const r = await srv.modpackInstalar!(s.id, a.id);
        return `${r.nombre} (${r.archivos} archivos)`;
      }
      if (fuente === "modrinth") return srv.modrinthInstalar(s.id, a.id, claseAddon);
      const f = await api<{ url: string; nombre: string }>(`/api/hostlocal/curseforge/archivo?tipo=${tipoCf}&version=${encodeURIComponent(mc)}&modId=${a.id}`);
      return srv.instalarDesdeUrl(s.id, f.url, f.nombre, claseAddon);
    },
    onSuccess: (nombre) => {
      avisar(`Instalado: ${nombre}. Reinicia el servidor para usarlo.`);
      void instalados.refetch();
    },
    onError: avisarError,
  });
  const palabra = esPack ? "modpacks" : clase;
  return (
    <div className="space-y-4">
      {disponibles.length > 1 ? (
        <Pestanas
          valor={clase}
          alCambiar={(c) => setClase(c)}
          opciones={disponibles.map((c) => ({ id: c, texto: c === "mods" ? "Mods" : c === "plugins" ? "Plugins" : "Modpacks" }))}
        />
      ) : null}
      {esPack ? (
        <p className="rounded-xl bg-fondo p-3 text-xs text-tenue">
          Un modpack trae muchos mods y su configuración. Se instala dentro de este servidor (apágalo antes) y debe ser de la misma versión de Minecraft. Lo más limpio es crear un servidor nuevo para cada modpack.
        </p>
      ) : null}
      <Tarjeta titulo={`Tus ${esPack ? "mods" : palabra} (${instalados.data?.length ?? 0})`} icono={Package}>
        {!instalados.data?.length ? <p className="text-sm text-tenue">Todavía no tienes {palabra}.</p> : null}
        <ul className="divide-y divide-borde">
          {instalados.data?.map((a) => (
            <li key={a.nombre} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{a.nombre}</span>
              <span className="text-xs text-tenue">{Math.max(1, Math.round(a.tamano / 1024))} KB</span>
              <Boton
                tamano="icono"
                variante="fantasma"
                icono={Trash2}
                aria-label={`Quitar ${a.nombre}`}
                onClick={async () => {
                  if (await confirmar({ titulo: "Quitar", mensaje: `${a.nombre} se va a la Papelera.` })) {
                    await srv.quitarAddon(s.id, a.nombre, claseAddon).catch(avisarError);
                    void instalados.refetch();
                  }
                }}
              />
            </li>
          ))}
        </ul>
      </Tarjeta>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBuscado(texto.trim());
          setPagina(0);
        }}
      >
        <Selector className="w-auto" value={fuente} onChange={(e) => setFuente(e.target.value as typeof fuente)}>
          <option value="modrinth">Modrinth</option>
          {tipoCf && !esPack ? <option value="curseforge">CurseForge</option> : null}
        </Selector>
        <Entrada className="min-w-0 flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={mc ? `Buscar ${palabra} para ${mc}…` : `Buscar ${palabra}…`} />
        <Boton type="submit" icono={Search}>
          Buscar
        </Boton>
      </form>
      {progreso ? <Cargando texto={progreso} /> : null}
      <ErrorCaja error={resultados.error} />
      {resultados.isLoading ? <Cargando /> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {resultados.data?.map((a) => (
          <div key={a.id} className="flex gap-3 rounded-xl border border-borde p-3">
            {a.icono ? <img src={a.icono} alt="" className="h-12 w-12 shrink-0 rounded-lg" /> : <div className="h-12 w-12 shrink-0 rounded-lg bg-fondo" />}
            <div className="min-w-0 flex-1">
              <button type="button" className="truncate text-left text-sm font-medium hover:underline" onClick={() => abrirExterno(a.url)}>
                {a.titulo}
              </button>
              <p className="line-clamp-2 text-xs text-tenue">{a.descripcion}</p>
              <p className="text-[11px] text-tenue">
                {a.autor} · {a.descargas.toLocaleString("es-MX")} descargas
              </p>
            </div>
            <Boton tamano="sm" icono={Download} disabled={instalar.isPending} onClick={() => instalar.mutate(a)}>
              Instalar
            </Boton>
          </div>
        ))}
      </div>
      {resultados.data && (pagina > 0 || resultados.data.length >= 24) ? (
        <div className="flex items-center justify-center gap-1">
          <Boton tamano="sm" variante="secundario" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </Boton>
          {Array.from({ length: 5 }, (_, i) => Math.max(0, pagina - 2) + i)
            .filter((n) => n <= pagina || resultados.data.length >= 24)
            .filter((n) => n <= pagina + (resultados.data.length >= 24 ? 2 : 0))
            .map((n) => (
              <Boton key={n} tamano="sm" variante={n === pagina ? "primario" : "fantasma"} onClick={() => setPagina(n)}>
                {n + 1}
              </Boton>
            ))}
          <Boton tamano="sm" variante="secundario" disabled={resultados.data.length < 24} onClick={() => setPagina(pagina + 1)}>
            Siguiente
          </Boton>
        </div>
      ) : null}
      <p className="text-xs text-tenue">Solo salen los compatibles con {TIPOS[s.tipo].nombre} {textoVersion(s.version)}. CurseForge necesita su clave (Ajustes → Servicios y claves).</p>
    </div>
  );
}

function Compartir({ srv, s }: { srv: ServidoresLocales; s: ServidorLocal }) {
  const [playit, setPlayit] = useState<string | null>(null);
  const [progreso] = useProgreso(srv);
  const [cargando, setCargando] = useState(false);
  const registrar = useRef(() => undefined).current;
  return (
    <div className="space-y-4">
      <Tarjeta titulo="En tu casa (misma red)" icono={Users}>
        <p className="text-sm">
          Tú: <code className="rounded bg-fondo px-1">localhost:{s.puerto}</code>
          {s.ip ? (
            <>
              {" "}· Otros en tu Wi-Fi: <code className="rounded bg-fondo px-1">{s.ip}:{s.puerto}</code>
            </>
          ) : null}
        </p>
        <p className="mt-2 text-xs text-tenue">Si Windows pregunta por el Firewall al encender, toca «Permitir» en redes privadas.</p>
      </Tarjeta>
      <Tarjeta titulo="Amigos por internet (playit.gg, gratis)" icono={Globe}>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Toca «Abrir playit.gg». La primera vez muestra un enlace para entrar o crear tu cuenta: ábrelo.</li>
          <li>En playit.gg crea un túnel «Minecraft Java» apuntando a <code>127.0.0.1:{s.puerto}</code>.</li>
          <li>Te da una dirección (ej. algo.joinmc.link): esa la compartes con tus amigos.</li>
        </ol>
        <Boton
          className="mt-3"
          variante="primario"
          icono={Share2}
          cargando={cargando}
          onClick={async () => {
            setCargando(true);
            try {
              setPlayit(await srv.playit());
            } catch (err) {
              avisarError(err);
            } finally {
              setCargando(false);
            }
          }}
        >
          {cargando ? (progreso ?? "Preparando…") : "Abrir playit.gg"}
        </Boton>
        {playit ? (
          <div className="mt-3 h-72 overflow-hidden rounded-xl border border-borde">
            <ConsolaLocal clave={`playit-${s.id}`} shell="powershell" visible registrar={registrar} alId={() => undefined} cwd={s.carpeta} comando={`& "${playit}"`} />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-tenue">playit.gg funciona mientras esta ventana siga abierta. Para cerrarlo usa Ctrl+C en su consola.</p>
      </Tarjeta>
    </div>
  );
}

function PasarAVps({ srv, s }: { srv: ServidoresLocales; s: ServidorLocal }) {
  const puede = usePuede("pterodactyl", "escritura");
  const servidores = useQuery({ queryKey: ["ptero", "servidores"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/ptero/servidores"), enabled: puede, retry: false });
  const [destino, setDestino] = useState("");
  const [soloMundo, setSoloMundo] = useState(true);
  const [progreso, setProgreso] = useProgreso(srv);
  const pasar = useMutation({
    mutationFn: async () => {
      const id = destino || servidores.data?.[0]?.id;
      if (!id) throw new Error("Elige el servidor de tu VPS");
      const { zip, tamano } = await srv.empaquetar(s.id, soloMundo);
      setProgreso(`Comprimido (${(tamano / 1024 / 1024).toFixed(0)} MB). Pidiendo permiso de subida…`);
      const { url } = await api<{ url: string }>(`/api/ptero/servidores/${id}/subida`);
      const { archivo } = await srv.subirZip(zip, url);
      setProgreso("Descomprimiendo en tu VPS…");
      await api(`/api/ptero/servidores/${id}/descomprimir`, { cuerpo: { archivo } });
      setProgreso(null);
    },
    onSuccess: () => avisar("¡Listo! Ya está en tu VPS. Enciéndelo desde Pterodactyl."),
    onError: (e) => {
      setProgreso(null);
      avisarError(e);
    },
  });
  if (!puede) return <Vacio texto="Necesitas permiso de Pterodactyl para subir servidores a tu VPS." />;
  return (
    <Tarjeta titulo="Pasar a mi VPS (Pterodactyl)" icono={CloudUpload}>
      <div className="space-y-3">
        <ErrorCaja error={servidores.error} />
        <Campo etiqueta="Servidor destino en tu panel">
          <Selector value={destino || servidores.data?.[0]?.id || ""} onChange={(e) => setDestino(e.target.value)}>
            {(servidores.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloMundo} onChange={(e) => setSoloMundo(e.target.checked)} />
          Solo el mundo (recomendado; el servidor de destino ya tiene su propio Paper/Fabric)
        </label>
        <p className="text-xs text-tenue">Apaga este servidor y el de destino antes. Lo que subas reemplaza los archivos con el mismo nombre. Si pesa más de 100 MB, sube el límite «upload_limit» de Wings.</p>
        <Boton
          variante="primario"
          icono={CloudUpload}
          cargando={pasar.isPending}
          disabled={s.estado !== "detenido"}
          onClick={async () => {
            if (await confirmar({ titulo: "Subir a tu VPS", mensaje: "Se reemplazarán los archivos con el mismo nombre en el servidor de destino.", peligroso: true, textoExacto: s.nombre, boton: "Subir" })) pasar.mutate();
          }}
        >
          {pasar.isPending ? (progreso ?? "Trabajando…") : s.estado !== "detenido" ? "Apaga el servidor primero" : "Subir a mi VPS"}
        </Boton>
      </div>
    </Tarjeta>
  );
}

function Detalle({ srv, s, alCambio, alBorrar }: { srv: ServidoresLocales; s: ServidorLocal; alCambio: (s: ServidorLocal) => void; alBorrar: () => void }) {
  const navegar = useNavigate();
  const fs = escritorio()?.archivosLocales;
  const [pestana, setPestana] = useState<"consola" | "ajustes" | "mods" | "archivos" | "compartir" | "vps">("consola");
  const [progreso] = useProgreso(srv);
  const accion = async (fn: () => Promise<unknown>) => {
    try {
      const r = await fn();
      if (r && typeof r === "object" && "id" in r) alCambio(r as ServidorLocal);
    } catch (err) {
      avisarError(err);
    }
  };
  const clasesServidor = clasesDe(s);
  const tieneMods = clasesServidor.length > 0;
  const minutos = s.desde && s.estado === "encendido" ? Math.floor((Date.now() - s.desde) / 60_000) : null;
  return (
    <div className="space-y-4">
      <Tarjeta
        titulo={s.nombre}
        icono={Boxes}
        acciones={<Insignia tono={ESTADO[s.estado].tono}>{ESTADO[s.estado].texto}</Insignia>}
      >
        <div className="flex flex-wrap items-center gap-2">
          {s.estado === "detenido" ? (
            <Boton variante="primario" icono={Play} onClick={() => void accion(() => srv.iniciar(s.id))}>
              Encender
            </Boton>
          ) : (
            <Boton icono={Power} disabled={s.estado === "deteniendo"} onClick={() => void accion(() => srv.detener(s.id))}>
              {s.estado === "deteniendo" ? "Apagando…" : "Apagar"}
            </Boton>
          )}
          {s.estado === "deteniendo" ? (
            <Boton variante="fantasma" onClick={() => void accion(() => srv.forzar(s.id))}>
              Forzar
            </Boton>
          ) : null}
          <span className="text-xs text-tenue">
            {TIPOS[s.tipo].nombre} {s.version !== "-" ? s.version : ""} · {(s.ramMb / 1024).toFixed(1)} GB · puerto {s.puerto}
            {minutos !== null ? ` · encendido hace ${minutos} min` : ""}
            {s.jugadores.length ? ` · ${s.jugadores.length} conectado(s): ${s.jugadores.join(", ")}` : ""}
          </span>
        </div>
        {progreso ? <p className="mt-2 text-xs text-tenue">{progreso}</p> : null}
      </Tarjeta>
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "consola", texto: "Consola" },
          { id: "ajustes", texto: "Ajustes" },
          ...(tieneMods ? [{ id: "mods" as const, texto: clasesServidor.length > 1 ? "Mods y plugins" : clasesServidor[0] === "plugins" ? "Plugins" : "Mods" }] : []),
          { id: "archivos", texto: "Archivos" },
          ...(s.tipo !== "personalizado" ? [{ id: "compartir" as const, texto: "Compartir" }, { id: "vps" as const, texto: "Pasar a mi VPS" }] : []),
        ]}
      />
      {pestana === "consola" ? <Consola srv={srv} s={s} /> : null}
      {pestana === "ajustes" ? <Ajustes srv={srv} s={s} alCambio={alCambio} /> : null}
      {pestana === "mods" ? <Mods srv={srv} s={s} /> : null}
      {pestana === "compartir" ? <Compartir srv={srv} s={s} /> : null}
      {pestana === "vps" ? <PasarAVps srv={srv} s={s} /> : null}
      {pestana === "archivos" ? (
        <Tarjeta titulo="Archivos del servidor" icono={FolderOpen}>
          <p className="mb-3 break-all text-xs text-tenue">{s.carpeta}</p>
          <div className="flex flex-wrap gap-2">
            <Boton variante="primario" icono={Code2} onClick={() => navegar(`/programacion/codigo?carpeta=${encodeURIComponent(s.carpeta)}`)}>
              Editar en Código
            </Boton>
            <Boton icono={ExternalLink} onClick={() => void srv.abrirCarpeta(s.id)}>
              Abrir en el Explorador
            </Boton>
            {fs ? (
              <Boton
                icono={FolderPlus}
                onClick={async () => {
                  try {
                    const r = await fs.importar(s.carpeta);
                    if (r.length) avisar(`Copiados ${r.length} archivo(s)`);
                  } catch (err) {
                    avisarError(err);
                  }
                }}
              >
                Agregar archivos
              </Boton>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-tenue">En Código puedes editar configs (server.properties, plugins/…/config.yml), crear, renombrar, comprimir y mandar a la papelera.</p>
        </Tarjeta>
      ) : null}
      <Boton
        variante="fantasma"
        icono={Trash2}
        className="text-peligro"
        onClick={async () => {
          if (await confirmar({ titulo: "Borrar servidor", mensaje: s.tipo === "personalizado" ? "Se quita de la lista (tu carpeta no se toca)." : "Su carpeta (mundo incluido) se va a la Papelera de Windows.", peligroso: true, textoExacto: s.nombre, boton: "Borrar" })) {
            await srv.borrar(s.id).catch(avisarError);
            alBorrar();
          }
        }}
      >
        Borrar servidor
      </Boton>
    </div>
  );
}

interface EdicionRemota {
  id: string;
  servidorId: string;
  cambios: { nombre?: string; ramMb?: number; puerto?: number; propiedades?: Record<string, string> };
  creada: string;
}
interface ServidorRemoto {
  id: string;
  nombre: string;
  tipo: string;
  version: string;
  mc?: string;
  ramMb: number;
  puerto: number;
  estado: "detenido" | "iniciando" | "encendido" | "deteniendo";
  jugadores: string[];
  propiedades?: Record<string, string>;
}

// ---------------------------------------------------------------- celular: ver y editar (no encender)

function EditarRemoto({ s, pendientes }: { s: ServidorRemoto; pendientes: EdicionRemota[] }) {
  const [nombre, setNombre] = useState(s.nombre);
  const [ram, setRam] = useState(s.ramMb);
  const [puerto, setPuerto] = useState(s.puerto);
  const [props, setProps] = useState<Record<string, string>>({});
  const esJuego = s.tipo !== "personalizado" && s.tipo !== "velocity";
  const valor = (k: string) => props[k] ?? s.propiedades?.[k] ?? "";
  const cambios: EdicionRemota["cambios"] = {
    ...(nombre.trim() && nombre.trim() !== s.nombre ? { nombre: nombre.trim() } : {}),
    ...(ram !== s.ramMb ? { ramMb: ram } : {}),
    ...(puerto !== s.puerto ? { puerto } : {}),
    ...(Object.keys(props).length ? { propiedades: props } : {}),
  };
  const guardar = useMutation({
    mutationFn: () => api("/api/hostlocal/ediciones", { cuerpo: { servidorId: s.id, cambios } }),
    onSuccess: () => {
      avisar("Cambios enviados. Se aplican cuando tu PC tenga Mi Setup abierto.");
      setProps({});
      void queryClient.invalidateQueries({ queryKey: ["host-local", "remoto"] });
    },
    onError: avisarError,
  });
  const esperando = pendientes.filter((p) => p.servidorId === s.id).length;
  return (
    <div className="space-y-4">
      {esperando ? <p className="rounded-xl bg-amber-500/10 p-2 text-xs">Hay {esperando} cambio(s) esperando a que tu PC abra Mi Setup.</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo etiqueta="Nombre">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} />
        </Campo>
        <Campo etiqueta={`RAM: ${(ram / 1024).toFixed(1)} GB`}>
          <input type="range" min={1024} max={16384} step={512} value={Math.min(Math.max(ram, 1024), 16384)} onChange={(e) => setRam(Number(e.target.value))} className="w-full accent-acento" />
        </Campo>
        <Campo etiqueta="Puerto">
          <Entrada type="number" value={puerto} onChange={(e) => setPuerto(Number(e.target.value))} />
        </Campo>
      </div>
      {esJuego ? (
        s.propiedades && Object.keys(s.propiedades).length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROPIEDADES.map((p) => (
              <Campo key={p.clave} etiqueta={p.etiqueta}>
                {p.opciones ? (
                  <Selector value={valor(p.clave) || p.opciones[0]} onChange={(e) => setProps({ ...props, [p.clave]: e.target.value })}>
                    {p.opciones.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Selector>
                ) : (
                  <Entrada value={valor(p.clave)} onChange={(e) => setProps({ ...props, [p.clave]: e.target.value })} />
                )}
              </Campo>
            ))}
          </div>
        ) : (
          <p className="text-xs text-tenue">Las opciones del juego (modo, dificultad, PvP…) aparecen cuando tu PC sincroniza este servidor.</p>
        )
      ) : null}
      <Boton variante="primario" cargando={guardar.isPending} disabled={Object.keys(cambios).length === 0} onClick={() => guardar.mutate()}>
        Enviar cambios a mi PC
      </Boton>
    </div>
  );
}

function PanelRemoto() {
  const q = useQuery({
    queryKey: ["host-local", "remoto"],
    queryFn: () => api<{ servidores: ServidorRemoto[]; actualizado: string | null; pendientes: EdicionRemota[] }>("/api/hostlocal/servidores"),
    refetchInterval: 20_000,
  });
  const [elegido, setElegido] = useState<string | null>(null);
  const lista = q.data?.servidores ?? [];
  const actual = lista.find((x) => x.id === elegido) ?? lista[0] ?? null;
  return (
    <div className="space-y-4">
      <div className="rounded-tarjeta border border-borde bg-superficie p-3 text-sm">
        <p className="font-medium">Tus servidores viven en tu PC</p>
        <p className="mt-1 text-xs text-tenue">
          Desde aquí ves cómo van y cambias su configuración; los cambios se aplican cuando tu PC tenga Mi Setup abierto. Para encenderlos o apagarlos usa la app de Windows.
          {q.data?.actualizado ? ` Última vez que tu PC avisó: ${haceCuanto(q.data.actualizado)}.` : ""}
        </p>
      </div>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data && !lista.length ? <Vacio icono={Boxes} texto="Abre «Servidores en mi PC» en la app de Windows una vez para que tus servidores aparezcan aquí." /> : null}
      {lista.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-1">
            {lista.map((s) => (
              <button key={s.id} type="button" onClick={() => setElegido(s.id)} className={cx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm", actual?.id === s.id ? "bg-tarjeta" : "hover:bg-tarjeta")}>
                <span className={cx("h-2 w-2 shrink-0 rounded-full", s.estado === "encendido" ? "bg-ok" : s.estado === "detenido" ? "bg-tenue" : "bg-aviso")} />
                <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
                <span className="shrink-0 text-[11px] text-tenue">{s.estado === "encendido" ? `${s.jugadores.length} jugando` : "Apagado"}</span>
              </button>
            ))}
          </div>
          {actual ? (
            <Tarjeta titulo={actual.nombre} icono={Boxes}>
              <p className="mb-3 text-xs text-tenue">
                {TIPOS[actual.tipo as TipoServidor]?.nombre ?? actual.tipo} {textoVersion(actual.version)} · puerto {actual.puerto}
                {actual.jugadores.length ? ` · jugando: ${actual.jugadores.join(", ")}` : ""}
              </p>
              <EditarRemoto key={`${actual.id}-${q.data?.actualizado ?? ""}`} s={actual} pendientes={q.data?.pendientes ?? []} />
            </Tarjeta>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Panel({ srv }: { srv: ServidoresLocales }) {
  const lista = useQuery({ queryKey: ["host-local", "lista"], queryFn: () => srv.lista() });
  const [elegido, setElegido] = useState<string | null>(null);
  const [crear, setCrear] = useState(false);
  const [servidores, setServidores] = useState<ServidorLocal[]>([]);
  useEffect(() => {
    if (lista.data) setServidores(lista.data);
  }, [lista.data]);
  useEffect(() => srv.alEstado((s) => setServidores((l) => l.map((x) => (x.id === s.id ? s : x)))), [srv]);
  // Sube la lista para verla desde el celular y aplica los cambios que se hicieron desde allá.
  useEffect(() => {
    let vivo = true;
    const sincronizar = async () => {
      try {
        const actuales = await srv.lista();
        const completos = await Promise.all(
          actuales.map(async (x) => {
            const propiedades = x.tipo !== "personalizado" && x.tipo !== "velocity" ? await srv.propiedades(x.id).catch(() => ({})) : {};
            return { id: x.id, nombre: x.nombre, tipo: x.tipo, version: x.version, ...(x.mc ? { mc: x.mc } : {}), ramMb: x.ramMb, puerto: x.puerto, estado: x.estado, jugadores: x.jugadores, propiedades };
          }),
        );
        const { pendientes } = await api<{ pendientes: EdicionRemota[] }>("/api/hostlocal/sincronizar", { metodo: "PUT", cuerpo: { servidores: completos } });
        if (!vivo || !pendientes.length) return;
        const hechas: string[] = [];
        for (const e of pendientes) {
          try {
            const { propiedades, ...basicos } = e.cambios;
            if (Object.keys(basicos).length) await srv.actualizar(e.servidorId, basicos);
            if (propiedades && Object.keys(propiedades).length) await srv.guardarPropiedades(e.servidorId, propiedades);
          } catch (err) {
            avisarError(err);
          }
          hechas.push(e.id);
        }
        await api("/api/hostlocal/ediciones/aplicadas", { cuerpo: { ids: hechas } });
        avisar(`Se aplicaron ${hechas.length} cambio(s) hechos desde el celular. Si el servidor está encendido, reinícialo.`);
        void lista.refetch();
      } catch {
        /* sin conexión con Mi Setup: se reintenta */
      }
    };
    void sincronizar();
    const t = setInterval(() => void sincronizar(), 20_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [srv]);
  const actual = servidores.find((x) => x.id === elegido) ?? servidores[0] ?? null;
  const cambiar = (s: ServidorLocal) => setServidores((l) => (l.some((x) => x.id === s.id) ? l.map((x) => (x.id === s.id ? s : x)) : [...l, s]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Boton variante="primario" icono={Plus} onClick={() => setCrear(true)}>
          Crear servidor
        </Boton>
      </div>
      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      {lista.data && !servidores.length ? <Vacio icono={Boxes} texto="Crea tu primer servidor: Minecraft con plugins o mods en un par de minutos, sin instalar nada." /> : null}
      {servidores.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-1">
            {servidores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setElegido(s.id)}
                className={cx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm", actual?.id === s.id ? "bg-tarjeta" : "hover:bg-tarjeta")}
              >
                <span className={cx("h-2 w-2 shrink-0 rounded-full", s.estado === "encendido" ? "bg-ok" : s.estado === "detenido" ? "bg-tenue" : "bg-aviso")} />
                <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
                <span className="shrink-0 text-[11px] text-tenue">{s.tipo === "personalizado" ? "Otro" : `${TIPOS[s.tipo]?.nombre ?? s.tipo} ${textoVersion(s.version)}`}</span>
              </button>
            ))}
          </div>
          {actual ? (
            <Detalle
              key={actual.id}
              srv={srv}
              s={actual}
              alCambio={cambiar}
              alBorrar={() => {
                setServidores((l) => l.filter((x) => x.id !== actual.id));
                setElegido(null);
              }}
            />
          ) : null}
        </div>
      ) : null}
      {crear ? (
        <Crear
          srv={srv}
          alCerrar={() => setCrear(false)}
          alCrear={(s) => {
            setCrear(false);
            cambiar(s);
            setElegido(s.id);
            avisar("Servidor listo. Tócale Encender.");
          }}
        />
      ) : null}
    </div>
  );
}

export default function HostLocal() {
  const srv = escritorio()?.servidoresLocales ?? null;
  return (
    <div className="space-y-4">
      <Encabezado titulo="Servidores en mi PC" descripcion="Crea servidores de Minecraft (y otros juegos) en tu computadora: consola, mods, plugins y amigos sin abrir puertos." />
      {srv ? (
        <Panel srv={srv} />
      ) : (
        <PanelRemoto />
      )}
    </div>
  );
}
