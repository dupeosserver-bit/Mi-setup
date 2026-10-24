import "@xterm/xterm/css/xterm.css";
import { analizarComando } from "@mi-setup/shared";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ClipboardPaste, Columns2, Copy, ExternalLink, Eye, EyeOff, FolderTree, History, House, KeyRound, Laptop, PanelRight, Plus, Radio, Search, Send, Server, Settings, Sparkles, SquareSplitHorizontal, TerminalSquare, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AreaTexto, Boton, Campo, Cargando, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Selector, Vacio, avisar, avisarError, cx } from "../components/ui";
import { Desbloqueo } from "../components/Desbloqueo";
import { useAsistente } from "../components/Asistente";
import { BarraTeclas, type PanelBarra } from "../components/terminal/BarraTeclas";
import { Paleta, type OpcionPaleta } from "../components/terminal/Paleta";
import { normalizarNombre, SECCIONES, VistaHosts, type ComandoGuardado, type EntradaHistorial, type SeccionHosts } from "../components/terminal/Hosts";
import { api, ApiError } from "../lib/api";
import { useElementos } from "../lib/boveda/estado";
import { codigoTotp, type CuentaTotp } from "../lib/boveda/totp";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { useAcostado, useForma, useModoPagina, useTactil } from "../lib/marco";
import { abrirExterno, escritorio, esMovil } from "../lib/plataforma";
import { escribirPortapapeles, leerPortapapeles } from "../lib/portapapeles";
import { opcionesTerminal, usePreferencias } from "../lib/preferencias";
import { pedirReauth } from "../lib/reauth";
import { aplicarModificadores, type Modificadores } from "../lib/teclasTerminal";
import { tiempoReal } from "../lib/tiempo-real";
import { useServidores, type Servidor } from "../lib/vps";
import { atajosPortapapeles, enlacesTerminal, EVENTO_ENLACE, EVENTO_SELECCION, seleccionTactil, ConsolaLocal, cierresLocales } from "../components/ConsolaLocal";

function base64aBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function anotar(servidorId: string, comando: string) {
  const c = comando.trim();
  if (!c) return;
  void api("/api/vps/historial", { metodo: "POST", cuerpo: { servidorId, comando: c } })
    .then(() => queryClient.invalidateQueries({ queryKey: ["vps", "historial"] }))
    .catch(() => undefined);
}

const cierresExplicitos = new Set<string>();

type Enviar = (texto: string, enfocar?: boolean) => void;

function Consola({
  clave,
  servidor,
  sesionInicial,
  visible,
  registrar,
  alId,
  inicial,
  alTeclear,
  modificar,
}: {
  clave: string;
  servidor: Servidor;
  /** Sesión que ya existe en el servidor (se retoma en vez de abrir otra). */
  sesionInicial?: string;
  visible: boolean;
  /** Entrega al padre una función para escribir en esta sesión (barra de comandos). */
  registrar: (enviar: ((texto: string, enfocar?: boolean) => void) | null) => void;
  alId: (id: string) => void;
  inicial?: string;
  alTeclear?: (datos: string) => void;
  /** Celular: aplica Ctrl/Alt que quedaron presionados en la barra de teclas a lo que se escribe. */
  modificar?: (datos: string) => string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const modificarRef = useRef(modificar);
  modificarRef.current = modificar;
  const ajuste = useRef<FitAddon | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const prefs = usePreferencias();
  const opciones = opcionesTerminal(prefs);
  const opcionesIniciales = useRef(opciones);
  const teclear = useRef(alTeclear);
  teclear.current = alTeclear;
  const comandoInicial = useRef(inicial);

  useEffect(() => {
    const contenedor = caja.current;
    if (!contenedor) return;
    // En el celular el teclado (Gboard, Samsung…) autocompleta y xterm duplica el texto: xterm solo
    // muestra y se escribe en un cuadro invisible encima (como Termius). Se manda lo que cambió.
    const movil = esMovil() || Boolean(window.matchMedia?.("(pointer: coarse)").matches);
    const term = new Terminal({ ...opcionesIniciales.current, cursorBlink: true, disableStdin: movil });
    terminal.current = term;
    const fit = new FitAddon();
    ajuste.current = fit;
    term.loadAddon(fit);
    term.open(contenedor);
    if (movil) term.textarea?.setAttribute("inputmode", "none");
    const directo = movil ? entradaDirecta(contenedor, clave, (datos) => alDatos(modificarRef.current ? modificarRef.current(datos) : datos)) : null;
    fit.fit();
    const quitarAtajos = atajosPortapapeles(term, contenedor);
    enlacesTerminal(term);
    const quitarSeleccion = movil ? seleccionTactil(term, contenedor) : null;

    const ref = crypto.randomUUID();
    let id: string | null = null;
    let reintento = false;
    const abrir = () => {
      term.writeln(`\x1b[90mConectando a ${servidor.usuario}@${servidor.host}…\x1b[0m`);
      if (!tiempoReal.enviar({ tipo: "terminal.abrir", ref, servidorId: servidor.id, cols: term.cols, rows: term.rows })) {
        term.writeln("\x1b[31mSin conexión en tiempo real. Reintenta en unos segundos.\x1b[0m");
      }
    };
    // Retomar una sesión que sigue viva en el servidor (al volver a Terminal o tras perder la conexión).
    const reanudar = () => {
      if (id) tiempoReal.enviar({ tipo: "terminal.reanudar", id, cols: term.cols, rows: term.rows });
    };
    const offs = [
      tiempoReal.on("terminal.abierta", (m) => {
        if (m.ref !== ref) return;
        id = m.id;
        alId(m.id);
        const primero = comandoInicial.current;
        comandoInicial.current = undefined;
        if (primero) setTimeout(() => id && tiempoReal.enviar({ tipo: "terminal.entrada", id, datos: `${primero}\r` }), 600);
      }),
      tiempoReal.on("terminal.reanudada", (m) => {
        if (m.id === id) term.writeln("\x1b[90m[sesión retomada]\x1b[0m");
      }),
      // El socket se reconectó (cambio de app, sin señal): se vuelve a enganchar la sesión.
      tiempoReal.on("auth.ok", () => reanudar()),
      tiempoReal.on("terminal.datos", (m) => {
        if (m.id === id) term.write(base64aBytes(m.datos));
      }),
      tiempoReal.on("terminal.cerrada", (m) => {
        if (m.id === id) term.writeln(`\r\n\x1b[90m[sesión cerrada${m.motivo ? `: ${m.motivo}` : ""}]\x1b[0m`);
      }),
      tiempoReal.on("error", (m) => {
        if (m.ref !== ref) return;
        if (m.error === "reauth_requerida" && !reintento) {
          reintento = true;
          term.writeln("\x1b[33mRoot requiere confirmar tu identidad…\x1b[0m");
          void pedirReauth("fuerte")
            .then(abrir)
            .catch(() => term.writeln("\x1b[31mCancelado.\x1b[0m"));
          return;
        }
        term.writeln(`\x1b[31m${m.error}\x1b[0m`);
      }),
    ];

    // Historial: se arma la línea que escribes; si usas flechas o Tab no se sabe el texto final y no se guarda.
    let linea = "";
    let fiable = true;
    function alDatos(datos: string) {
      if (id) tiempoReal.enviar({ tipo: "terminal.entrada", id, datos });
      teclear.current?.(datos);
      for (const ch of datos) {
        if (ch === "\r") {
          if (fiable) anotar(servidor.id, linea);
          linea = "";
          fiable = true;
        } else if (ch === "\x7f") linea = linea.slice(0, -1);
        else if (ch === "\x03" || ch === "\x15") {
          linea = "";
          fiable = true;
        } else if (ch === "\x1b" || ch === "\t") fiable = false;
        else if (ch >= " ") linea += ch;
      }
    }
    const entrada = term.onData(alDatos);
    registrar((texto, enfocar = true) => {
      if (id) tiempoReal.enviar({ tipo: "terminal.entrada", id, datos: texto });
      if (enfocar && !movil) term.focus();
    });
    const tamano = term.onResize(({ cols, rows }) => {
      if (id) tiempoReal.enviar({ tipo: "terminal.tamano", id, cols, rows });
    });
    const observador = new ResizeObserver(() => fit.fit());
    observador.observe(contenedor);
    if (sesionInicial) {
      id = sesionInicial;
      reanudar();
    } else abrir();

    return () => {
      registrar(null);
      // Cerrar con la X termina la sesión; cambiar de pantalla solo la suelta (sigue viva 30 min).
      if (id) tiempoReal.enviar(cierresExplicitos.has(clave) ? { tipo: "terminal.cerrar", id } : { tipo: "terminal.soltar", id });
      cierresExplicitos.delete(clave);
      offs.forEach((off) => off());
      quitarAtajos();
      entrada.dispose();
      tamano.dispose();
      observador.disconnect();
      directo?.();
      quitarSeleccion?.();
      term.dispose();
      terminal.current = null;
    };
  }, [servidor.id, servidor.host, servidor.usuario, registrar]);

  // Cambios de tema, fuente o tamaño en Ajustes se aplican sin reconectar.
  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    term.options.theme = opciones.theme;
    term.options.fontFamily = opciones.fontFamily;
    term.options.fontSize = opciones.fontSize;
    ajuste.current?.fit();
  }, [opciones.theme, opciones.fontFamily, opciones.fontSize]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => ajuste.current?.fit());
  }, [visible]);

  return <div ref={caja} className={cx("relative h-full w-full p-1", !visible && "hidden")} style={{ background: opciones.theme.background }} />;
}

