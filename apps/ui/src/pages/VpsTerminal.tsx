/** Terminal tipo Termius: lista de servidores, pestañas y xterm.js sobre el WebSocket. */
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plug, Plus, Server, ShieldAlert, TerminalSquare, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Punto, Selector, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { pedirReauth } from "../lib/reauth";
import { tiempoReal } from "../lib/tiempo-real";
import { useServidores, type Servidor } from "../lib/vps";

function base64aBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function Consola({ servidor, visible }: { servidor: Servidor; visible: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const ajuste = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!caja.current) return;
    const term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: { background: "#121212", foreground: "#F2F2F7", cursor: "#E5E5EA", selectionBackground: "#48484A" },
    });
    const fit = new FitAddon();
    ajuste.current = fit;
    term.loadAddon(fit);
    term.open(caja.current);
    fit.fit();

    const ref = crypto.randomUUID();
    let id: string | null = null;
    let reintento = false;
    const abrir = () => {
      term.writeln(`\x1b[90mConectando a ${servidor.usuario}@${servidor.host}…\x1b[0m`);
      if (!tiempoReal.enviar({ tipo: "terminal.abrir", ref, servidorId: servidor.id, cols: term.cols, rows: term.rows })) {
        term.writeln("\x1b[31mSin conexión en tiempo real. Reintenta en unos segundos.\x1b[0m");
      }
    };
    const offs = [
      tiempoReal.on("terminal.abierta", (m) => {
        if (m.ref === ref) id = m.id;
      }),
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
    const entrada = term.onData((datos) => {
      if (id) tiempoReal.enviar({ tipo: "terminal.entrada", id, datos });
    });
    const tamano = term.onResize(({ cols, rows }) => {
      if (id) tiempoReal.enviar({ tipo: "terminal.tamano", id, cols, rows });
    });
    const observador = new ResizeObserver(() => fit.fit());
    observador.observe(caja.current);
    abrir();

    return () => {
      if (id) tiempoReal.enviar({ tipo: "terminal.cerrar", id });
      offs.forEach((off) => off());
      entrada.dispose();
      tamano.dispose();
      observador.disconnect();
      term.dispose();
    };
  }, [servidor.id, servidor.host, servidor.usuario]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => ajuste.current?.fit());
  }, [visible]);

  return <div ref={caja} className={cx("h-full w-full", !visible && "hidden")} />;
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
      <div className="grid gap-3 sm:grid-cols-2">
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
  const [pestanas, setPestanas] = useState<{ clave: string; servidor: Servidor }[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [editando, setEditando] = useState<Servidor | null | "nuevo">(null);

  const abrir = (servidor: Servidor) => {
    const clave = crypto.randomUUID();
    setPestanas((p) => [...p, { clave, servidor }]);
    setActiva(clave);
  };
  const cerrar = (clave: string) => {
    setPestanas((p) => {
      const resto = p.filter((x) => x.clave !== clave);
      if (activa === clave) setActiva(resto.at(-1)?.clave ?? null);
      return resto;
    });
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
        descripcion="Sesiones SSH desde el servidor de Mi Setup. Root pide confirmar tu identidad."
        acciones={esAdmin ? <Boton variante="primario" icono={Plus} onClick={() => setEditando("nuevo")}>Servidor</Boton> : null}
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
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
        </div>
        <div className="flex h-[70vh] min-h-96 flex-col overflow-hidden rounded-tarjeta border border-borde bg-fondo">
          <div className="flex gap-1 overflow-x-auto border-b border-borde bg-superficie p-1">
            {pestanas.map((p) => (
              <div key={p.clave} className={cx("flex items-center gap-1 rounded-lg pl-3 text-xs", activa === p.clave ? "bg-tarjeta" : "text-tenue")}>
                <button type="button" onClick={() => setActiva(p.clave)} className="py-1.5">{p.servidor.nombre}</button>
                <button type="button" onClick={() => cerrar(p.clave)} className="p-1.5 hover:text-texto" aria-label="Cerrar pestaña">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {pestanas.length === 0 ? <span className="px-3 py-1.5 text-xs text-tenue">Sin sesiones abiertas</span> : null}
          </div>
          <div className="relative min-h-0 flex-1">
            {pestanas.map((p) => (
              <div key={p.clave} className={cx("absolute inset-0", activa !== p.clave && "pointer-events-none opacity-0")}>
                <Consola servidor={p.servidor} visible={activa === p.clave} />
              </div>
            ))}
            {pestanas.length === 0 ? <Vacio icono={TerminalSquare} texto="Elige un servidor y pulsa Abrir." /> : null}
          </div>
        </div>
      </div>
      <Modal abierto={editando !== null} titulo={editando === "nuevo" ? "Nuevo servidor" : "Editar servidor"} alCerrar={() => setEditando(null)}>
        {editando !== null ? <FormularioServidor inicial={editando === "nuevo" ? null : editando} alTerminar={() => setEditando(null)} /> : null}
      </Modal>
    </>
  );
}
