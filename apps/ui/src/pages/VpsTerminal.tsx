/**
 * Terminal tipo Termius: lista de servidores, pestañas y xterm.js sobre el
 * WebSocket. Pegar con Ctrl+V o clic derecho, copiar lo seleccionado, barra
 * de comandos con "/nombre" para ejecutar comandos guardados, historial de
 * comandos sincronizado y tema/fuente de Ajustes → Terminal.
 */
import "@xterm/xterm/css/xterm.css";
import { analizarComando } from "@mi-setup/shared";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardPaste, Eye, EyeOff, History, KeyRound, Pencil, Plug, Plus, Send, Server, ShieldAlert, TerminalSquare, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Punto, Selector, Vacio, avisar, avisarError, cx } from "../components/ui";
import { Desbloqueo } from "../components/Desbloqueo";
import { api, ApiError } from "../lib/api";
import { useElementos } from "../lib/boveda/estado";
import { codigoTotp, type CuentaTotp } from "../lib/boveda/totp";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { esMovil } from "../lib/plataforma";
import { opcionesTerminal, usePreferencias } from "../lib/preferencias";
import { pedirReauth } from "../lib/reauth";
import { tiempoReal } from "../lib/tiempo-real";
import { useServidores, type Servidor } from "../lib/vps";

function base64aBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

interface ComandoGuardado {
  id: string;
  nombre: string;
  comando: string;
  descripcion: string;
  peligroso: boolean;
}

interface EntradaHistorial {
  servidorId: string;
  comando: string;
  fecha: string;
}

/** Guarda en el historial (sin esperar; un fallo no interrumpe la terminal). */
function anotar(servidorId: string, comando: string) {
  const c = comando.trim();
  if (!c) return;
  void api("/api/vps/historial", { metodo: "POST", cuerpo: { servidorId, comando: c } })
    .then(() => queryClient.invalidateQueries({ queryKey: ["vps", "historial"] }))
    .catch(() => undefined);
}

/** Pestañas que el usuario cerró con la X: esas sí cierran la sesión SSH; las demás solo se sueltan. */
const cierresExplicitos = new Set<string>();

