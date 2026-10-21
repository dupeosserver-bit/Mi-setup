/**
 * Ajustes de la IA: memoria (lo que la IA recuerda de ti), skills
 * (instrucciones de Claude o de otras IA), modelos gratis del VPS (Ollama) y
 * gasto del mes.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, Cpu, Download, Pencil, Plus, Puzzle, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes } from "../lib/formato";
import { useUsoIa } from "../lib/ia";
import { Boton, Campo, Cargando, Entrada, ErrorCaja, FaltaConfigurar, Insignia, Interruptor, Modal, Pestanas, Tarjeta, Vacio, avisar, avisarError, cx } from "./ui";

function Memoria() {
  const q = useQuery({ queryKey: ["ia", "memoria"], queryFn: () => api<{ id: string; texto: string }[]>("/api/ia/memoria") });
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["ia", "memoria"] });
  const agregar = useMutation({ mutationFn: () => api("/api/ia/memoria", { cuerpo: { texto: nuevo.trim() } }), onSuccess: () => (setNuevo(""), refrescar()), onError: avisarError });
  const guardar = useMutation({ mutationFn: (e: { id: string; texto: string }) => api(`/api/ia/memoria/${e.id}`, { metodo: "PATCH", cuerpo: { texto: e.texto } }), onSuccess: () => (setEditando(null), refrescar()), onError: avisarError });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/ia/memoria/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  return (
    <Tarjeta titulo="Memoria" icono={Brain}>
      <p className="mb-3 text-sm text-tenue">Lo que la IA recuerda de ti en todos los chats (ej. «Tengo un servidor de Minecraft 1.20.1», «Respóndeme sin tecnicismos»).</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          agregar.mutate();
        }}
      >
        <Entrada value={nuevo} onChange={(e) => setNuevo(e.target.value)} maxLength={500} placeholder="Algo que deba recordar" />
        <Boton type="submit" icono={Plus} cargando={agregar.isPending} disabled={nuevo.trim().length < 2}>
          Agregar
        </Boton>
      </form>
      {q.isLoading ? <Cargando /> : null}
      <ul className="mt-3 space-y-1">
        {q.data?.map((m) => (
          <li key={m.id} className="flex items-start gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
            {editando?.id === m.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  guardar.mutate(editando);
                }}
              >
                <Entrada value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} maxLength={500} autoFocus />
                <Boton type="submit" tamano="sm" variante="primario">
                  Guardar
                </Boton>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 break-words">{m.texto}</span>
                <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar" onClick={() => setEditando(m)} />
                <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => borrar.mutate(m.id)} />
              </>
            )}
          </li>
        ))}
      </ul>
      {q.data && !q.data.length ? <Vacio texto="La IA aún no recuerda nada de ti. También puedes guardar algo desde un mensaje del chat." /> : null}
    </Tarjeta>
  );
}

interface Skill {
  id: string;
  nombre: string;
  descripcion: string;
  contenido: string;
  origen: "claude" | "otra" | "propia";
  activa: boolean;
}

function Skills() {
  const q = useQuery({ queryKey: ["ia", "skills"], queryFn: () => api<Skill[]>("/api/ia/skills") });
  const [editar, setEditar] = useState<Partial<Skill> | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["ia", "skills"] });
  const guardar = useMutation({
    mutationFn: (s: Partial<Skill>) =>
      api(s.id ? `/api/ia/skills/${s.id}` : "/api/ia/skills", { metodo: s.id ? "PATCH" : "POST", cuerpo: { nombre: s.nombre, descripcion: s.descripcion ?? "", contenido: s.contenido } }),
    onSuccess: () => (setEditar(null), refrescar()),
    onError: avisarError,
  });
  const activar = useMutation({ mutationFn: (s: Skill) => api(`/api/ia/skills/${s.id}`, { metodo: "PATCH", cuerpo: { activa: !s.activa } }), onSuccess: refrescar, onError: avisarError });
  const importar = useMutation({
    mutationFn: (f: File) => {
      const datos = new FormData();
      datos.append("archivo", f, f.name);
      return api<{ nombre: string }>("/api/ia/skills/importar", { formulario: datos });
    },
    onSuccess: (r) => (avisar(`Skill «${r.nombre}» agregada`), refrescar()),
    onError: avisarError,
  });
  return (
    <Tarjeta
      titulo="Skills"
      icono={Puzzle}
      acciones={
        <div className="flex gap-1">
          <Boton tamano="sm" icono={Upload} cargando={importar.isPending} onClick={() => archivo.current?.click()}>
            Subir
          </Boton>
          <Boton tamano="sm" variante="primario" icono={Plus} onClick={() => setEditar({ nombre: "", contenido: "" })}>
            Nueva
          </Boton>
        </div>
      }
    >
      <p className="mb-3 text-sm text-tenue">
        Instrucciones que la IA usa en todos tus chats. Sube un <b>SKILL.md</b> o un .zip de skill de Claude, o el texto de instrucciones de otra IA (.md o .txt). Las skills solo cambian cómo responde: la IA sigue sin ejecutar nada sin tu «Aprobar».
      </p>
      <input
        ref={archivo}
        type="file"
        accept=".md,.txt,.zip,text/markdown,text/plain,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importar.mutate(f);
          e.target.value = "";
        }}
      />
      {q.isLoading ? <Cargando /> : null}
      <ErrorCaja error={q.error} />
      {q.data && !q.data.length ? <Vacio icono={Puzzle} texto="Todavía no tienes skills." /> : null}
      <ul className="space-y-1">
        {q.data?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1 font-medium">
                {s.nombre} <Insignia>{s.origen === "claude" ? "Claude" : s.origen === "otra" ? "Otra IA" : "Tuya"}</Insignia>
              </p>
              <p className="truncate text-xs text-tenue">{s.descripcion || s.contenido.slice(0, 120)}</p>
            </div>
            <Interruptor activo={s.activa} alCambiar={() => activar.mutate(s)} etiqueta={s.activa ? "Activa" : "Apagada"} />
            <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar" onClick={() => setEditar(s)} />
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={Trash2}
              aria-label="Borrar"
              onClick={() => void confirmar({ titulo: `Borrar ${s.nombre}`, mensaje: "Se borra la skill.", boton: "Borrar" }).then((ok) => { if (ok) void api(`/api/ia/skills/${s.id}`, { metodo: "DELETE" }).then(refrescar, avisarError); })}
            />
          </li>
        ))}
      </ul>
      <Modal abierto={editar !== null} titulo={editar?.id ? "Editar skill" : "Nueva skill"} alCerrar={() => setEditar(null)} ancho="max-w-2xl">
        {editar ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              guardar.mutate(editar);
            }}
          >
            <Campo etiqueta="Nombre">
              <Entrada value={editar.nombre ?? ""} onChange={(e) => setEditar({ ...editar, nombre: e.target.value })} maxLength={80} />
            </Campo>
            <Campo etiqueta="¿Cuándo usarla? (opcional)">
              <Entrada value={editar.descripcion ?? ""} onChange={(e) => setEditar({ ...editar, descripcion: e.target.value })} maxLength={500} placeholder="Ej. cuando escriba mensajes a mis clientes" />
            </Campo>
            <Campo etiqueta="Instrucciones">
              <textarea value={editar.contenido ?? ""} onChange={(e) => setEditar({ ...editar, contenido: e.target.value })} maxLength={20000} className="min-h-48 w-full rounded-xl border border-borde bg-superficie p-3 font-mono text-xs focus:border-acento focus:outline-none" />
            </Campo>
            <Boton type="submit" variante="primario" cargando={guardar.isPending} disabled={!editar.nombre?.trim() || !editar.contenido?.trim()}>
              Guardar
            </Boton>
          </form>
        ) : null}
      </Modal>
    </Tarjeta>
  );
}

interface EstadoModelos {
  configurado: boolean;
  conectado: boolean;
  instalados: { nombre: string; tamano: number | null }[];
  catalogo: { id: string; nombre: string; descripcion: string; ramGb: number; descargaGb: number; bueno: string }[];
  descargas: { modelo: string; estado: string; porcentaje: number | null; error: string | null; terminado: boolean }[];
}

/** Modelos abiertos y gratis que corren en tu VPS (Ollama). */
export function ModelosGratis() {
  const puede = usePuede("ia", "administrar");
  const [otro, setOtro] = useState("");
  const q = useQuery({
    queryKey: ["ia", "modelos-locales"],
    queryFn: () => api<EstadoModelos>("/api/ia/modelos-locales"),
    refetchInterval: (d) => (d.state.data?.descargas.some((x) => !x.terminado) ? 2000 : false),
  });
  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ["ia", "modelos-locales"] });
    void queryClient.invalidateQueries({ queryKey: ["ia", "modelos-extra"] });
  };
  const bajar = useMutation({ mutationFn: (modelo: string) => api("/api/ia/modelos-locales", { cuerpo: { modelo } }), onSuccess: refrescar, onError: avisarError });
  const borrar = useMutation({ mutationFn: (modelo: string) => api(`/api/ia/modelos-locales/${encodeURIComponent(modelo)}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  const d = q.data;
  const instalado = (id: string) => d?.instalados.some((m) => m.nombre === id || m.nombre === `${id}:latest`);
  return (
    <Tarjeta titulo="IA gratis en tu VPS" icono={Cpu}>
      <p className="mb-3 text-sm text-tenue">
        Modelos abiertos que se bajan a tu VPS y responden gratis (sin suscripción ni recargas). Después elígelos en el selector de modelo del chat. Solo conversan: no proponen acciones.
      </p>
      {q.isLoading ? <Cargando /> : null}
      {d && !d.configurado ? <FaltaConfigurar variable="OLLAMA_URL" detalle="Enciende el servicio ollama del docker-compose (perfil ia-local) y pon OLLAMA_URL=http://misetup-ollama:11434 en Ajustes → Servicios y claves." /> : null}
      {d?.configurado && !d.conectado ? <p className="mb-2 text-sm text-aviso">No se pudo conectar con Ollama. ¿Está encendido el contenedor misetup-ollama?</p> : null}
      {d?.instalados.length ? (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tenue">En tu VPS</p>
          <ul className="space-y-1">
            {d.instalados.map((m) => (
              <li key={m.nombre} className="flex items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{m.nombre}</span>
                <span className="text-xs text-tenue">{m.tamano ? fmtBytes(m.tamano) : ""}</span>
                {puede ? (
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label={`Borrar ${m.nombre}`}
                    onClick={() => void confirmar({ titulo: `Borrar ${m.nombre}`, mensaje: "Se borra del VPS (libera espacio). Lo puedes volver a bajar.", boton: "Borrar" }).then((ok) => ok && borrar.mutate(m.nombre))}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {d?.descargas
        .filter((x) => !x.terminado || x.error)
        .map((x) => (
          <div key={x.modelo} className="mb-2 rounded-xl bg-fondo p-3 text-sm">
            <p className="font-medium">{x.modelo}</p>
            {x.error ? <p className="text-peligro">{x.error}</p> : <p className="text-tenue">{x.estado}</p>}
            {x.porcentaje !== null && !x.error ? (
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-tarjeta">
                <div className="h-full bg-acento" style={{ width: `${x.porcentaje}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {d?.catalogo.map((m) => {
          const bajando = d.descargas.some((x) => x.modelo === m.id && !x.terminado);
          return (
            <div key={m.id} className={cx("rounded-xl border p-3 text-sm", instalado(m.id) ? "border-ok/40" : "border-borde")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{m.nombre}</p>
                  <p className="text-xs text-tenue">{m.descripcion}</p>
                  <p className="mt-1 text-[11px] text-tenue">
                    ~{m.ramGb} GB de RAM · descarga ~{m.descargaGb} GB · {m.bueno}
                  </p>
                </div>
                {instalado(m.id) ? (
                  <Insignia tono="ok">Instalado</Insignia>
                ) : puede ? (
                  <Boton tamano="sm" icono={Download} cargando={bajando} disabled={!d.conectado} onClick={() => bajar.mutate(m.id)}>
                    Bajar
                  </Boton>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {puede && d?.conectado ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            bajar.mutate(otro.trim());
            setOtro("");
          }}
        >
          <Entrada value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Otro modelo de ollama.com/library (ej. gemma3:12b)" maxLength={120} />
          <Boton type="submit" icono={Download} disabled={!otro.trim()}>
            Bajar
          </Boton>
        </form>
      ) : null}
      <p className="mt-2 text-xs text-tenue">Elige uno que quepa en la RAM libre de tu VPS. Los modelos «cloud» de Ollama no se permiten porque piden cuenta.</p>
    </Tarjeta>
  );
}

function Uso() {
  const uso = useUsoIa();
  if (!uso.data) return null;
  const pct = Math.min(100, (uso.data.gastadoUsd / uso.data.presupuestoUsd) * 100);
  return (
    <Tarjeta titulo="Gasto del mes">
      <p className="text-sm">
        {uso.data.gastadoUsd.toFixed(4)} de {uso.data.presupuestoUsd} USD · modelo {uso.data.modelo}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-tarjeta">
        <div className={cx("h-full", pct >= 100 ? "bg-peligro" : pct > 80 ? "bg-aviso" : "bg-acento")} style={{ width: `${pct}%` }} />
      </div>
      {uso.data.bloqueada ? <p className="mt-2 text-xs text-peligro">Tope alcanzado: la IA queda bloqueada hasta el próximo mes.</p> : null}
      {uso.data.topeAlcanzado && uso.data.local ? <p className="mt-2 text-xs text-aviso">Tope alcanzado: mientras tanto responde gratis la IA local ({uso.data.modeloLocal}).</p> : null}
    </Tarjeta>
  );
}

export function AjustesIa() {
  const [vista, setVista] = useState<"memoria" | "skills" | "modelos" | "uso">("memoria");
  return (
    <div className="space-y-3">
      <Pestanas
        valor={vista}
        alCambiar={setVista}
        opciones={[
          { id: "memoria", texto: "Memoria" },
          { id: "skills", texto: "Skills" },
          { id: "modelos", texto: "IA gratis" },
          { id: "uso", texto: "Gasto" },
        ]}
      />
      {vista === "memoria" ? <Memoria /> : null}
      {vista === "skills" ? <Skills /> : null}
      {vista === "modelos" ? <ModelosGratis /> : null}
      {vista === "uso" ? <Uso /> : null}
    </div>
  );
}
