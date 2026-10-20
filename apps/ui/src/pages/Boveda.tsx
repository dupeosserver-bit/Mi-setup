/** Gestor de contraseñas (cifrado de extremo a extremo). */
import { useMutation } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Eye, EyeOff, Folder, History, KeyRound, Lock, Pencil, Plus, RefreshCw, Search, ShieldCheck, StickyNote, Trash2, Upload, Wand2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { registerPlugin } from "@capacitor/core";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AVISO_SIN_RECUPERACION, Desbloqueo, MedidorFortaleza } from "../components/Desbloqueo";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { vecesFiltrada } from "./Ciberseguridad";
import { api } from "../lib/api";
import { cifrar, contextoDe } from "../lib/boveda/cripto";
import { leerColeccion, recargarElementos, useBoveda, useConfigBoveda, useElementos, type Elemento } from "../lib/boveda/estado";
import { generarContrasena, OPCIONES_POR_DEFECTO, SIMBOLOS_POR_DEFECTO, type OpcionesGenerador } from "../lib/boveda/generador";
import { cambiarClaveMaestra, copiarSeguro, exportar, importar } from "../lib/boveda/utilidades";
import { activarApertura, aperturaRapida, quitarApertura } from "../lib/boveda/rapida";
import { biometriaSoportada } from "../lib/biometria";
import { esMovil } from "../lib/plataforma";
import { confirmar } from "../lib/confirmar";
import { usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";

interface Datos {
  nombre: string;
  usuario?: string;
  contrasena?: string;
  url?: string;
  notas: string;
  carpeta: string;
}

type Item = Elemento<Datos>;

const MAX_HISTORIAL = 10;

interface Generada {
  contrasena: string;
  fecha: string;
  para?: string;
}

/** Guarda una contraseña generada en el historial cifrado y deja solo las últimas 10. */
async function guardarGenerada(clave: Uint8Array, contrasena: string, para?: string): Promise<void> {
  const valor: Generada = { contrasena, fecha: new Date().toISOString(), ...(para ? { para } : {}) };
  await api("/api/boveda/items", { cuerpo: { tipo: "generada", datos: await cifrar(clave, valor, contextoDe("generada")) } });
  const todas = (await leerColeccion<Generada>("boveda", clave)).filter((e) => e.tipo === "generada").sort((a, b) => b.valor.fecha.localeCompare(a.valor.fecha));
  for (const vieja of todas.slice(MAX_HISTORIAL)) await api(`/api/boveda/items/${vieja.id}`, { metodo: "DELETE" }).catch(() => undefined);
  await recargarElementos();
}

function Generador({ alUsar, botonUsar = "Usar esta contraseña" }: { alUsar?: (c: string) => void; botonUsar?: string }) {
  const clave = useBoveda((s) => s.clave);
  const [o, setO] = useState<OpcionesGenerador>(OPCIONES_POR_DEFECTO);
  const [valor, setValor] = useState(() => generarContrasena(OPCIONES_POR_DEFECTO));
  const [para, setPara] = useState("");
  const regenerar = (n: OpcionesGenerador) => {
    setO(n);
    try {
      setValor(generarContrasena(n));
    } catch (err) {
      avisarError(err);
    }
  };
  const recordar = () => {
    if (clave) void guardarGenerada(clave, valor, para.trim() || undefined).catch(() => undefined);
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Entrada value={valor} readOnly className="font-mono" />
        <Boton tamano="icono" icono={RefreshCw} onClick={() => regenerar(o)} aria-label="Generar otra" />
        <Boton
          tamano="icono"
          icono={Copy}
          aria-label="Copiar"
          onClick={() => {
            void copiarSeguro(valor, "Contraseña copiada").catch(avisarError);
            recordar();
          }}
        />
      </div>
      <MedidorFortaleza clave={valor} />
      <Campo etiqueta={`Longitud: ${o.longitud} caracteres`}>
        <input type="range" min={8} max={128} value={o.longitud} onChange={(e) => regenerar({ ...o, longitud: Number(e.target.value) })} className="w-full" />
      </Campo>
      <div className="grid grid-cols-2 gap-2">
        {([
          ["mayusculas", "Mayúsculas (A-Z)"],
          ["minusculas", "Minúsculas (a-z)"],
          ["numeros", "Números (0-9)"],
          ["simbolos", "Símbolos"],
          ["sinAmbiguos", "Sin ambiguos (l, 1, O, 0)"],
        ] as const).map(([k, t]) => (
          <Interruptor key={k} activo={o[k]} alCambiar={(v) => regenerar({ ...o, [k]: v })} etiqueta={t} />
        ))}
      </div>
      {o.simbolos ? (
        <Campo etiqueta="Símbolos permitidos" ayuda="Quita los que el sitio no acepte.">
          <div className="flex gap-2">
            <Entrada value={o.simbolosTexto} onChange={(e) => regenerar({ ...o, simbolosTexto: e.target.value })} className="font-mono" />
            <Boton tamano="sm" variante="fantasma" onClick={() => regenerar({ ...o, simbolosTexto: SIMBOLOS_POR_DEFECTO })}>
              Todos
            </Boton>
          </div>
        </Campo>
      ) : null}
      <Campo etiqueta="¿Para qué es? (opcional, se guarda en el historial)">
        <Entrada value={para} onChange={(e) => setPara(e.target.value)} placeholder="Ej. cuenta de Steam" />
      </Campo>
      {clave ? (
        <p className="text-xs text-tenue">Cada contraseña que copies o uses se guarda cifrada en el historial (las últimas {MAX_HISTORIAL}).</p>
      ) : (
        <p className="text-xs text-aviso">La bóveda está bloqueada: esta contraseña no se guardará en el historial. Ábrela en "Mis contraseñas" para guardarlas.</p>
      )}
      {alUsar ? (
        <Boton
          variante="primario"
          className="w-full"
          icono={Wand2}
          onClick={() => {
            recordar();
            alUsar(valor);
          }}
        >
          {botonUsar}
        </Boton>
      ) : null}
    </div>
  );
}

function HistorialGeneradas() {
  const { data, isLoading } = useElementos<Generada>("boveda");
  const [ver, setVer] = useState<string | null>(null);
  const lista = (data ?? []).filter((e) => e.tipo === "generada").sort((a, b) => b.valor.fecha.localeCompare(a.valor.fecha));
  if (isLoading) return <Cargando texto="Descifrando…" />;
  return (
    <Tarjeta titulo={`Últimas ${MAX_HISTORIAL} contraseñas generadas`} icono={History}>
      {lista.length === 0 ? <Vacio texto="Aún no has generado contraseñas. Ve a la pestaña Generador." /> : null}
      <div className="space-y-2">
        {lista.map((g) => (
          <div key={g.id} className="flex items-center gap-2 rounded-xl bg-fondo p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm">{ver === g.id ? g.valor.contrasena : "••••••••••••••••"}</p>
              <p className="text-xs text-tenue">
                {g.valor.para ? `${g.valor.para} · ` : ""}
                {new Date(g.valor.fecha).toLocaleString("es-MX")}
              </p>
            </div>
            <Boton tamano="icono" variante="fantasma" icono={ver === g.id ? EyeOff : Eye} onClick={() => setVer(ver === g.id ? null : g.id)} aria-label="Mostrar u ocultar" />
            <Boton tamano="icono" variante="fantasma" icono={Copy} onClick={() => void copiarSeguro(g.valor.contrasena, "Contraseña copiada").catch(avisarError)} aria-label="Copiar" />
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={Trash2}
              aria-label="Borrar"
              onClick={async () => {
                await api(`/api/boveda/items/${g.id}`, { metodo: "DELETE" }).catch(avisarError);
                await recargarElementos();
              }}
            />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-tenue">Si una contraseña ya la usaste en un sitio, guárdala como elemento en "Mis contraseñas" para no perderla cuando salga del historial.</p>
    </Tarjeta>
  );
}

function Editor({ inicial, carpetas, alTerminar }: { inicial: Item | null; carpetas: string[]; alTerminar: () => void }) {
  const clave = useBoveda((s) => s.clave);
  const [tipo, setTipo] = useState<"login" | "nota">((inicial?.tipo as "login" | "nota") ?? "login");
  const [d, setD] = useState<Datos>(inicial?.valor ?? { nombre: "", usuario: "", contrasena: "", url: "", notas: "", carpeta: "" });
  const [ver, setVer] = useState(false);
  const [generador, setGenerador] = useState(false);
  const guardar = useMutation({
    mutationFn: async () => {
      if (!clave) throw new Error("La bóveda se bloqueó");
      const datos = await cifrar(clave, tipo === "nota" ? { nombre: d.nombre, notas: d.notas, carpeta: d.carpeta } : d, contextoDe(tipo));
      if (inicial) await api(`/api/boveda/items/${inicial.id}`, { metodo: "PUT", cuerpo: { datos } });
      else await api("/api/boveda/items", { cuerpo: { tipo, datos } });
    },
    onSuccess: async () => {
      avisar("Guardado y cifrado");
      await recargarElementos();
      alTerminar();
    },
  });
  const set = (k: keyof Datos, v: string) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => (e.preventDefault(), guardar.mutate())}>
      {!inicial ? (
        <Selector value={tipo} onChange={(e) => setTipo(e.target.value as "login" | "nota")}>
          <option value="login">Inicio de sesión</option>
          <option value="nota">Nota segura</option>
        </Selector>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre">
          <Entrada value={d.nombre} onChange={(e) => set("nombre", e.target.value)} required autoFocus />
        </Campo>
        <Campo etiqueta="Carpeta">
          <Entrada list="carpetas-boveda" value={d.carpeta} onChange={(e) => set("carpeta", e.target.value)} placeholder="Sin carpeta" />
          <datalist id="carpetas-boveda">
            {carpetas.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
      </div>
      {tipo === "login" ? (
        <>
          <Campo etiqueta="Usuario o correo">
            <Entrada value={d.usuario ?? ""} onChange={(e) => set("usuario", e.target.value)} autoComplete="off" />
          </Campo>
          <Campo etiqueta="Contraseña">
            <div className="flex gap-2">
              <Entrada type={ver ? "text" : "password"} value={d.contrasena ?? ""} onChange={(e) => set("contrasena", e.target.value)} autoComplete="new-password" className="font-mono" />
              <Boton tamano="icono" icono={ver ? EyeOff : Eye} onClick={() => setVer((v) => !v)} aria-label="Mostrar u ocultar" />
              <Boton tamano="icono" icono={Wand2} onClick={() => setGenerador(true)} aria-label="Generar" />
            </div>
            <MedidorFortaleza clave={d.contrasena ?? ""} />
          </Campo>
          <Campo etiqueta="Sitio web">
            <Entrada value={d.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
          </Campo>
        </>
      ) : null}
      <Campo etiqueta="Notas">
        <AreaTexto value={d.notas} onChange={(e) => set("notas", e.target.value)} />
      </Campo>
      <ErrorCaja error={guardar.error} />
      <div className="flex justify-end gap-2">
        <Boton variante="fantasma" onClick={alTerminar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={guardar.isPending}>Guardar</Boton>
      </div>
      <Modal abierto={generador} titulo="Generar contraseña" alCerrar={() => setGenerador(false)}>
        <Generador
          alUsar={(c) => {
            set("contrasena", c);
            setVer(true);
            setGenerador(false);
          }}
        />
      </Modal>
    </form>
  );
}

function Detalle({ item, puede, alEditar }: { item: Item; puede: boolean; alEditar: () => void }) {
  const [ver, setVer] = useState(false);
  const v = item.valor;
  const fila = (etiqueta: string, valor: string | undefined, secreto = false) =>
    valor ? (
      <div className="flex items-center gap-2 rounded-xl bg-fondo p-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-tenue">{etiqueta}</p>
          <p className={cx("truncate text-sm", secreto && "font-mono")}>{secreto && !ver ? "••••••••••••" : valor}</p>
        </div>
        {secreto ? <Boton tamano="icono" variante="fantasma" icono={ver ? EyeOff : Eye} onClick={() => setVer((x) => !x)} aria-label="Mostrar u ocultar" /> : null}
        <Boton tamano="icono" variante="fantasma" icono={Copy} onClick={() => void copiarSeguro(valor, `${etiqueta} copiado`).catch(avisarError)} aria-label={`Copiar ${etiqueta}`} />
      </div>
    ) : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 truncate text-lg font-semibold">{v.nombre}</h2>
        {v.url ? <Boton tamano="icono" variante="fantasma" icono={ExternalLink} onClick={() => abrirExterno(v.url!.startsWith("http") ? v.url! : `https://${v.url}`)} aria-label="Abrir sitio" /> : null}
        {puede ? <Boton tamano="icono" variante="fantasma" icono={Pencil} onClick={alEditar} aria-label="Editar" /> : null}
        {puede ? (
          <Boton
            tamano="icono"
            variante="fantasma"
            icono={Trash2}
            aria-label="Borrar"
            onClick={async () => {
              if (!(await confirmar({ titulo: "Borrar", mensaje: `¿Borrar "${v.nombre}" de la bóveda?`, boton: "Borrar" }))) return;
              await api(`/api/boveda/items/${item.id}`, { metodo: "DELETE" }).catch(avisarError);
              await recargarElementos();
            }}
          />
        ) : null}
      </div>
      {fila("Usuario", v.usuario)}
      {fila("Contraseña", v.contrasena, true)}
      {fila("Sitio", v.url)}
      {v.notas ? <p className="whitespace-pre-wrap rounded-xl bg-fondo p-3 text-sm">{v.notas}</p> : null}
    </div>
  );
}

function Herramientas() {
  const config = useConfigBoveda();
  const archivo = useRef<HTMLInputElement>(null);
  const [cambio, setCambio] = useState(false);
  const [nueva, setNueva] = useState({ a: "", b: "" });
  const [importando, setImportando] = useState<string | null>(null);
  const [claveArchivo, setClaveArchivo] = useState("");
  return (
    <>
      <Boton tamano="sm" icono={Download} onClick={() => config.data && void exportar("boveda", config.data).then(() => avisar("Exportado (sigue cifrado)"), avisarError)}>Exportar</Boton>
      <Boton tamano="sm" icono={Upload} onClick={() => archivo.current?.click()}>Importar</Boton>
      <input
        ref={archivo}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void f.text().then(setImportando);
          e.target.value = "";
        }}
      />
      <Boton tamano="sm" icono={KeyRound} onClick={() => setCambio(true)}>Cambiar clave maestra</Boton>
      <AperturaRapidaBoton />
      <Modal abierto={importando !== null} titulo="Importar respaldo cifrado" alCerrar={() => setImportando(null)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void importar("boveda", importando ?? "", claveArchivo)
              .then((n) => {
                avisar(`${n} elementos importados`);
                setImportando(null);
                setClaveArchivo("");
              })
              .catch(avisarError);
          }}
        >
          <Campo etiqueta="Clave maestra con la que se exportó el archivo">
            <Entrada type="password" value={claveArchivo} onChange={(e) => setClaveArchivo(e.target.value)} autoFocus />
          </Campo>
          <Boton type="submit" variante="primario" className="w-full">Importar</Boton>
        </form>
      </Modal>
      <Modal abierto={cambio} titulo="Cambiar clave maestra" alCerrar={() => setCambio(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (nueva.a.length < 12) return avisarError(new Error("Mínimo 12 caracteres"));
            if (nueva.a !== nueva.b) return avisarError(new Error("Las claves no coinciden"));
            void cambiarClaveMaestra(nueva.a)
              .then(() => {
                avisar("Clave maestra cambiada");
                setCambio(false);
                setNueva({ a: "", b: "" });
              })
              .catch(avisarError);
          }}
        >
          <p className="text-xs text-aviso">{AVISO_SIN_RECUPERACION}</p>
          <Campo etiqueta="Nueva clave maestra">
            <Entrada type="password" value={nueva.a} onChange={(e) => setNueva({ ...nueva, a: e.target.value })} />
            <MedidorFortaleza clave={nueva.a} />
          </Campo>
          <Campo etiqueta="Repítela">
            <Entrada type="password" value={nueva.b} onChange={(e) => setNueva({ ...nueva, b: e.target.value })} />
          </Campo>
          <Boton type="submit" variante="primario" className="w-full">Re-cifrar todo con la nueva clave</Boton>
        </form>
      </Modal>
    </>
  );
}

/** Activar o quitar «Abrir con huella» (celular) o «Abrir con mi PIN» (PC) en este dispositivo. */
function AperturaRapidaBoton() {
  const [activa, setActiva] = useState(() => aperturaRapida());
  const [trabajando, setTrabajando] = useState(false);
  const movil = esMovil();
  const activar = async () => {
    setTrabajando(true);
    try {
      const metodo = movil && (await biometriaSoportada()) ? "huella" : "pin";
      await activarApertura(metodo);
      setActiva(aperturaRapida());
      avisar(metodo === "huella" ? "Listo: la próxima vez ábrela con tu huella" : "Listo: la próxima vez ábrela con tu PIN de Mi Setup");
    } catch (err) {
      avisarError(err);
    } finally {
      setTrabajando(false);
    }
  };
  if (activa) {
    return (
      <Boton tamano="sm" icono={Lock} cargando={trabajando} onClick={() => void quitarApertura().then(() => setActiva(null))}>
        Quitar {activa.metodo === "huella" ? "huella" : "PIN"}
      </Boton>
    );
  }
  return (
    <Boton tamano="sm" icono={KeyRound} cargando={trabajando} onClick={() => void activar()} title="Para no escribir la clave maestra cada vez en este dispositivo">
      {movil ? "Abrir con huella" : "Abrir con PIN"}
    </Boton>
  );
}

interface PluginAutorrelleno {
  estado(): Promise<{ soportado: boolean; activo: boolean; entradas: number }>;
  abrirAjustes(): Promise<void>;
  guardar(o: { entradas: { nombre: string; usuario: string; contrasena: string; url: string }[] }): Promise<{ guardadas: number }>;
  borrar(): Promise<void>;
}
const Autorrelleno = registerPlugin<PluginAutorrelleno>("Autorrelleno");
const CLAVE_AUTORRELLENO = "mi-setup.autorrelleno";

/** Las contraseñas de la bóveda (ya descifradas aquí) pasan al autocompletado del celular, cifradas con el almacén seguro de Android. */
async function llevarAlAutocompletado(items: Item[]): Promise<number> {
  const entradas = items
    .filter((i) => i.tipo !== "nota" && i.tipo !== "generada" && i.valor.contrasena)
    .map((i) => ({ nombre: i.valor.nombre, usuario: i.valor.usuario ?? "", contrasena: i.valor.contrasena ?? "", url: i.valor.url ?? "" }));
  return (await Autorrelleno.guardar({ entradas })).guardadas;
}

/** Autocompletar en otras apps (solo celular): como Samsung Pass, con tu huella. */
function Autocompletar({ items }: { items: Item[] }) {
  const [estado, setEstado] = useState<{ soportado: boolean; activo: boolean; entradas: number } | null>(null);
  const [encendido, setEncendido] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_AUTORRELLENO) === "1";
    } catch {
      return false;
    }
  });
  const revisar = () => void Autorrelleno.estado().then(setEstado, () => setEstado({ soportado: false, activo: false, entradas: 0 }));
  useEffect(() => {
    revisar();
    const alVolver = () => document.visibilityState === "visible" && revisar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);
  // Con la bóveda abierta y el autocompletado encendido, se mantiene al día.
  useEffect(() => {
    if (encendido && items.length) void llevarAlAutocompletado(items).then(revisar, () => undefined);
  }, [encendido, items]);
  if (!estado?.soportado) return null;
  return (
    <Tarjeta titulo="Autocompletar en otras apps" icono={KeyRound}>
      <p className="text-sm text-tenue">Como Samsung Pass: cuando una app o página pida tu usuario y contraseña, toca «Mi Setup», pon tu huella y se rellenan solas.</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
        <li className={estado.activo ? "text-ok" : ""}>
          {estado.activo ? "Mi Setup ya puede autocompletar. " : "Elige Mi Setup como servicio de autocompletar. "}
          <button type="button" className="underline" onClick={() => void Autorrelleno.abrirAjustes().catch(avisarError)}>
            {estado.activo ? "Cambiar" : "Abrir ajustes"}
          </button>
        </li>
        <li>
          <Interruptor
            activo={encendido}
            alCambiar={async (v) => {
              try {
                if (v) {
                  if (!(await confirmar({ titulo: "Llevar tus contraseñas al autocompletado", mensaje: "Se guardan en este celular, cifradas con el almacén seguro de Android, y solo se usan después de tu huella o tu bloqueo de pantalla. Puedes apagarlo cuando quieras.", boton: "Activar" }))) return;
                  const n = await llevarAlAutocompletado(items);
                  avisar(`Listo: ${n} contraseñas para autocompletar`);
                } else {
                  await Autorrelleno.borrar();
                }
                localStorage.setItem(CLAVE_AUTORRELLENO, v ? "1" : "0");
                setEncendido(v);
                revisar();
              } catch (err) {
                avisarError(err);
              }
            }}
            etiqueta={encendido ? `Encendido (${estado.entradas} contraseñas)` : "Llevar mis contraseñas al autocompletado"}
          />
        </li>
      </ol>
      <p className="mt-2 text-xs text-tenue">Se rellena solo en el sitio o la app que coincide con la dirección que guardaste en cada contraseña.</p>
    </Tarjeta>
  );
}

