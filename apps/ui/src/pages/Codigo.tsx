/**
 * Código: un editor tipo VS Code dentro de Mi Setup (Monaco). En la app de
 * Windows abre carpetas de tu PC, guarda, crea proyectos desde plantillas
 * (plugins, mods, datapacks, web, Python, Node), comprime/descomprime y
 * compila en su propia terminal. En el navegador y el celular queda un bloc
 * de código para practicar.
 */
import "../lib/monaco";
import Editor, { type OnMount } from "@monaco-editor/react";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Coffee,
  File,
  FileArchive,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Hammer,
  PackageOpen,
  Pencil,
  Play,
  Plus,
  Save,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConsolaLocal, cierresLocales } from "../components/ConsolaLocal";
import { Boton, Campo, Encabezado, Entrada, Modal, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { confirmar } from "../lib/confirmar";
import { lenguajeDe } from "../lib/monaco";
import { escritorio, type ArchivosLocales, type EntradaLocal, type PlantillaProyecto } from "../lib/plataforma";

interface Abierto {
  ruta: string;
  nombre: string;
  texto: string;
  guardado: string;
}
interface Consola {
  clave: string;
  titulo: string;
  cwd: string;
  comando?: string;
}

const nombreDe = (ruta: string) => ruta.split(/[\\/]/).pop() ?? ruta;
const padreDe = (ruta: string) => ruta.replace(/[\\/][^\\/]+$/, "");
const COMPRIMIDO = /\.(zip|jar|mrpack|tar|tgz)$/i;

/** Qué hace "Compilar / Ejecutar" según los archivos del proyecto. */
function comandoDelProyecto(archivos: EntradaLocal[]): { texto: string; comando: string | null; zip?: boolean } | null {
  const hay = (n: string) => archivos.some((a) => a.nombre.toLowerCase() === n);
  if (hay("build.gradle") || hay("build.gradle.kts")) return { texto: "Compilar", comando: hay("gradlew.bat") ? ".\\gradlew.bat build" : "gradle build" };
  if (hay("pom.xml")) return { texto: "Compilar", comando: "mvn package" };
  if (hay("package.json")) return { texto: "Ejecutar", comando: "npm start" };
  if (hay("main.py")) return { texto: "Ejecutar", comando: "python main.py" };
  if (hay("pack.mcmeta")) return { texto: "Comprimir datapack", comando: null, zip: true };
  if (hay("index.html")) return { texto: "Abrir en el navegador", comando: "start index.html" };
  return null;
}

function Arbol({
  fs,
  ruta,
  nivel,
  abiertas,
  alternar,
  contenido,
  alAbrir,
  alCambio,
  seleccion,
  setSeleccion,
}: {
  fs: ArchivosLocales;
  ruta: string;
  nivel: number;
  abiertas: Set<string>;
  alternar: (ruta: string) => void;
  contenido: Map<string, EntradaLocal[]>;
  alAbrir: (e: EntradaLocal) => void;
  alCambio: (carpeta: string) => void;
  seleccion: string | null;
  setSeleccion: (r: string) => void;
}) {
  const lista = contenido.get(ruta) ?? [];
  const accion = async (fn: () => Promise<unknown>, carpeta: string, aviso?: string) => {
    try {
      await fn();
      if (aviso) avisar(aviso);
      alCambio(carpeta);
    } catch (err) {
      avisarError(err);
    }
  };
  return (
    <ul>
      {lista.map((e) => {
        const abierta = abiertas.has(e.ruta);
        return (
          <li key={e.ruta}>
            <div
              className={cx("group flex items-center gap-1 rounded-md pr-1 text-xs hover:bg-tarjeta", seleccion === e.ruta && "bg-tarjeta")}
              style={{ paddingLeft: 4 + nivel * 12 }}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left"
                onClick={() => {
                  setSeleccion(e.ruta);
                  if (e.tipo === "carpeta") alternar(e.ruta);
                  else alAbrir(e);
                }}
              >
                {e.tipo === "carpeta" ? (abierta ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />) : <span className="w-3 shrink-0" />}
                {e.tipo === "carpeta" ? <Folder className="h-3.5 w-3.5 shrink-0 text-tenue" /> : COMPRIMIDO.test(e.nombre) ? <FileArchive className="h-3.5 w-3.5 shrink-0 text-tenue" /> : <File className="h-3.5 w-3.5 shrink-0 text-tenue" />}
                <span className="truncate">{e.nombre}</span>
              </button>
              <span className="hidden shrink-0 gap-0.5 group-hover:flex">
                {COMPRIMIDO.test(e.nombre) ? (
                  <button type="button" title="Descomprimir aquí" className="p-0.5 hover:text-acento" onClick={() => void accion(() => fs.descomprimir(e.ruta), padreDe(e.ruta), "Descomprimido")}>
                    <PackageOpen className="h-3 w-3" />
                  </button>
                ) : null}
                <button
                  type="button"
                  title="Comprimir en .zip"
                  className="p-0.5 hover:text-acento"
                  onClick={() => void accion(() => fs.comprimir([e.ruta], `${e.nombre.replace(/\.[^.]+$/, "")}.zip`), padreDe(e.ruta), "Comprimido en .zip")}
                >
                  <FileArchive className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Cambiar nombre"
                  className="p-0.5 hover:text-acento"
                  onClick={() => {
                    const nuevo = window.prompt("Nuevo nombre", e.nombre);
                    if (nuevo && nuevo !== e.nombre) void accion(() => fs.renombrar(e.ruta, nuevo), padreDe(e.ruta));
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Mandar a la papelera"
                  className="p-0.5 hover:text-peligro"
                  onClick={async () => {
                    if (await confirmar({ titulo: "Mandar a la papelera", mensaje: `«${e.nombre}» se va a la Papelera de Windows (puedes recuperarlo de ahí).` })) {
                      void accion(() => fs.borrar(e.ruta), padreDe(e.ruta));
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            </div>
            {e.tipo === "carpeta" && abierta ? (
              <Arbol
                fs={fs}
                ruta={e.ruta}
                nivel={nivel + 1}
                abiertas={abiertas}
                alternar={alternar}
                contenido={contenido}
                alAbrir={alAbrir}
                alCambio={alCambio}
                seleccion={seleccion}
                setSeleccion={setSeleccion}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function NuevoProyecto({ fs, carpetas, alCrear, alCerrar }: { fs: ArchivosLocales; carpetas: string[]; alCrear: (ruta: string) => void; alCerrar: () => void }) {
  const [plantillas, setPlantillas] = useState<PlantillaProyecto[]>([]);
  const [plantilla, setPlantilla] = useState("plugin-paper");
  const [nombre, setNombre] = useState("MiPlugin");
  const [carpeta, setCarpeta] = useState(carpetas[0] ?? "");
  const [creando, setCreando] = useState(false);
  useEffect(() => {
    void fs.plantillas().then(setPlantillas, avisarError);
  }, [fs]);
  const elegida = plantillas.find((p) => p.id === plantilla);
  return (
    <Modal abierto titulo="Nuevo proyecto" alCerrar={alCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Tipo">
          <Selector value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        {elegida ? <p className="text-xs text-tenue">{elegida.descripcion}</p> : null}
        <Campo etiqueta="Nombre (letras, números o guiones)">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Dentro de">
          <Selector value={carpeta} onChange={(e) => setCarpeta(e.target.value)}>
            {carpetas.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Selector>
        </Campo>
        <Boton
          variante="primario"
          className="w-full"
          cargando={creando}
          disabled={!carpeta || !nombre.trim()}
          onClick={async () => {
            setCreando(true);
            try {
              alCrear(await fs.crearProyecto(carpeta, plantilla, nombre));
            } catch (err) {
              avisarError(err);
            } finally {
              setCreando(false);
            }
          }}
        >
          Crear proyecto
        </Boton>
      </div>
    </Modal>
  );
}

/** Editor sin archivos (navegador y celular): para practicar. */
function BlocDeCodigo() {
  const [lenguaje, setLenguaje] = useState("javascript");
  return (
    <Tarjeta
      titulo="Bloc de código"
      icono={Code2}
      acciones={
        <Selector className="w-auto" value={lenguaje} onChange={(e) => setLenguaje(e.target.value)}>
          {["javascript", "typescript", "python", "html", "css", "json", "java", "sql", "markdown"].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Selector>
      }
    >
      <div className="h-[60vh] overflow-hidden rounded-xl border border-borde">
        <Editor theme="vs-dark" language={lenguaje} defaultValue={"// Escribe aquí. Para abrir archivos de tu PC usa la app de Windows.\n"} options={{ fontSize: 14, minimap: { enabled: false } }} />
      </div>
    </Tarjeta>
  );
}

function Ide({ fs }: { fs: ArchivosLocales }) {
  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [raiz, setRaiz] = useState<string | null>(null);
  const [contenido, setContenido] = useState(new Map<string, EntradaLocal[]>());
  const [abiertas, setAbiertas] = useState(new Set<string>());
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [archivos, setArchivos] = useState<Abierto[]>([]);
  const [activo, setActivo] = useState<string | null>(null);
  const [consolas, setConsolas] = useState<Consola[]>([]);
  const [consolaActiva, setConsolaActiva] = useState<string | null>(null);
  const [verConsola, setVerConsola] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [herr, setHerr] = useState<{ java: boolean; gradle: boolean } | null>(null);
  const [instalando, setInstalando] = useState<string | null>(null);
  const actual = archivos.find((a) => a.ruta === activo) ?? null;
  const archivosRef = useRef(archivos);
  archivosRef.current = archivos;

  const cargar = useCallback(
    async (ruta: string) => {
      try {
        const lista = await fs.listar(ruta);
        setContenido((m) => new Map(m).set(ruta, lista));
      } catch (err) {
        avisarError(err);
      }
    },
    [fs],
  );

  useEffect(() => {
    void fs.carpetas().then((c) => {
      setCarpetas(c);
      if (c[0]) setRaiz((r) => r ?? c[0]!);
    });
    void fs.herramientas().then(setHerr, () => undefined);
    return fs.alAvanceHerramientas(setInstalando);
  }, [fs]);
  useEffect(() => {
    if (raiz) void cargar(raiz);
  }, [raiz, cargar]);

  const alternar = (ruta: string) => {
    setAbiertas((s) => {
      const n = new Set(s);
      if (n.has(ruta)) n.delete(ruta);
      else {
        n.add(ruta);
        void cargar(ruta);
      }
      return n;
    });
  };

  const abrirArchivo = async (e: EntradaLocal | { ruta: string; nombre: string }) => {
    if (archivosRef.current.some((a) => a.ruta === e.ruta)) return setActivo(e.ruta);
    try {
      const texto = await fs.leer(e.ruta);
      setArchivos((l) => [...l, { ruta: e.ruta, nombre: e.nombre, texto, guardado: texto }]);
      setActivo(e.ruta);
    } catch (err) {
      avisarError(err);
    }
  };

  const guardar = useCallback(
    async (ruta?: string) => {
      const a = archivosRef.current.find((x) => x.ruta === (ruta ?? activo));
      if (!a || a.texto === a.guardado) return;
      try {
        await fs.escribir(a.ruta, a.texto);
        setArchivos((l) => l.map((x) => (x.ruta === a.ruta ? { ...x, guardado: a.texto } : x)));
      } catch (err) {
        avisarError(err);
      }
    },
    [fs, activo],
  );
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;

  const cerrarArchivo = async (ruta: string) => {
    const a = archivos.find((x) => x.ruta === ruta);
    if (a && a.texto !== a.guardado && !(await confirmar({ titulo: "Cambios sin guardar", mensaje: `«${a.nombre}» tiene cambios. ¿Cerrar sin guardar?`, boton: "Cerrar sin guardar" }))) return;
    setArchivos((l) => {
      const resto = l.filter((x) => x.ruta !== ruta);
      if (activo === ruta) setActivo(resto.at(-1)?.ruta ?? null);
      return resto;
    });
  };

  const abrirCarpeta = async () => {
    const c = await fs.elegirCarpeta().catch(avisarError);
    if (!c) return;
    setCarpetas(await fs.carpetas());
    setRaiz(c);
  };

  const nuevaConsola = (titulo: string, cwd: string, comando?: string) => {
    const clave = crypto.randomUUID();
    setConsolas((l) => [...l, { clave, titulo, cwd, ...(comando ? { comando } : {}) }]);
    setConsolaActiva(clave);
    setVerConsola(true);
  };
  const cerrarConsola = (clave: string) => {
    cierresLocales.add(clave);
    setConsolas((l) => {
      const resto = l.filter((c) => c.clave !== clave);
      if (consolaActiva === clave) setConsolaActiva(resto.at(-1)?.clave ?? null);
      return resto;
    });
  };
  const registros = useRef(new Map<string, (e: ((t: string) => void) | null) => void>());
  const registroDe = (clave: string) => {
    let fn = registros.current.get(clave);
    if (!fn) {
      fn = () => undefined;
      registros.current.set(clave, fn);
    }
    return fn;
  };

  const crearEn = async (tipo: "archivo" | "carpeta") => {
    const destino = seleccion && contenido.has(seleccion) ? seleccion : seleccion ? padreDe(seleccion) : raiz;
    if (!destino) return;
    const nombre = window.prompt(tipo === "archivo" ? "Nombre del archivo (con extensión)" : "Nombre de la carpeta");
    if (!nombre) return;
    try {
      const ruta = await fs.crear(destino, nombre, tipo);
      await cargar(destino);
      setAbiertas((s) => new Set(s).add(destino));
      if (tipo === "archivo") void abrirArchivo({ ruta, nombre });
    } catch (err) {
      avisarError(err);
    }
  };

  const proyecto = raiz ? comandoDelProyecto(contenido.get(raiz) ?? []) : null;
  const necesitaJava = Boolean(proyecto?.comando?.includes("gradle")) && herr !== null && (!herr.java || !herr.gradle);
  const ejecutarProyecto = async () => {
    if (!raiz || !proyecto) return;
    await Promise.all(archivosRef.current.filter((a) => a.texto !== a.guardado).map((a) => guardarRef.current(a.ruta)));
    if (proyecto.zip) {
      try {
        const lista = (contenido.get(raiz) ?? []).filter((e) => !e.nombre.toLowerCase().endsWith(".zip"));
        const zip = await fs.comprimir(lista.map((e) => e.ruta), `${nombreDe(raiz)}.zip`);
        avisar(`Listo: ${nombreDe(zip)}`);
        void cargar(raiz);
      } catch (err) {
        avisarError(err);
      }
      return;
    }
    if (proyecto.comando) nuevaConsola(proyecto.texto, raiz, proyecto.comando);
  };

  const montar: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void guardarRef.current());
  };

  if (!carpetas.length) {
    return (
      <Vacio
        icono={FolderOpen}
        texto="Abre una carpeta de tu PC (tu proyecto, tu servidor, tus mods…). Solo podrás tocar lo que esté dentro de las carpetas que elijas."
        accion={
          <Boton variante="primario" icono={FolderOpen} onClick={() => void abrirCarpeta()}>
            Abrir carpeta
          </Boton>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Selector className="w-auto max-w-xs" value={raiz ?? ""} onChange={(e) => setRaiz(e.target.value)}>
          {carpetas.map((c) => (
            <option key={c} value={c}>
              {nombreDe(c)} — {c}
            </option>
          ))}
        </Selector>
        <Boton tamano="sm" icono={FolderOpen} onClick={() => void abrirCarpeta()}>
          Abrir carpeta
        </Boton>
        <Boton tamano="sm" icono={Plus} onClick={() => setNuevo(true)}>
          Nuevo proyecto
        </Boton>
        <Boton tamano="sm" icono={Save} disabled={!actual || actual.texto === actual.guardado} onClick={() => void guardar()}>
          Guardar
        </Boton>
        {proyecto ? (
          <Boton tamano="sm" variante="primario" icono={proyecto.texto === "Compilar" ? Hammer : Play} disabled={necesitaJava} onClick={() => void ejecutarProyecto()}>
            {proyecto.texto}
          </Boton>
        ) : null}
        <Boton tamano="sm" icono={SquareTerminal} onClick={() => (raiz ? nuevaConsola("Terminal", raiz) : undefined)}>
          Terminal
        </Boton>
        {raiz ? (
          <Boton
            tamano="sm"
            variante="fantasma"
            onClick={async () => {
              if (await confirmar({ titulo: "Quitar de la lista", mensaje: "La carpeta no se borra; solo deja de aparecer aquí." })) {
                await fs.quitarCarpeta(raiz);
                const c = await fs.carpetas();
                setCarpetas(c);
                setRaiz(c[0] ?? null);
              }
            }}
          >
            Quitar de la lista
          </Boton>
        ) : null}
      </div>
      {necesitaJava ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-aviso/40 bg-aviso/10 p-3 text-sm">
          <Coffee className="h-4 w-4 shrink-0 text-aviso" />
          <span className="min-w-0 flex-1">Para compilar plugins y mods hacen falta Java 21 y Gradle (unos 300 MB, se instalan una sola vez dentro de Mi Setup).</span>
          <Boton
            tamano="sm"
            variante="primario"
            cargando={instalando !== null && instalando !== "Listo"}
            onClick={async () => {
              try {
                setHerr(await fs.instalarHerramientas());
                avisar("Java y Gradle listos");
              } catch (err) {
                avisarError(err);
              } finally {
                setInstalando(null);
              }
            }}
          >
            {instalando && instalando !== "Listo" ? instalando : "Instalar Java y Gradle"}
          </Boton>
        </div>
      ) : null}

      <div className="grid h-[72vh] min-h-96 grid-cols-1 overflow-hidden rounded-tarjeta border border-borde md:grid-cols-[240px_1fr]">
        <div className="flex min-h-0 flex-col border-b border-borde bg-superficie md:border-b-0 md:border-r">
          <div className="flex items-center gap-1 border-b border-borde p-1">
            <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium">{raiz ? nombreDe(raiz) : ""}</span>
            <button type="button" title="Nuevo archivo" className="p-1 hover:text-acento" onClick={() => void crearEn("archivo")}>
              <FilePlus className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Nueva carpeta" className="p-1 hover:text-acento" onClick={() => void crearEn("carpeta")}>
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1">
            {raiz ? (
              <Arbol
                fs={fs}
                ruta={raiz}
                nivel={0}
                abiertas={abiertas}
                alternar={alternar}
                contenido={contenido}
                alAbrir={(e) => void abrirArchivo(e)}
                alCambio={(c) => void cargar(c)}
                seleccion={seleccion}
                setSeleccion={setSeleccion}
              />
            ) : null}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-borde bg-superficie p-1">
            {archivos.map((a) => (
              <div key={a.ruta} className={cx("flex shrink-0 items-center gap-1 rounded-lg pl-2 text-xs", a.ruta === activo ? "bg-tarjeta" : "text-tenue")}>
                <button type="button" className="py-1" title={a.ruta} onClick={() => setActivo(a.ruta)}>
                  {a.nombre}
                  {a.texto !== a.guardado ? " ●" : ""}
                </button>
                <button type="button" className="p-1 hover:text-texto" aria-label="Cerrar archivo" onClick={() => void cerrarArchivo(a.ruta)}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {!archivos.length ? <span className="px-2 py-1 text-xs text-tenue">Abre un archivo de la izquierda · Ctrl+S guarda</span> : null}
          </div>
          <div className={cx("min-h-0", verConsola ? "flex-[3]" : "flex-1")}>
            {actual ? (
              <Editor
                key={actual.ruta}
                theme="vs-dark"
                path={actual.ruta}
                language={lenguajeDe(actual.nombre)}
                value={actual.texto}
                onMount={montar}
                onChange={(v) => setArchivos((l) => l.map((x) => (x.ruta === actual.ruta ? { ...x, texto: v ?? "" } : x)))}
                options={{ fontSize: 14, minimap: { enabled: true }, automaticLayout: true, tabSize: 4, wordWrap: "on" }}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-tenue">Elige un archivo para editarlo.</div>
            )}
          </div>
          {consolas.length ? (
            <div className={cx("flex min-h-0 flex-col border-t border-borde", verConsola ? "flex-[2]" : "flex-none")}>
              <div className="flex items-center gap-1 overflow-x-auto bg-superficie p-1">
                <button type="button" className="p-1 text-tenue hover:text-texto" aria-label="Mostrar u ocultar terminal" onClick={() => setVerConsola((v) => !v)}>
                  {verConsola ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                {consolas.map((c) => (
                  <div key={c.clave} className={cx("flex shrink-0 items-center gap-1 rounded-lg pl-2 text-xs", c.clave === consolaActiva ? "bg-tarjeta" : "text-tenue")}>
                    <button
                      type="button"
                      className="py-1"
                      onClick={() => {
                        setConsolaActiva(c.clave);
                        setVerConsola(true);
                      }}
                    >
                      {c.titulo}
                    </button>
                    <button type="button" className="p-1 hover:text-texto" aria-label="Cerrar terminal" onClick={() => cerrarConsola(c.clave)}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className={cx("relative min-h-0 flex-1", !verConsola && "hidden")}>
                {consolas.map((c) => (
                  <div key={c.clave} className={cx("absolute inset-0", c.clave !== consolaActiva && "pointer-events-none opacity-0")}>
                    <ConsolaLocal
                      clave={c.clave}
                      shell="powershell"
                      visible={verConsola && c.clave === consolaActiva}
                      registrar={registroDe(c.clave)}
                      alId={() => undefined}
                      cwd={c.cwd}
                      {...(c.comando ? { comando: c.comando } : {})}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {nuevo ? (
        <NuevoProyecto
          fs={fs}
          carpetas={carpetas}
          alCerrar={() => setNuevo(false)}
          alCrear={(ruta) => {
            setNuevo(false);
            avisar("Proyecto creado");
            const base = padreDe(ruta);
            setRaiz(base);
            void cargar(base);
            setAbiertas((s) => new Set(s).add(ruta));
            void cargar(ruta);
            setSeleccion(ruta);
            void abrirArchivo({ ruta: `${ruta}\\LEEME.md`, nombre: "LEEME.md" }).catch(() => undefined);
          }}
        />
      ) : null}
    </div>
  );
}

export default function Codigo() {
  const fs = escritorio()?.archivosLocales ?? null;
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Código"
        descripcion={fs ? "Tu editor tipo VS Code: abre carpetas de tu PC, crea plugins, mods y datapacks, compila y comprime sin salir de Mi Setup." : "Editor de código. Para abrir y compilar archivos de tu PC usa la app de Windows."}
      />
      {fs ? <Ide fs={fs} /> : <BlocDeCodigo />}
    </div>
  );
}