function Consola({
  clave,
  servidor,
  sesionInicial,
  visible,
  registrar,
  alId,
}: {
  clave: string;
  servidor: Servidor;
  /** Sesión que ya existe en el servidor (se retoma en vez de abrir otra). */
  sesionInicial?: string;
  visible: boolean;
  /** Entrega al padre una función para escribir en esta sesión (barra de comandos). */
  registrar: (enviar: ((texto: string) => void) | null) => void;
  alId: (id: string) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const ajuste = useRef<FitAddon | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const prefs = usePreferencias();
  const opciones = opcionesTerminal(prefs);
  const opcionesIniciales = useRef(opciones);

  useEffect(() => {
    const contenedor = caja.current;
    if (!contenedor) return;
    // En el celular el teclado (Gboard, Samsung…) autocompleta y xterm duplica el texto:
    // ahí se escribe desde la barra de abajo y la terminal solo muestra.
    const movil = esMovil();
    const term = new Terminal({ ...opcionesIniciales.current, cursorBlink: true, disableStdin: movil });
    terminal.current = term;
    const fit = new FitAddon();
    ajuste.current = fit;
    term.loadAddon(fit);
    term.open(contenedor);
    if (movil) term.textarea?.setAttribute("inputmode", "none");
    fit.fit();

    const pegar = async () => {
      const texto = await navigator.clipboard.readText().catch(() => "");
      if (texto) term.paste(texto);
      else avisar("No hay texto en el portapapeles (o no se dio permiso para leerlo)", "info");
    };
    // Ctrl+V / Ctrl+Shift+V pegan; Ctrl+C copia si hay texto seleccionado (si no, va al servidor como siempre).
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const tecla = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && tecla === "v") {
        e.preventDefault();
        void pegar();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && tecla === "c" && (e.shiftKey || term.hasSelection())) {
        void navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
        return false;
      }
      return true;
    });
    // Clic derecho: copia si hay selección; si no, pega.
    const menu = (e: MouseEvent) => {
      e.preventDefault();
      if (term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
        avisar("Copiado", "info");
      } else void pegar();
    };
    contenedor.addEventListener("contextmenu", menu);

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
    const entrada = term.onData((datos) => {
      if (id) tiempoReal.enviar({ tipo: "terminal.entrada", id, datos });
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
    });
    registrar((texto) => {
      if (id) tiempoReal.enviar({ tipo: "terminal.entrada", id, datos: texto });
      if (!movil) term.focus();
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
      contenedor.removeEventListener("contextmenu", menu);
      entrada.dispose();
      tamano.dispose();
      observador.disconnect();
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

  return <div ref={caja} className={cx("h-full w-full p-1", !visible && "hidden")} style={{ background: opciones.theme.background }} />;
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

/** Teclas especiales para el celular (la terminal no recibe el teclado ahí). */
const TECLAS: [string, string][] = [
  ["Enter", "\r"],
  ["Tab", "\t"],
  ["Esc", "\x1b"],
  ["Ctrl+C", "\x03"],
  ["↑", "\x1b[A"],
  ["↓", "\x1b[B"],
  ["←", "\x1b[D"],
  ["→", "\x1b[C"],
  ["Borrar", "\x7f"],
  ["Ctrl+D", "\x04"],
];

const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");

/** Barra de comandos: escribe un comando o "/nombre" de un comando guardado y Enter lo ejecuta en la pestaña activa. */
function BarraComandos({ enviar, servidorId, texto, setTexto }: { enviar: ((t: string) => void) | null; servidorId: string | null; texto: string; setTexto: (t: string) => void }) {
  const puedeComandos = usePuede("vps_comandos", "lectura");
  const [oculto, setOculto] = useState(false);
  const movil = esMovil();
  const comandos = useQuery({ queryKey: ["vps", "comandos"], queryFn: () => api<ComandoGuardado[]>("/api/vps/comandos"), enabled: puedeComandos });
  const busqueda = texto.startsWith("/") ? normalizar(texto.slice(1)) : null;
  const sugerencias = busqueda !== null ? (comandos.data ?? []).filter((c) => normalizar(c.nombre).includes(busqueda)).slice(0, 6) : [];

  const ejecutar = async (comando: string, nombre?: string) => {
    if (!enviar || !servidorId) return avisar("Abre primero una sesión de terminal", "info");
    const analisis = analizarComando(comando);
    if (analisis.peligroso) {
      const ok = await confirmar({
        titulo: "Comando peligroso",
        mensaje: analisis.motivos.join(" · "),
        detalle: comando,
        peligroso: true,
        textoExacto: nombre ?? "EJECUTAR",
        boton: "Ejecutar",
      });
      if (!ok) return;
    }
    enviar(`${comando}\r`);
    // Lo escrito en modo oculto (contraseñas) nunca va al historial.
    if (!oculto) anotar(servidorId, comando);
    setTexto("");
    setOculto(false);
  };

  const alEnviar = async (e: FormEvent) => {
    e.preventDefault();
    if (busqueda !== null) {
      const exacto = (comandos.data ?? []).find((c) => normalizar(c.nombre) === busqueda) ?? sugerencias[0];
      if (!exacto) return avisar(`No hay un comando guardado que se llame "${texto.slice(1)}"`, "error");
      await ejecutar(exacto.comando, exacto.nombre);
      return;
    }
    if (oculto) {
      // Contraseña o respuesta a un script: se manda tal cual, sin revisar ni guardar.
      if (!enviar) return;
      enviar(`${texto}\r`);
      setTexto("");
      setOculto(false);
      return;
    }
    if (texto.trim()) await ejecutar(texto);
    // En el celular, Enter con la barra vacía manda un Enter (p. ej. "Presiona ENTER para continuar").
    else if (movil && enviar) enviar("\r");
  };

  return (
    <div className="relative border-t border-borde bg-superficie p-2">
      {sugerencias.length > 0 ? (
        <div className="absolute bottom-full left-2 right-2 mb-1 overflow-hidden rounded-xl border border-borde bg-superficie shadow-2xl">
          {sugerencias.map((c) => (
            <button key={c.id} type="button" onClick={() => void ejecutar(c.comando, c.nombre)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-tarjeta">
              <span className="font-medium">/{normalizar(c.nombre)}</span>
              {c.peligroso ? <Insignia tono="peligro">peligroso</Insignia> : null}
              <span className="truncate font-mono text-tenue">{c.comando}</span>
            </button>
          ))}
        </div>
      ) : null}
      {movil ? (
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {TECLAS.map(([etiqueta, secuencia]) => (
            <button
              key={etiqueta}
              type="button"
              disabled={!enviar}
              onClick={() => enviar?.(secuencia)}
              className="shrink-0 rounded-lg border border-borde bg-fondo px-3 py-1.5 font-mono text-xs disabled:opacity-50"
            >
              {etiqueta}
            </button>
          ))}
        </div>
      ) : null}
      <form className="flex gap-2" onSubmit={(e) => void alEnviar(e)}>
        <Boton
          tamano="icono"
          variante={oculto ? "primario" : "secundario"}
          icono={oculto ? EyeOff : Eye}
          onClick={() => setOculto((v) => !v)}
          aria-label={oculto ? "Modo oculto activado" : "Escribir oculto (contraseñas)"}
          title="Modo oculto: para contraseñas; no se muestra ni se guarda en el historial"
        />
        <Entrada
          value={texto}
          type={oculto ? "password" : "text"}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={oculto ? "Contraseña o respuesta (oculta)" : movil ? "Escribe aquí y pulsa Enter" : "Escribe un comando o /nombre de un comando guardado y pulsa Enter"}
          className="h-9 font-mono text-xs"
          disabled={!enviar}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
        <Boton type="submit" tamano="icono" icono={Send} aria-label="Ejecutar" disabled={!enviar || (!movil && !texto.trim())} />
      </form>
    </div>
  );
}

function Historial({ servidorId, alElegir }: { servidorId: string | null; alElegir: (comando: string) => void }) {
  const historial = useQuery({
    queryKey: ["vps", "historial", servidorId],
    queryFn: () => api<EntradaHistorial[]>(`/api/vps/historial${servidorId ? `?servidorId=${servidorId}` : ""}`),
  });
  const borrar = useMutation({
    mutationFn: () => api("/api/vps/historial", { metodo: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["vps", "historial"] }),
    onError: avisarError,
  });
  const lista = historial.data ?? [];
  return (
    <div className="rounded-tarjeta border border-borde bg-superficie p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4 text-tenue" /> Historial {servidorId ? "de esta sesión" : ""}
        </p>
        {lista.length ? (
          <Boton
            tamano="sm"
            variante="fantasma"
            onClick={async () => {
              if (await confirmar({ titulo: "Borrar historial", mensaje: "Se borra el historial de todos tus servidores." })) borrar.mutate();
            }}
          >
            Borrar
          </Boton>
        ) : null}
      </div>
      {lista.length === 0 ? <p className="text-xs text-tenue">Aquí aparecen los comandos que ejecutas. Tócalos para usarlos de nuevo.</p> : null}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {lista.slice(0, 100).map((h) => (
          <button
            key={`${h.fecha}-${h.comando}`}
            type="button"
            onClick={() => alElegir(h.comando)}
            className="block w-full truncate rounded-lg px-2 py-1 text-left font-mono text-xs hover:bg-tarjeta"
            title={`${h.comando} · ${haceCuanto(h.fecha)}`}
          >
            {h.comando}
          </button>
        ))}
      </div>
    </div>
  );
}

const VACIO = { nombre: "", host: "", puerto: 22, usuario: "root", tipo: "llave" as "llave" | "password", secreto: "", frase: "", alertas: true };

function FormularioServidor({ inicial, alTerminar }: { inicial: Servidor | null; alTerminar: () => void }) {
  const [d, setD] = useState(inicial ? { ...VACIO, ...inicial, secreto: "", frase: "" } : VACIO);
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { nombre: d.nombre, host: d.host, puerto: Number(d.puerto), usuario: d.usuario, tipo: d.tipo, alertas: d.alertas, ...(d.secreto ? { secreto: d.secreto } : {}), ...(d.frase ? { frase: d.frase } : {}) };
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
      <Campo etiqueta="Autenticación">
        <Selector value={d.tipo} onChange={(e) => set("tipo", e.target.value as "llave" | "password")}>
          <option value="llave">Llave SSH (recomendado)</option>
          <option value="password">Contraseña</option>
        </Selector>
      </Campo>
      {d.tipo === "llave" ? (
        <>
          <Campo etiqueta="Llave privada" ayuda={inicial ? "Déjala vacía para conservar la actual." : "Se guarda cifrada en el servidor y nunca se vuelve a mostrar."}>
            <AreaTexto value={d.secreto} onChange={(e) => set("secreto", e.target.value)} className="font-mono text-xs" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
          </Campo>
          <Campo etiqueta="Frase de la llave (si tiene)">
            <Entrada type="password" value={d.frase} onChange={(e) => set("frase", e.target.value)} autoComplete="off" />
          </Campo>
        </>
      ) : (
        <Campo etiqueta="Contraseña" ayuda={inicial ? "Déjala vacía para conservar la actual." : undefined}>
          <Entrada type="password" value={d.secreto} onChange={(e) => set("secreto", e.target.value)} autoComplete="off" />
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

export default function VpsTerminal() {
  const { data, isLoading, error } = useServidores();
  const esAdmin = usePuede("vps_terminal", "administrar");
  const [pestanas, setPestanas] = useState<{ clave: string; servidor: Servidor; sesion?: string }[]>([]);
  const [verCodigos, setVerCodigos] = useState(false);
  /** ids de sesión ya mostradas en una pestaña (para no duplicarlas al retomar). */
  const conocidas = useRef(new Set<string>());

  // Al entrar a Terminal se piden las sesiones que siguen abiertas en el servidor y se retoman.
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
              return { clave: crypto.randomUUID(), servidor, sesion: s.id };
            });
          if (agregar.length) setActiva((a) => a ?? agregar[0]!.clave);
          return [...p, ...agregar];
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [data]);
  const [activa, setActiva] = useState<string | null>(null);
  const [editando, setEditando] = useState<Servidor | null | "nuevo">(null);
  const [texto, setTexto] = useState("");
  const enviadores = useRef(new Map<string, (t: string) => void>());
  const [, refrescar] = useState(0);

  // Una función de registro estable por pestaña (si cambiara, la consola se reconectaría).
  const registros = useRef(new Map<string, (enviar: ((t: string) => void) | null) => void>());
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

  const abrir = (servidor: Servidor) => {
    const clave = crypto.randomUUID();
    setPestanas((p) => [...p, { clave, servidor }]);
    setActiva(clave);
  };
  const cerrar = (clave: string) => {
    // La X sí termina la sesión SSH (cambiar de pantalla solo la deja en pausa).
    cierresExplicitos.add(clave);
    registros.current.delete(clave);
    setPestanas((p) => {
      const resto = p.filter((x) => x.clave !== clave);
      if (activa === clave) setActiva(resto.at(-1)?.clave ?? null);
      return resto;
    });
  };
  const pestanaActiva = pestanas.find((p) => p.clave === activa) ?? null;
  const enviarActiva = activa ? (enviadores.current.get(activa) ?? null) : null;

  const pegar = async () => {
    const t = await navigator.clipboard.readText().catch(() => "");
    if (!t) return avisar("No hay texto en el portapapeles", "info");
    if (enviarActiva) enviarActiva(t);
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

  return (
    <>
      <Encabezado
        titulo="Terminal"
        descripcion="Sesiones SSH desde el servidor de Mi Setup. Pega con Ctrl+V o clic derecho; escribe /nombre para un comando guardado. Root pide confirmar tu identidad."
        acciones={esAdmin ? <Boton variante="primario" icono={Plus} onClick={() => setEditando("nuevo")}>Servidor</Boton> : null}
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {data?.length === 0 ? <Vacio icono={Server} texto="Agrega tu VPS con su llave SSH." /> : null}
          {data?.map((s) => (
            <div key={s.id} className="rounded-tarjeta border border-borde bg-superficie p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {s.nombre} {s.esRoot ? <Insignia tono="aviso">root</Insignia> : null}
                  </p>
                  <p className="truncate text-xs text-tenue">
                    {s.usuario}@{s.host}:{s.puerto}
                  </p>
                </div>
                <Punto conectado={s.estado === "arriba"} />
              </div>
              {!s.huella ? <p className="mt-2 flex items-center gap-1 text-[11px] text-tenue"><ShieldAlert className="h-3 w-3" /> La huella se acepta en la primera conexión.</p> : null}
              <div className="mt-3 flex flex-wrap gap-1">
                <Boton tamano="sm" variante="primario" icono={TerminalSquare} onClick={() => abrir(s)}>Abrir</Boton>
                <Boton tamano="sm" icono={Plug} onClick={() => void probar(s)}>Probar</Boton>
                {esAdmin ? (
                  <>
                    <Boton tamano="icono" variante="fantasma" icono={Pencil} onClick={() => setEditando(s)} aria-label="Editar" />
                    <Boton tamano="icono" variante="fantasma" icono={Trash2} onClick={() => void borrar(s)} aria-label="Quitar" />
                  </>
                ) : null}
              </div>
            </div>
          ))}
          <Historial servidorId={pestanaActiva?.servidor.id ?? null} alElegir={setTexto} />
        </div>
        <div className="flex h-[72vh] min-h-96 flex-col overflow-hidden rounded-tarjeta border border-borde bg-fondo">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-borde bg-superficie p-1">
            {pestanas.map((p) => (
              <div key={p.clave} className={cx("flex items-center gap-1 rounded-lg pl-3 text-xs", activa === p.clave ? "bg-tarjeta" : "text-tenue")}>
                <button type="button" onClick={() => setActiva(p.clave)} className="py-1.5">{p.servidor.nombre}</button>
                <button type="button" onClick={() => cerrar(p.clave)} className="p-1.5 hover:text-texto" aria-label="Cerrar pestaña">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {pestanas.length === 0 ? <span className="px-3 py-1.5 text-xs text-tenue">Sin sesiones abiertas</span> : null}
            {enviarActiva ? (
              <>
                <Boton tamano="sm" variante="fantasma" icono={KeyRound} className="ml-auto" onClick={() => setVerCodigos(true)}>
                  2FA
                </Boton>
                <Boton tamano="sm" variante="fantasma" icono={ClipboardPaste} onClick={() => void pegar()}>
                  Pegar
                </Boton>
              </>
            ) : null}
          </div>
          <div className="relative min-h-0 flex-1">
            {pestanas.map((p) => (
              <div key={p.clave} className={cx("absolute inset-0", activa !== p.clave && "pointer-events-none opacity-0")}>
                <Consola
                  clave={p.clave}
                  servidor={p.servidor}
                  {...(p.sesion ? { sesionInicial: p.sesion } : {})}
                  visible={activa === p.clave}
                  registrar={registroDe(p.clave)}
                  alId={(id) => conocidas.current.add(id)}
                />
              </div>
            ))}
            {pestanas.length === 0 ? <Vacio icono={TerminalSquare} texto="Elige un servidor y pulsa Abrir." /> : null}
          </div>
          <BarraComandos enviar={enviarActiva} servidorId={pestanaActiva?.servidor.id ?? null} texto={texto} setTexto={setTexto} />
        </div>
      </div>
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
    </>
  );
}