function Contenido() {
  const puede = usePuede("boveda", "escritura");
  const bloquear = useBoveda((s) => s.bloquear);
  const { data: todos, isLoading, error } = useElementos<Datos>("boveda");
  const data = useMemo(() => todos?.filter((i) => i.tipo !== "generada"), [todos]);
  const [q, setQ] = useState("");
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [editando, setEditando] = useState<Item | null | "nuevo">(null);

  const carpetas = useMemo(() => [...new Set((data ?? []).map((i) => i.valor.carpeta).filter(Boolean))].sort(), [data]);
  const lista = useMemo(() => {
    const t = q.toLowerCase();
    return (data ?? [])
      .filter((i) => carpeta === null || (i.valor.carpeta || "") === carpeta)
      .filter((i) => !t || [i.valor.nombre, i.valor.usuario, i.valor.url].some((x) => x?.toLowerCase().includes(t)))
      .sort((a, b) => a.valor.nombre.localeCompare(b.valor.nombre));
  }, [data, q, carpeta]);
  const actual = data?.find((i) => i.id === sel) ?? null;

  return (
    <>
      <Encabezado
        titulo="Gestor de contraseñas"
        descripcion="Cifrado de extremo a extremo. El portapapeles se borra a los 20 s."
        acciones={
          <>
            <Herramientas />
            <Boton tamano="sm" icono={Lock} onClick={bloquear}>Bloquear</Boton>
            {puede ? <Boton variante="primario" icono={Plus} onClick={() => setEditando("nuevo")}>Nuevo</Boton> : null}
          </>
        }
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando texto="Descifrando…" /> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_320px_1fr]">
        <nav className="space-y-1 text-sm">
          <button type="button" onClick={() => setCarpeta(null)} className={cx("flex w-full items-center gap-2 rounded-lg px-3 py-2", carpeta === null ? "bg-tarjeta" : "hover:bg-tarjeta")}>
            <KeyRound className="h-4 w-4 text-tenue" /> Todo ({data?.length ?? 0})
          </button>
          {["", ...carpetas].map((c) => (
            <button key={c || "_"} type="button" onClick={() => setCarpeta(c)} className={cx("flex w-full items-center gap-2 rounded-lg px-3 py-2", carpeta === c ? "bg-tarjeta" : "hover:bg-tarjeta")}>
              <Folder className="h-4 w-4 text-tenue" /> {c || "Sin carpeta"}
            </button>
          ))}
        </nav>
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-tenue" />
            <Entrada className="pl-9" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {data && lista.length === 0 ? <Vacio icono={KeyRound} texto={data.length ? "Sin resultados." : "Guarda tu primera contraseña."} /> : null}
          {lista.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setSel(i.id)}
              className={cx("flex w-full items-center gap-3 rounded-xl border p-3 text-left", sel === i.id ? "border-acento/60 bg-tarjeta" : "border-borde bg-superficie hover:bg-tarjeta")}
            >
              {i.tipo === "nota" ? <StickyNote className="h-4 w-4 shrink-0 text-tenue" /> : <KeyRound className="h-4 w-4 shrink-0 text-tenue" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{i.valor.nombre}</p>
                <p className="truncate text-xs text-tenue">{i.valor.usuario || i.valor.url || (i.tipo === "nota" ? "Nota segura" : "")}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="rounded-tarjeta border border-borde bg-superficie p-4">
          {actual ? <Detalle item={actual} puede={puede} alEditar={() => setEditando(actual)} /> : <Vacio icono={KeyRound} texto="Elige un elemento." />}
        </div>
      </div>
      <Modal abierto={editando !== null} titulo={editando === "nuevo" ? "Nuevo elemento" : "Editar"} alCerrar={() => setEditando(null)}>
        {editando !== null ? <Editor inicial={editando === "nuevo" ? null : editando} carpetas={carpetas} alTerminar={() => setEditando(null)} /> : null}
      </Modal>
      {esMovil() && data ? (
        <div className="mt-4">
          <Autocompletar items={data} />
        </div>
      ) : null}
    </>
  );
}