/** Al principio del cuadro invisible: así «borrar» con el cuadro vacío también llega a la terminal. */
const RELLENO = "  ";

/**
 * Cuadro invisible sobre la terminal del celular: abre el teclado nativo al tocar la terminal y
 * manda solo lo que cambia (letras nuevas o borradas), aunque el teclado autocorrija.
 * Devuelve la función para quitarlo.
 */
function entradaDirecta(contenedor: HTMLElement, clave: string, mandar: (datos: string) => void): () => void {
  const cuadro = document.createElement("textarea");
  cuadro.dataset["terminal"] = clave;
  cuadro.setAttribute("aria-label", "Escribir en la terminal");
  cuadro.setAttribute("autocapitalize", "off");
  cuadro.setAttribute("autocomplete", "off");
  cuadro.setAttribute("autocorrect", "off");
  cuadro.setAttribute("spellcheck", "false");
  cuadro.setAttribute("enterkeyhint", "send");
  // 16 px: el navegador no hace zoom al enfocar. Transparente: solo se ve la terminal.
  cuadro.style.cssText = "position:absolute;left:0;bottom:0;width:100%;height:2.5rem;opacity:0;font-size:16px;resize:none;border:0;padding:0;caret-color:transparent;z-index:2;";
  cuadro.value = RELLENO;
  let previo = RELLENO;
  const reiniciar = () => {
    cuadro.value = RELLENO;
    previo = RELLENO;
  };
  const alEscribir = () => {
    const actual = cuadro.value;
    let comun = 0;
    while (comun < previo.length && comun < actual.length && previo[comun] === actual[comun]) comun++;
    const datos = "\x7f".repeat(previo.length - comun) + actual.slice(comun).replace(/\n/g, "\r");
    previo = actual;
    if (datos) mandar(datos);
    // Tras Enter o si se borró el relleno, se empieza de nuevo (la terminal ya tiene todo).
    if (datos.includes("\r") || !actual.startsWith(RELLENO)) reiniciar();
  };
  const alTecla = (e: KeyboardEvent) => {
    // Teclado físico o teclas que no generan texto (Tab, flechas) van directo.
    const especial: Record<string, string> = { Tab: "\t", Escape: "\x1b", ArrowUp: "\x1b[A", ArrowDown: "\x1b[B", ArrowRight: "\x1b[C", ArrowLeft: "\x1b[D" };
    const s = especial[e.key];
    if (s) {
      e.preventDefault();
      mandar(s);
    }
  };
  const enfocar = () => cuadro.focus({ preventScroll: true });
  cuadro.addEventListener("input", alEscribir);
  cuadro.addEventListener("keydown", alTecla);
  contenedor.addEventListener("click", enfocar);
  contenedor.appendChild(cuadro);
  return () => {
    cuadro.removeEventListener("input", alEscribir);
    cuadro.removeEventListener("keydown", alTecla);
    contenedor.removeEventListener("click", enfocar);
    cuadro.remove();
  };
}

