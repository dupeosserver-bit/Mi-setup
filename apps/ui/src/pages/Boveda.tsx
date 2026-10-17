/** Gestor de contraseñas (cifrado de extremo a extremo). */
import { useMutation } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Eye, EyeOff, Folder, History, KeyRound, Lock, Pencil, Plus, RefreshCw, Search, StickyNote, Trash2, Upload, Wand2 } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { AVISO_SIN_RECUPERACION, Desbloqueo, MedidorFortaleza } from "../components/Desbloqueo";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { cifrar, contextoDe } from "../lib/boveda/cripto";
import { leerColeccion, recargarElementos, useBoveda, useConfigBoveda, useElementos, type Elemento } from "../lib/boveda/estado";
import { generarContrasena, OPCIONES_POR_DEFECTO, SIMBOLOS_POR_DEFECTO, type OpcionesGenerador } from "../lib/boveda/generador";
import { cambiarClaveMaestra, copiarSeguro, exportar, importar } from "../lib/boveda/utilidades";
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
      <div className="grid gap-3 sm:grid-cols-2">
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
      <div className="grid gap-4 lg:grid-cols-[200px_320px_1fr]">
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
    </>
  );
}

export default function Boveda() {
  const [pestana, setPestana] = useState<"contrasenas" | "generador" | "historial">("contrasenas");
  return (
    <>
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "contrasenas", texto: "Mis contraseñas" },
          { id: "generador", texto: "Generador" },
          { id: "historial", texto: "Historial (10)" },
        ]}
      />
      {pestana === "contrasenas" ? (
        <Desbloqueo>
          <Contenido />
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