interface Problema {
  item: Item;
  filtrada: number;
  repetida: number;
  debil: boolean;
  sitioFiltrado: string | null;
}

/**
 * Revisión de tus contraseñas (en tu dispositivo, sin mandarlas): filtradas
 * (k-anonimato), repetidas, débiles y sitios que tuvieron una filtración con
 * tu correo. Desde aquí generas una nueva y la guardas.
 */
function Revision() {
  const { data: todos } = useElementos<Datos>("boveda");
  const [problemas, setProblemas] = useState<Problema[] | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [editando, setEditando] = useState<Item | null>(null);
  const items = useMemo(() => (todos ?? []).filter((i) => i.tipo !== "generada" && i.tipo !== "nota" && i.valor.contrasena), [todos]);

  const revisar = async () => {
    setRevisando(true);
    try {
      const filtraciones = await api<{ email: string; fuentes: string[] }[]>("/api/ciberseguridad/filtraciones").catch(() => []);
      const fuentes = filtraciones.flatMap((f) => f.fuentes.map((x) => x.toLowerCase()));
      const cuenta = new Map<string, number>();
      for (const i of items) cuenta.set(i.valor.contrasena!, (cuenta.get(i.valor.contrasena!) ?? 0) + 1);
      const salida: Problema[] = [];
      for (const i of items) {
        const c = i.valor.contrasena!;
        const filtrada = await vecesFiltrada(c, async (prefijo) => (await api<{ lista: string }>(`/api/ciberseguridad/contrasena/${prefijo}`)).lista).catch(() => 0);
        const sitio = (() => {
          try {
            return new URL(i.valor.url?.startsWith("http") ? i.valor.url : `https://${i.valor.url}`).hostname.replace(/^www\./, "").split(".")[0]!.toLowerCase();
          } catch {
            return i.valor.nombre.toLowerCase().split(/\s+/)[0] ?? "";
          }
        })();
        const sitioFiltrado = sitio && sitio.length > 2 ? (fuentes.find((f) => f.replace(/[^a-z0-9]/g, "").includes(sitio)) ?? null) : null;
        const debil = c.length < 10 || /^(\d+|[a-z]+)$/i.test(c);
        const p = { item: i, filtrada, repetida: (cuenta.get(c) ?? 1) - 1, debil, sitioFiltrado };
        if (p.filtrada || p.repetida || p.debil || p.sitioFiltrado) salida.push(p);
      }
      setProblemas(salida.sort((a, b) => b.filtrada - a.filtrada || Number(Boolean(b.sitioFiltrado)) - Number(Boolean(a.sitioFiltrado))));
    } finally {
      setRevisando(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Encabezado titulo="Revisar mis contraseñas" descripcion="Busca las que se filtraron, las repetidas y las débiles, y te ayuda a cambiarlas. Tus contraseñas no salen de este dispositivo." />
      <Boton variante="primario" icono={ShieldCheck} cargando={revisando} onClick={() => void revisar()} disabled={!items.length}>
        Revisar {items.length} contraseña(s)
      </Boton>
      {problemas && !problemas.length ? <Vacio icono={ShieldCheck} texto="¡Todo bien! Ninguna filtrada, repetida ni débil." /> : null}
      <div className="space-y-2">
        {problemas?.map((p) => (
          <div key={p.item.id} className="rounded-tarjeta border border-borde bg-superficie p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{p.item.valor.nombre}</p>
              {p.filtrada ? <Insignia tono="peligro">Filtrada {p.filtrada.toLocaleString("es-MX")} veces</Insignia> : null}
              {p.sitioFiltrado ? <Insignia tono="peligro">El sitio tuvo una filtración ({p.sitioFiltrado})</Insignia> : null}
              {p.repetida ? <Insignia tono="aviso">Repetida en {p.repetida} más</Insignia> : null}
              {p.debil ? <Insignia tono="aviso">Débil</Insignia> : null}
            </div>
            <p className="mt-1 text-xs text-tenue">{p.item.valor.usuario || p.item.valor.url}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.item.valor.url ? (
                <Boton tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(p.item.valor.url!.startsWith("http") ? p.item.valor.url! : `https://${p.item.valor.url}`)}>
                  Abrir el sitio para cambiarla
                </Boton>
              ) : null}
              <Boton
                tamano="sm"
                variante="primario"
                icono={Wand2}
                onClick={() => setEditando({ ...p.item, valor: { ...p.item.valor, contrasena: generarContrasena({ ...OPCIONES_POR_DEFECTO, longitud: 20 }) } })}
              >
                Generar nueva y guardar
              </Boton>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-tenue">Primero cambia la contraseña en el sitio y luego guárdala aquí. Las filtradas se revisan con k-anonimato: solo viajan 5 caracteres del hash.</p>
      <Modal abierto={editando !== null} titulo="Nueva contraseña" alCerrar={() => setEditando(null)}>
        {editando ? <Editor inicial={editando} carpetas={[]} alTerminar={() => setEditando(null)} /> : null}
      </Modal>
    </div>
  );
}

export default function Boveda() {
  const [params] = useSearchParams();
  const [pestana, setPestana] = useState<"contrasenas" | "revisar" | "generador" | "historial">(params.get("pestana") === "revisar" ? "revisar" : "contrasenas");
  return (
    <>
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "contrasenas", texto: "Mis contraseñas" },
          { id: "revisar", texto: "Revisar" },
          { id: "generador", texto: "Generador" },
          { id: "historial", texto: "Historial (10)" },
        ]}
      />
      {pestana === "contrasenas" ? (
        <Desbloqueo>
          <Contenido />
        </Desbloqueo>
      ) : null}
      {pestana === "revisar" ? (
        <Desbloqueo>
          <Revision />
        </Desbloqueo>
      ) : null}
      {pestana === "generador" ? (
        <div className="mx-auto max-w-xl">
          <Encabezado titulo="Generador de contraseñas" descripcion="Crea contraseñas fuertes al azar. No necesitas abrir la bóveda para generarlas." />
          <Tarjeta>
            <Generador />
          </Tarjeta>
        </div>
      ) : null}
      {pestana === "historial" ? (
        <Desbloqueo>
          <div className="mx-auto max-w-2xl">
            <HistorialGeneradas />
          </div>
        </Desbloqueo>
      ) : null}
    </>
  );
}