/** Tus cuentas 2FA: tocar una escribe su código actual en la terminal (para scripts que piden autenticación). */
function CodigosParaTerminal({ alElegir }: { alElegir: (codigo: string) => void }) {
  const { data, isLoading } = useElementos<CuentaTotp>("2fa");
  const [codigos, setCodigos] = useState<Record<string, { codigo: string; restante: number }>>({});
  useEffect(() => {
    if (!data) return;
    const calcular = () =>
      void Promise.all(data.map(async (e) => [e.id, await codigoTotp(e.valor)] as const)).then((pares) => setCodigos(Object.fromEntries(pares)));
    calcular();
    const t = setInterval(calcular, 1000);
    return () => clearInterval(t);
  }, [data]);
  if (isLoading) return <Cargando texto="Descifrando…" />;
  if (!data?.length) return <Vacio texto="No tienes cuentas en el Autenticador 2FA." />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-tenue">Toca la cuenta: su código se escribe en la terminal y se pulsa Enter.</p>
      {data.map((e) => (
        <button key={e.id} type="button" onClick={() => codigos[e.id] && alElegir(codigos[e.id]!.codigo)} className="flex w-full items-center justify-between rounded-xl bg-fondo p-3 text-left hover:bg-tarjeta">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{e.valor.emisor || e.valor.cuenta}</span>
            <span className="block truncate text-xs text-tenue">{e.valor.cuenta}</span>
          </span>
          <span className="font-mono text-lg">
            {codigos[e.id]?.codigo ?? "······"} <span className="text-xs text-tenue">{codigos[e.id]?.restante ?? ""}s</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function useComandos() {
  const puede = usePuede("vps_comandos", "lectura");
  return useQuery({ queryKey: ["vps", "comandos"], queryFn: () => api<ComandoGuardado[]>("/api/vps/comandos"), enabled: puede });
}

function useHistorial(servidorId: string | null) {
  return useQuery({
    queryKey: ["vps", "historial", servidorId],
    queryFn: () => api<EntradaHistorial[]>(`/api/vps/historial${servidorId ? `?servidorId=${servidorId}` : ""}`),
  });
}

async function revisarYEnviar(enviar: Enviar | null, comando: string, servidorId: string | null, nombre?: string, guardar = true): Promise<boolean> {
  if (!enviar) {
    avisar("Abre primero una sesión de terminal", "info");
    return false;
  }
  const analisis = analizarComando(comando);
  if (analisis.peligroso) {
    const ok = await confirmar({ titulo: "Comando peligroso", mensaje: analisis.motivos.join(" · "), detalle: comando, peligroso: true, textoExacto: nombre ?? "EJECUTAR", boton: "Ejecutar" });
    if (!ok) return false;
  }
  enviar(`${comando}\r`);
  if (guardar && servidorId) anotar(servidorId, comando);
  return true;
}

function CajaComando({
  enviar,
  servidorId,
  texto,
  setTexto,
  mods,
  setMods,
  entrada,
  tactil,
}: {
  enviar: Enviar | null;
  servidorId: string | null;
  texto: string;
  setTexto: (t: string) => void;
  mods: Modificadores;
  setMods: (m: Modificadores) => void;
  entrada: RefObject<HTMLInputElement>;
  tactil: boolean;
}) {
  const [oculto, setOculto] = useState(false);
  const comandos = useComandos();
  const historial = useHistorial(servidorId);
  const busqueda = texto.startsWith("/") ? normalizarNombre(texto.slice(1)) : null;
  const sugerencias = useMemo(() => {
    if (oculto) return [];
    if (busqueda !== null) return (comandos.data ?? []).filter((c) => normalizarNombre(c.nombre).includes(busqueda)).slice(0, 6).map((c) => ({ clave: c.id, texto: c.comando, etiqueta: `/${normalizarNombre(c.nombre)}`, peligroso: c.peligroso, nombre: c.nombre }));
    const t = texto.trim();
    if (t.length < 2) return [];
    const vistos = new Set<string>();
    return (historial.data ?? [])
      .filter((h) => h.comando.startsWith(t) && h.comando !== t && !vistos.has(h.comando) && Boolean(vistos.add(h.comando)))
      .slice(0, 5)
      .map((h) => ({ clave: `${h.fecha}${h.comando}`, texto: h.comando, etiqueta: "historial", peligroso: false, nombre: undefined as string | undefined }));
  }, [busqueda, comandos.data, historial.data, texto, oculto]);

  const ejecutar = async (comando: string, nombre?: string) => {
    if (await revisarYEnviar(enviar, comando, servidorId, nombre, !oculto)) {
      setTexto("");
      setOculto(false);
    }
  };

  const alEnviar = async (e: FormEvent) => {
    e.preventDefault();
    if (busqueda !== null) {
      const exacto = (comandos.data ?? []).find((c) => normalizarNombre(c.nombre) === busqueda) ?? (comandos.data ?? []).find((c) => normalizarNombre(c.nombre).includes(busqueda));
      if (!exacto) return avisar(`No hay un comando guardado que se llame "${texto.slice(1)}"`, "error");
      return ejecutar(exacto.comando, exacto.nombre);
    }
    if (oculto) {
      if (!enviar) return;
      enviar(`${texto}\r`);
      setTexto("");
      setOculto(false);
      return;
    }
    if (texto.trim()) await ejecutar(texto);
    else if (tactil && enviar) enviar("\r");
  };

  return (
    <div className="relative shrink-0 border-t border-borde bg-superficie px-2 py-2">
      {sugerencias.length ? (
        <div className="absolute bottom-full left-2 right-2 z-10 mb-1 overflow-hidden rounded-xl border border-borde bg-superficie shadow-2xl">
          {sugerencias.map((c) => (
            <button
              key={c.clave}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => (busqueda !== null ? void ejecutar(c.texto, c.nombre) : setTexto(c.texto))}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-tarjeta"
            >
              <span className="shrink-0 font-medium text-acento">{c.etiqueta}</span>
              {c.peligroso ? <Insignia tono="peligro">peligroso</Insignia> : null}
              <span className="truncate font-mono text-tenue">{c.texto}</span>
            </button>
          ))}
        </div>
      ) : null}
      <form className="flex items-center gap-2" onSubmit={(e) => void alEnviar(e)}>
        <Boton tamano="icono" variante={oculto ? "primario" : "fantasma"} icono={oculto ? EyeOff : Eye} onClick={() => setOculto((v) => !v)} aria-label={oculto ? "Modo oculto activado" : "Escribir oculto (contraseñas)"} title="Modo oculto: para contraseñas; no se muestra ni se guarda" />
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-borde bg-fondo pl-3 pr-1 focus-within:border-acento">
          <span className="font-mono text-[13px] text-acento">{mods.ctrl ? "ctrl" : mods.alt ? "alt" : "$"}</span>
          <input
            ref={entrada}
            value={texto}
            type={oculto ? "password" : "text"}
            onChange={(e) => {
              const nuevo = e.target.value;
              if ((mods.ctrl || mods.alt) && nuevo.length === texto.length + 1 && nuevo.startsWith(texto) && enviar) {
                enviar(aplicarModificadores(nuevo.slice(-1), mods), false);
                setMods({ ctrl: false, alt: false });
                return;
              }
              setTexto(nuevo);
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab" && sugerencias[0] && busqueda === null) {
                e.preventDefault();
                setTexto(sugerencias[0].texto);
              }
            }}
            placeholder={oculto ? "Contraseña o respuesta (oculta)" : tactil ? "Escribe un comando o /nombre…" : "Escribe un comando o /nombre de un comando guardado y pulsa Enter"}
            className="h-full min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-tenue"
            disabled={!enviar}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="send"
          />
          <Boton type="submit" tamano="icono" variante="primario" icono={Send} className="h-8 w-8" aria-label="Ejecutar" disabled={!enviar || (!tactil && !texto.trim())} />
        </div>
      </form>
    </div>
  );
}

function ListaComandos({ enviar, servidorId, alCaja }: { enviar: Enviar | null; servidorId: string | null; alCaja: (t: string) => void }) {
  const comandos = useComandos();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-tenue">
        <span>Escribe /nombre</span>
        <Link to="/vps/comandos" className="text-acento">Administrar</Link>
      </div>
      {comandos.data?.length === 0 ? <p className="text-xs text-tenue">Aún no guardas comandos.</p> : null}
      {(comandos.data ?? []).map((c) => (
        <div key={c.id} className="rounded-xl border border-borde bg-fondo p-2.5">
          <b className="flex items-center gap-2 font-mono text-xs">/{normalizarNombre(c.nombre)} {c.peligroso ? <Insignia tono="peligro">peligroso</Insignia> : null}</b>
          {c.descripcion ? <p className="text-xs text-tenue">{c.descripcion}</p> : null}
          <code className="mt-1 block truncate font-mono text-[11px] text-tenue">{c.comando}</code>
          <div className="mt-2 flex gap-1.5">
            <Boton tamano="sm" icono={TerminalSquare} onClick={() => void revisarYEnviar(enviar, c.comando, servidorId, c.nombre)}>Ejecutar</Boton>
            <Boton tamano="sm" variante="fantasma" onClick={() => alCaja(c.comando)}>Poner en la caja</Boton>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListaHistorial({ servidorId, alElegir }: { servidorId: string | null; alElegir: (comando: string) => void }) {
  const historial = useHistorial(servidorId);
  const lista = historial.data ?? [];
  return (
    <div className="space-y-1">
      <p className="text-xs text-tenue">{servidorId ? "Historial de este servidor" : "Historial"}</p>
      {lista.length === 0 ? <p className="text-xs text-tenue">Aquí salen los comandos que ejecutes. Tócalos para usarlos otra vez.</p> : null}
      {lista.slice(0, 60).map((h) => (
        <button key={`${h.fecha}-${h.comando}`} type="button" onClick={() => alElegir(h.comando)} className="block w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-xs hover:bg-tarjeta" title={`${h.comando} · ${haceCuanto(h.fecha)}`}>
          {h.comando}
        </button>
      ))}
    </div>
  );
}

const VACIO = { nombre: "", host: "", puerto: 22, usuario: "root", tipo: "llave" as "llave" | "password", secreto: "", frase: "", quitarFrase: false, alertas: true };

function FormularioServidor({ inicial, alTerminar }: { inicial: Servidor | null; alTerminar: () => void }) {
  const [d, setD] = useState(
    inicial ? { ...VACIO, nombre: inicial.nombre, host: inicial.host, puerto: inicial.puerto, usuario: inicial.usuario, tipo: inicial.tipo, alertas: inicial.alertas } : VACIO,
  );
  // Lo guardado solo se conserva si no cambias de método; al cambiar hay que dar el nuevo.
  const guardado = Boolean(inicial) && inicial?.tipo === d.tipo;
  const conservaFrase = guardado && Boolean(inicial?.conFrase) && !d.secreto.trim();
  const guardar = useMutation({
    mutationFn: () => {
      const frase = d.tipo !== "llave" ? {} : d.frase ? { frase: d.frase } : d.quitarFrase ? { frase: "" } : {};
      const cuerpo = { nombre: d.nombre, host: d.host, puerto: Number(d.puerto), usuario: d.usuario, tipo: d.tipo, alertas: d.alertas, ...(d.secreto.trim() ? { secreto: d.secreto } : {}), ...frase };
      return inicial ? api(`/api/vps/servidores/${inicial.id}`, { metodo: "PATCH", cuerpo }) : api("/api/vps/servidores", { cuerpo });
    },
    onSuccess: () => {
      avisar("Servidor guardado");
      void queryClient.invalidateQueries({ queryKey: ["vps"] });
      alTerminar();
    },
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre">
          <Entrada value={d.nombre} onChange={(e) => set("nombre", e.target.value)} required />
        </Campo>
        <Campo etiqueta="Host o IP">
          <Entrada value={d.host} onChange={(e) => set("host", e.target.value)} required />
        </Campo>
        <Campo etiqueta="Puerto">
          <Entrada type="number" value={d.puerto} onChange={(e) => set("puerto", Number(e.target.value))} min={1} max={65535} />
        </Campo>
        <Campo etiqueta="Usuario">
          <Entrada value={d.usuario} onChange={(e) => set("usuario", e.target.value)} required />
        </Campo>
      </div>
      <Campo etiqueta="Método de autenticación">
        <Selector value={d.tipo} onChange={(e) => set("tipo", e.target.value as "llave" | "password")}>
          <option value="llave">Llave privada (recomendado)</option>
          <option value="password">Contraseña</option>
        </Selector>
      </Campo>
      {d.tipo === "llave" ? (
        <>
          <Campo
            etiqueta={guardado ? "Llave privada · llave guardada ✓" : "Llave privada"}
            ayuda={guardado ? "Déjala vacía para conservar la llave guardada, o pega otra para reemplazarla." : "Pega la llave completa (con las líneas BEGIN y END). Se guarda cifrada y nunca se vuelve a mostrar."}
          >
            <AreaTexto
              rows={8}
              value={d.secreto}
              onChange={(e) => set("secreto", e.target.value)}
              className="font-mono text-xs"
              placeholder={guardado ? "Llave guardada (pega otra solo para reemplazarla)" : "-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----"}
              spellCheck={false}
              autoComplete="off"
              required={!guardado}
            />
          </Campo>
          <Campo etiqueta="Frase de la llave (opcional)" ayuda={conservaFrase ? "Hay una frase guardada: déjala vacía para conservarla." : "Solo si tu llave tiene frase (passphrase). Se guarda cifrada."}>
            <Entrada type="password" value={d.frase} onChange={(e) => set("frase", e.target.value)} autoComplete="off" disabled={d.quitarFrase} />
          </Campo>
          {conservaFrase ? <Interruptor activo={d.quitarFrase} alCambiar={(x) => set("quitarFrase", x)} etiqueta="Quitar la frase guardada" /> : null}
        </>
      ) : (
        <Campo
          etiqueta={guardado ? "Contraseña · contraseña guardada ✓" : "Contraseña"}
          ayuda={guardado ? "Déjala vacía para conservar la actual." : "Si tu VPS solo acepta llaves (PasswordAuthentication no), usa «Llave privada»."}
        >
          <Entrada type="password" value={d.secreto} onChange={(e) => set("secreto", e.target.value)} autoComplete="off" required={!guardado} />
        </Campo>
      )}
      <Interruptor activo={d.alertas} alCambiar={(v) => set("alertas", v)} etiqueta="Vigilar caídas (cada 60 s)" />
      <ErrorCaja error={guardar.error} />
      <div className="flex justify-end gap-2">
        <Boton variante="fantasma" onClick={alTerminar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={guardar.isPending}>Guardar</Boton>
      </div>
    </form>
  );
}

type Pestana =
  | { clave: string; tipo: "ssh"; servidor: Servidor; sesion?: string; inicial?: string }
  | { clave: string; tipo: "local"; nombre: string; shell: string; pty?: string };

type Lado = "comandos" | "historial" | "2fa";

const nombreDe = (p: Pestana) => (p.tipo === "ssh" ? p.servidor.nombre : p.nombre);

export default function VpsTerminal() {
  const { data, isLoading, error } = useServidores();
  const servidores = useMemo(() => data ?? [], [data]);
  const esAdmin = usePuede("vps_terminal", "administrar");
  const forma = useForma();
  const acostado = useAcostado();
  const tactil = useTactil();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const abrirIa = useAsistente((e) => e.poner);
  const local = escritorio()?.terminalLocal ?? null;
  const [shells, setShells] = useState<{ id: string; nombre: string }[]>([]);
  const conocidasLocales = useRef(new Set<string>());
  const conocidas = useRef(new Set<string>());
  const [pestanas, setPestanas] = useState<Pestana[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [vista, setVista] = useState<"hosts" | "sesion">("hosts");
  const [seccion, setSeccion] = useState<SeccionHosts>("hosts");
  const [editando, setEditando] = useState<Servidor | null | "nuevo">(null);
  const [verCodigos, setVerCodigos] = useState(false);
  const [texto, setTexto] = useState("");
  const [dividida, setDividida] = useState(false);
  const [segunda, setSegunda] = useState<string | null>(null);
  const [enLasDos, setEnLasDos] = useState(false);
  const [lado, setLado] = useState<Lado | null>(null);
  const [paleta, setPaleta] = useState(false);
  const [mods, setMods] = useState<Modificadores>({ ctrl: false, alt: false });
  const [panelBarra, setPanelBarra] = useState<PanelBarra>(null);
  // En el celular se escribe directo en la terminal (como Termius); la caja queda como opción.
  // Texto seleccionado (celular) y enlace tocado en la terminal: se ofrece copiar o abrir.
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  useEffect(() => {
    const alEnlace = (e: Event) => setEnlace((e as CustomEvent<string>).detail);
    const alSeleccion = (e: Event) => setSeleccion((e as CustomEvent<string>).detail);
    window.addEventListener(EVENTO_ENLACE, alEnlace);
    window.addEventListener(EVENTO_SELECCION, alSeleccion);
    return () => {
      window.removeEventListener(EVENTO_ENLACE, alEnlace);
      window.removeEventListener(EVENTO_SELECCION, alSeleccion);
    };
  }, []);
  const copiar = (texto: string, aviso = "Copiado") =>
    void escribirPortapapeles(texto).then(
      () => avisar(aviso, "info"),
      () => avisar("No se pudo copiar", "error"),
    );
  const [cajaVisible, setCajaVisible] = useState(() => !(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches));
  const caja = useRef<HTMLInputElement>(null);
  const enviadores = useRef(new Map<string, Enviar>());
  const [, refrescar] = useState(0);
  const celular = forma === "celular";
  const enSesion = vista === "sesion" && pestanas.length > 0;
  useModoPagina(enSesion && (celular || acostado) ? "completa" : "pleno");

  const registros = useRef(new Map<string, (enviar: Enviar | null) => void>());
  const registroDe = useCallback((clave: string) => {
    let fn = registros.current.get(clave);
    if (!fn) {
      fn = (enviar) => {
        if (enviar) enviadores.current.set(clave, enviar);
        else enviadores.current.delete(clave);
        refrescar((n) => n + 1);
      };
      registros.current.set(clave, fn);
    }
    return fn;
  }, []);

  useEffect(() => {
    const pedir = () => tiempoReal.enviar({ tipo: "terminal.lista" });
    pedir();
    const offs = [
      tiempoReal.on("auth.ok", pedir),
      tiempoReal.on("terminal.sesiones", (m) => {
        const nuevas = m.sesiones.filter((s) => !conocidas.current.has(s.id));
        if (!nuevas.length) return;
        setPestanas((p) => {
          const agregar = nuevas
            .map((s) => ({ s, servidor: data?.find((x) => x.id === s.servidorId) }))
            .filter((x): x is { s: (typeof nuevas)[number]; servidor: Servidor } => Boolean(x.servidor))
            .map(({ s, servidor }) => {
              conocidas.current.add(s.id);
              return { clave: crypto.randomUUID(), tipo: "ssh" as const, servidor, sesion: s.id };
            });
          if (agregar.length) setActiva((a) => a ?? agregar[0]!.clave);
          return [...p, ...agregar];
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [data]);

  const abrir = useCallback((servidor: Servidor, inicial?: string) => {
    const clave = crypto.randomUUID();
    setPestanas((p) => [...p, { clave, tipo: "ssh", servidor, ...(inicial ? { inicial } : {}) }]);
    setActiva(clave);
    setVista("sesion");
  }, []);
  const abrirLocal = useCallback((shell: string, nombre: string, pty?: string) => {
    const clave = crypto.randomUUID();
    setPestanas((p) => [...p, { clave, tipo: "local", shell, nombre, ...(pty ? { pty } : {}) }]);
    setActiva((a) => (pty ? (a ?? clave) : clave));
    if (!pty) setVista("sesion");
  }, []);

  useEffect(() => {
    const id = params.get("servidor");
    if (!id || !data) return;
    const s = data.find((x) => x.id === id);
    const cd = params.get("cd");
    setParams({}, { replace: true });
    if (s) abrir(s, cd ? `cd '${cd.replace(/'/g, "'\\''")}'` : undefined);
  }, [params, data, abrir, setParams]);

  useEffect(() => {
    if (!local) return;
    let vigente = true;
    void (async () => {
      const [lista, disponibles] = await Promise.all([local.lista(), local.shells()]);
      if (!vigente) return;
      setShells(disponibles);
      const vivas = lista.filter((s) => s.viva && !conocidasLocales.current.has(s.id));
      // Las que siguen abiertas vuelven como pestañas; no se abre ninguna sola:
      // al entrar a Terminal se empieza en Hosts y tú eliges qué abrir.
      vivas.forEach((s) => {
        conocidasLocales.current.add(s.id);
        abrirLocal(s.shell, s.nombre, s.id);
      });
    })().catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [local, abrirLocal]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setPaleta(true);
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, []);

  const cerrar = (clave: string) => {
    if (pestanas.find((x) => x.clave === clave)?.tipo === "local") cierresLocales.add(clave);
    cierresExplicitos.add(clave);
    registros.current.delete(clave);
    setPestanas((p) => {
      const resto = p.filter((x) => x.clave !== clave);
      if (activa === clave) setActiva(resto.at(-1)?.clave ?? null);
      if (segunda === clave) setSegunda(resto.find((x) => x.clave !== activa)?.clave ?? null);
      if (!resto.length) setVista("hosts");
      return resto;
    });
  };

  const pestanaActiva = pestanas.find((p) => p.clave === activa) ?? null;
  const servidorActivo = pestanaActiva?.tipo === "ssh" ? pestanaActiva.servidor : null;
  const enviarActiva = activa ? (enviadores.current.get(activa) ?? null) : null;
  const otra = dividida && segunda && segunda !== activa && pestanas.some((p) => p.clave === segunda) ? segunda : null;
  const partida = Boolean(otra) && !celular;

  const espejo = (clave: string, datos: string) => {
    if (!enLasDos || !partida || !otra) return;
    const destino = clave === activa ? otra : clave === otra ? activa : null;
    if (destino) enviadores.current.get(destino)?.(datos, false);
  };
  const enviarTodas: Enviar | null = enviarActiva
    ? (t, enfocar) => {
        enviarActiva(t, enfocar);
        if (enLasDos && partida && otra) enviadores.current.get(otra)?.(t, false);
      }
    : null;

  const dividir = () => {
    if (pestanas.length < 2) return avisar("Abre dos sesiones para verlas lado a lado.", "info");
    setDividida((v) => {
      if (!v) setSegunda((s) => (s && s !== activa ? s : (pestanas.find((p) => p.clave !== activa)?.clave ?? null)));
      else setEnLasDos(false);
      return !v;
    });
  };

  const pegar = async () => {
    const t = await leerPortapapeles();
    if (!t) return avisar("No hay texto en el portapapeles", "info");
    enviarTodas?.(t);
  };

  const ponerEnCaja = (t: string) => {
    setTexto(t);
    setCajaVisible(true);
    requestAnimationFrame(() => caja.current?.focus());
  };

  const probar = async (s: Servidor) => {
    try {
      await api(`/api/vps/servidores/${s.id}/probar`, { metodo: "POST" });
      avisar(`Conexión correcta con ${s.nombre}`);
      void queryClient.invalidateQueries({ queryKey: ["vps"] });
    } catch (err) {
      if (err instanceof ApiError && err.codigo === "huella_cambiada") {
        const huella = String(err.datos?.["huella"] ?? "");
        const ok = await confirmar({
          titulo: "La huella del servidor cambió",
          mensaje: "Acepta la nueva huella solo si reinstalaste el VPS o cambiaste su llave. Si no, alguien podría estar suplantándolo.",
          detalle: huella,
          peligroso: true,
          textoExacto: s.nombre,
          boton: "Aceptar nueva huella",
        });
        if (ok) await api(`/api/vps/servidores/${s.id}/huella`, { metodo: "PUT", cuerpo: { huella } }).then(() => avisar("Huella actualizada"), avisarError);
      } else avisarError(err);
    }
  };

  const borrar = async (s: Servidor) => {
    if (!(await confirmar({ titulo: "Quitar servidor", mensaje: `¿Quitar ${s.nombre} y sus credenciales guardadas?`, peligroso: true, textoExacto: s.nombre, boton: "Quitar" }))) return;
    await api(`/api/vps/servidores/${s.id}`, { metodo: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: ["vps"] }), avisarError);
  };

  const comandos = useComandos();
  const opcionesPaleta: OpcionPaleta[] = [
    ...(comandos.data ?? []).map((c) => ({
      id: `c-${c.id}`,
      grupo: "Comandos guardados",
      titulo: `/${normalizarNombre(c.nombre)}`,
      detalle: c.comando,
      icono: TerminalSquare,
      hacer: () => void revisarYEnviar(enviarTodas, c.comando, servidorActivo?.id ?? null, c.nombre),
      alTab: () => ponerEnCaja(c.comando),
    })),
    ...servidores.map((s) => ({ id: `h-${s.id}`, grupo: "Hosts", titulo: s.nombre, detalle: `${s.usuario}@${s.host}:${s.puerto}`, icono: Server, hacer: () => abrir(s) })),
    ...shells.map((sh) => ({ id: `l-${sh.id}`, grupo: "Hosts", titulo: sh.nombre, detalle: "Terminal de esta PC", icono: Laptop, hacer: () => abrirLocal(sh.id, sh.nombre) })),
    { id: "a-hosts", grupo: "Acciones", titulo: "Ver todos los hosts", icono: House, hacer: () => setVista("hosts") },
    ...(pestanas.length > 1 && !celular ? [{ id: "a-dividir", grupo: "Acciones", titulo: dividida ? "Una sola pantalla" : "Dividir pantalla", icono: Columns2, hacer: dividir }] : []),
    ...(partida ? [{ id: "a-dos", grupo: "Acciones", titulo: enLasDos ? "Dejar de escribir en las 2" : "Escribir en las 2 a la vez", icono: Radio, hacer: () => setEnLasDos((v) => !v) }] : []),
    ...(servidorActivo ? [{ id: "a-sftp", grupo: "Acciones", titulo: "Abrir archivos (SFTP)", detalle: servidorActivo.nombre, icono: FolderTree, hacer: () => navegar(`/vps/archivos?servidor=${servidorActivo.id}`) }] : []),
    ...(enviarActiva ? [{ id: "a-2fa", grupo: "Acciones", titulo: "Escribir un código 2FA", icono: KeyRound, hacer: () => setVerCodigos(true) }] : []),
    ...(enviarActiva ? [{ id: "a-pegar", grupo: "Acciones", titulo: "Pegar", icono: ClipboardPaste, hacer: () => void pegar() }] : []),
    { id: "a-historial", grupo: "Acciones", titulo: "Historial", icono: History, hacer: () => (tactil ? setPanelBarra("historial") : setLado("historial")) },
    { id: "a-ia", grupo: "Acciones", titulo: "Preguntarle a la IA", icono: Sparkles, hacer: () => abrirIa(true) },
    { id: "a-apariencia", grupo: "Acciones", titulo: "Apariencia de la terminal", detalle: "Ajustes → Terminal", icono: Settings, hacer: () => navegar("/ajustes?pestana=terminal") },
  ];

  const contenidoLado = (cual: Lado | "teclas" | null) =>
    cual === "comandos" ? (
      <ListaComandos enviar={enviarTodas} servidorId={servidorActivo?.id ?? null} alCaja={ponerEnCaja} />
    ) : cual === "historial" ? (
      <ListaHistorial servidorId={servidorActivo?.id ?? null} alElegir={ponerEnCaja} />
    ) : cual === "2fa" ? (
      <Desbloqueo>
        <CodigosParaTerminal alElegir={(codigo) => enviarActiva?.(`${codigo}\r`)} />
      </Desbloqueo>
    ) : null;

  const pestanaBoton = (p: Pestana, compacta = false) => {
    const sel = vista === "sesion" && activa === p.clave;
    return (
      <div key={p.clave} className={cx("flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] pl-3 text-[13px] font-medium", sel ? "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ok)_35%,transparent)]" : otra === p.clave ? "bg-tarjeta text-texto" : "bg-tarjeta text-tenue")}>
        <button
          type="button"
          className="flex items-center gap-1.5"
          onClick={() => {
            setActiva(p.clave);
            setVista("sesion");
            if (segunda === p.clave) setSegunda(activa);
          }}
        >
          {p.tipo === "local" ? <Laptop className="h-3.5 w-3.5" /> : <span className={cx("h-2 w-2 rounded-full", p.servidor.estado === "caido" ? "bg-peligro" : "bg-ok")} />}
          <span className={cx(compacta && "max-w-[7rem] truncate")}>{nombreDe(p)}</span>
        </button>
        <button type="button" onClick={() => cerrar(p.clave)} className="grid h-8 w-7 place-items-center text-tenue hover:text-texto" aria-label={`Cerrar ${nombreDe(p)}`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  const barraSuperior =
    enSesion && (celular || acostado) ? (
      <div className="safe-top flex shrink-0 items-center gap-1 border-b border-borde bg-[#16131f] px-1.5 py-1">
        <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-tenue" onClick={() => setVista("hosts")} aria-label="Ver hosts">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">{pestanas.map((p) => pestanaBoton(p, true))}</div>
        <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-tenue" onClick={() => { setVista("hosts"); setSeccion("hosts"); }} aria-label="Nueva sesión">
          <Plus className="h-[18px] w-[18px]" />
        </button>
        <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-tenue" onClick={() => setPaleta(true)} aria-label="Buscar">
          <Search className="h-[18px] w-[18px]" />
        </button>
        <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-tenue" onClick={() => abrirIa(true)} aria-label="IA">
          <Sparkles className="h-[18px] w-[18px]" />
        </button>
      </div>
    ) : (
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-borde bg-fondo px-2 py-1.5 [scrollbar-width:none]">
        <button type="button" onClick={() => setVista("hosts")} className={cx("flex h-8 shrink-0 items-center gap-2 rounded-[9px] px-3 text-[13px] font-medium", vista === "hosts" ? "bg-tarjeta text-texto" : "text-tenue")}>
          <Server className="h-4 w-4" />
          <span className={cx(celular && "hidden")}>Hosts</span>
        </button>
        <Link to={servidorActivo ? `/vps/archivos?servidor=${servidorActivo.id}` : "/vps/archivos"} className="flex h-8 shrink-0 items-center gap-2 rounded-[9px] px-3 text-[13px] font-medium text-tenue">
          <FolderTree className="h-4 w-4" />
          <span className={cx(celular && "hidden")}>SFTP</span>
        </Link>
        {pestanas.length ? <span className="mx-0.5 h-5 w-px shrink-0 bg-borde" /> : null}
        {pestanas.map((p) => pestanaBoton(p))}
        <button type="button" onClick={() => { setVista("hosts"); setSeccion("hosts"); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-tenue hover:bg-tarjeta" aria-label="Nueva sesión">
          <Plus className="h-4 w-4" />
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setPaleta(true)} className="flex h-[30px] items-center gap-2 rounded-[9px] border border-borde px-2.5 text-xs text-tenue">
            <Search className="h-4 w-4" />
            <span className="hidden md:inline">Buscar</span>
            <kbd className="hidden rounded-md border border-borde px-1.5 font-mono text-[11px] lg:inline">Ctrl K</kbd>
          </button>
          {enSesion && !celular ? (
            <>
              <Boton tamano="icono" variante={dividida ? "secundario" : "fantasma"} icono={SquareSplitHorizontal} onClick={dividir} aria-label="Dividir pantalla" title="Dividir pantalla" />
              {partida ? <Boton tamano="icono" variante={enLasDos ? "secundario" : "fantasma"} icono={Radio} className={cx(enLasDos && "text-aviso")} onClick={() => setEnLasDos((v) => !v)} aria-label="Escribir en las 2" title="Escribir en las 2 a la vez" /> : null}
              <Boton tamano="icono" variante="fantasma" icono={Sparkles} onClick={() => abrirIa(true)} aria-label="IA" title="IA: solo propone" />
              {tactil ? null : <Boton tamano="icono" variante={lado ? "secundario" : "fantasma"} icono={PanelRight} onClick={() => setLado((l) => (l ? null : "comandos"))} aria-label="Panel" title="Comandos, historial y 2FA" />}
            </>
          ) : null}
          <Link to="/ajustes?pestana=terminal" className="grid h-9 w-9 place-items-center rounded-xl text-tenue hover:bg-tarjeta" aria-label="Apariencia" title="Apariencia (Ajustes → Terminal)">
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );

  const paneles = (
    <div
      className={cx("relative min-h-0 min-w-0 flex-1 gap-px bg-borde", vista === "sesion" ? "grid" : "hidden")}
      style={{ gridTemplateColumns: partida ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)", gridTemplateRows: "minmax(0,1fr)" }}
    >
      {pestanas.map((p) => {
        const enA = activa === p.clave;
        const enB = partida && otra === p.clave;
        const visible = vista === "sesion" && (enA || enB);
        return (
          <div key={p.clave} className={cx("relative min-h-0 min-w-0", !visible && "hidden")} style={{ gridColumn: enB ? 2 : 1, gridRow: 1 }}>
            {partida ? (
              <span className={cx("absolute right-2.5 top-2 z-[1] rounded-full px-2 py-0.5 font-mono text-[11px]", enA ? "bg-[color-mix(in_srgb,var(--acento)_20%,transparent)] text-acento" : "bg-tarjeta text-tenue")}>
                {nombreDe(p)}
                {enLasDos ? " · las 2" : ""}
              </span>
            ) : null}
            {p.tipo === "ssh" ? (
              <Consola
                clave={p.clave}
                servidor={p.servidor}
                {...(p.sesion ? { sesionInicial: p.sesion } : {})}
                {...(p.inicial ? { inicial: p.inicial } : {})}
                visible={visible}
                registrar={registroDe(p.clave)}
                alId={(id) => conocidas.current.add(id)}
                alTeclear={(d) => espejo(p.clave, d)}
                modificar={(d) => {
                  if (!mods.ctrl && !mods.alt) return d;
                  setMods({ ctrl: false, alt: false });
                  return aplicarModificadores(d, mods);
                }}
              />
            ) : (
              <ConsolaLocal
                clave={p.clave}
                shell={p.shell}
                {...(p.pty ? { ptyInicial: p.pty } : {})}
                visible={visible}
                registrar={registroDe(p.clave)}
                alId={(id) => conocidasLocales.current.add(id)}
                alTeclear={(d) => espejo(p.clave, d)}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const navSecciones = (
    <nav className="hidden w-[200px] shrink-0 flex-col gap-0.5 border-r border-borde bg-superficie p-2 md:flex max-lg:w-16">
      {SECCIONES.map(([id, Icono, nombre]) => (
        <button key={id} type="button" onClick={() => setSeccion(id)} title={nombre} className={cx("flex h-[38px] items-center gap-2.5 rounded-[10px] px-3 text-left text-[13px] font-medium max-lg:justify-center max-lg:px-0", seccion === id ? "bg-tarjeta text-texto" : "text-tenue hover:text-texto")}>
          <Icono className="h-4 w-4 shrink-0" />
          <span className="truncate max-lg:hidden">{nombre}</span>
        </button>
      ))}
    </nav>
  );

  const navAbajo = (
    <nav className="safe-bottom flex shrink-0 justify-around border-t border-borde bg-superficie md:hidden">
      {SECCIONES.map(([id, Icono, nombre]) => (
        <button key={id} type="button" onClick={() => setSeccion(id)} className={cx("flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold", seccion === id ? "text-acento" : "text-tenue")}>
          <Icono className="h-5 w-5" />
          <span className="max-w-full truncate">{nombre === "Hosts conocidos" ? "Conocidos" : nombre}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-superficie">
      {barraSuperior}
      {vista === "hosts" || !pestanas.length ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <ErrorCaja error={error} />
          {isLoading ? <Cargando /> : null}
          <div className="flex min-h-0 flex-1">
            {navSecciones}
            <VistaHosts
              seccion={seccion}
              servidores={servidores}
              shells={shells}
              esAdmin={esAdmin}
              alAbrir={(s) => abrir(s)}
              alAbrirLocal={(sh, n) => abrirLocal(sh, n)}
              alProbar={(s) => void probar(s)}
              alEditar={setEditando}
              alBorrar={(s) => void borrar(s)}
              alNuevo={() => setEditando("nuevo")}
              alUsarComando={(c) => {
                if (enviarActiva) {
                  setVista("sesion");
                  void revisarYEnviar(enviarTodas, c.comando, servidorActivo?.id ?? null, c.nombre);
                } else avisar("Abre primero una sesión de terminal", "info");
              }}
              alUsarTexto={(t) => {
                if (!pestanas.length) return avisar("Abre primero una sesión de terminal", "info");
                setVista("sesion");
                ponerEnCaja(t);
              }}
            />
          </div>
          {navAbajo}
        </div>
      ) : null}
      {pestanas.length ? (
        <div className={cx("min-h-0 flex-1 flex-col", vista === "sesion" ? "flex" : "hidden")}>
          <div className="relative flex min-h-0 flex-1">
            {seleccion ? (
              <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-borde bg-superficie p-1 shadow-2xl">
                <Boton tamano="sm" variante="primario" icono={Copy} onPointerDown={(e) => e.preventDefault()} onClick={() => (copiar(seleccion), setSeleccion(null))}>
                  Copiar
                </Boton>
                <Boton tamano="sm" variante="fantasma" icono={X} onPointerDown={(e) => e.preventDefault()} onClick={() => setSeleccion(null)} aria-label="Cerrar" />
              </div>
            ) : null}
            {paneles}
            {lado && !tactil ? (
              <aside className="flex w-[300px] shrink-0 flex-col border-l border-borde bg-superficie max-md:hidden">
                <div className="flex gap-1 border-b border-borde p-1.5">
                  {(["comandos", "historial", "2fa"] as const).map((l) => (
                    <button key={l} type="button" onClick={() => setLado(l)} className={cx("h-8 flex-1 rounded-lg text-xs font-medium", lado === l ? "bg-tarjeta text-texto" : "text-tenue")}>
                      {l === "comandos" ? "Comandos" : l === "historial" ? "Historial" : "2FA"}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">{contenidoLado(lado)}</div>
              </aside>
            ) : null}
          </div>
          {!tactil || cajaVisible ? (
            <CajaComando enviar={enviarTodas} servidorId={servidorActivo?.id ?? null} texto={texto} setTexto={setTexto} mods={mods} setMods={setMods} entrada={caja} tactil={tactil} />
          ) : null}
          {tactil ? (
            <BarraTeclas
              enviar={enviarTodas}
              mods={mods}
              setMods={setMods}
              panel={panelBarra}
              setPanel={setPanelBarra}
              cajaVisible={cajaVisible}
              alCaja={() => setCajaVisible((v) => !v)}
              alTeclado={() => {
                // Abre el teclado escribiendo directo en la terminal activa.
                const cuadro = document.querySelector<HTMLTextAreaElement>(`textarea[data-terminal="${activa ?? ""}"]`);
                if (cuadro) return cuadro.focus({ preventScroll: true });
                setCajaVisible(true);
                requestAnimationFrame(() => caja.current?.focus());
              }}
              alPegar={() => void pegar()}
              contenidoPanel={contenidoLado(panelBarra === "teclas" ? null : panelBarra)}
            />
          ) : (
            <div className="flex h-7 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-borde bg-superficie px-3 font-mono text-[11px] text-tenue">
              <span className="flex items-center gap-1.5">
                <span className={cx("h-2 w-2 rounded-full", pestanaActiva ? "bg-ok" : "bg-tenue")} />
                {pestanaActiva ? (pestanaActiva.tipo === "ssh" ? `${pestanaActiva.servidor.nombre} · ${pestanaActiva.servidor.usuario}@${pestanaActiva.servidor.host}` : `${pestanaActiva.nombre} · esta PC`) : "Sin sesión"}
              </span>
              {enLasDos && partida ? <span className="text-aviso">Escribiendo en las 2</span> : null}
              <span className="ml-auto">Ctrl K: comandos y acciones</span>
              <span className="max-md:hidden">UTF-8</span>
            </div>
          )}
        </div>
      ) : null}
      <Paleta abierta={paleta} alCerrar={() => setPaleta(false)} opciones={opcionesPaleta} />
      <Modal abierto={enlace !== null} titulo="Enlace de la terminal" alCerrar={() => setEnlace(null)}>
        {enlace ? (
          <div className="space-y-3">
            <p className="break-all rounded-xl bg-fondo p-3 font-mono text-xs">{enlace}</p>
            <div className="flex flex-wrap gap-2">
              <Boton variante="primario" icono={ExternalLink} onClick={() => (abrirExterno(enlace), setEnlace(null))}>
                Abrir
              </Boton>
              <Boton icono={Copy} onClick={() => (copiar(enlace, "Enlace copiado"), setEnlace(null))}>
                Copiar enlace
              </Boton>
              <Boton variante="fantasma" onClick={() => setEnlace(null)}>
                Cancelar
              </Boton>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal abierto={verCodigos} titulo="Escribir un código 2FA en la terminal" alCerrar={() => setVerCodigos(false)}>
        {verCodigos ? (
          <Desbloqueo>
            <CodigosParaTerminal
              alElegir={(codigo) => {
                enviarActiva?.(`${codigo}\r`);
                setVerCodigos(false);
                avisar("Código enviado a la terminal", "info");
              }}
            />
          </Desbloqueo>
        ) : null}
      </Modal>
      <Modal abierto={editando !== null} titulo={editando === "nuevo" ? "Nuevo servidor" : "Editar servidor"} alCerrar={() => setEditando(null)}>
        {editando !== null ? <FormularioServidor inicial={editando === "nuevo" ? null : editando} alTerminar={() => setEditando(null)} /> : null}
      </Modal>
    </div>
  );
}
