/** Administración de Pterodactyl: servidores, cuentas, nodos, eggs y extensiones de Blueprint. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Download, Egg, ExternalLink, FileJson, Plus, Power, Puzzle, RefreshCw, Search, Server, Trash2, Upload, UserPlus, Users } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { fmtFechaHora } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";
import { useServidores } from "../lib/vps";
import { Paginas } from "./Paginas";
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError } from "./ui";

interface ServidorAdmin {
  idApp: number;
  id: string;
  nombre: string;
  suspendido: boolean;
  usuario: number;
  nodo: number;
}
interface Cuenta {
  id: number;
  usuario: string;
  correo: string;
  nombre: string;
  admin: boolean;
  dosPasos: boolean;
  creado: string;
}
interface Nodo {
  id: number;
  nombre: string;
  fqdn: string;
  https: boolean;
  memoriaMb: number;
  discoMb: number;
  usadoMemoriaMb: number | null;
  usadoDiscoMb: number | null;
  ubicacion: number;
  mantenimiento: boolean;
}
interface Nido {
  id: number;
  nombre: string;
  eggs: { id: number; nombre: string; descripcion: string | null }[];
}
interface Puerto {
  id: number;
  ip: string;
  alias: string | null;
  puerto: number;
  usado: boolean;
}

const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["ptero"] });
const useCuentas = () => useQuery({ queryKey: ["ptero", "admin", "usuarios"], queryFn: () => api<Cuenta[]>("/api/ptero/admin/usuarios") });
const useNodos = () => useQuery({ queryKey: ["ptero", "admin", "nodos"], queryFn: () => api<{ nodos: Nodo[]; ubicaciones: { id: number; nombre: string }[] }>("/api/ptero/admin/nodos") });
const useNidos = () => useQuery({ queryKey: ["ptero", "admin", "eggs"], queryFn: () => api<Nido[]>("/api/ptero/admin/eggs") });

// ---------------------------------------------------------------- servidores
function Servidores() {
  const q = useQuery({ queryKey: ["ptero", "admin", "servidores"], queryFn: () => api<ServidorAdmin[]>("/api/ptero/admin/servidores") });
  const [creando, setCreando] = useState(false);
  const cambiar = async (s: ServidorAdmin) => {
    const accion = s.suspendido ? "unsuspend" : "suspend";
    if (!(await confirmar({ titulo: s.suspendido ? "Reactivar servidor" : "Suspender servidor", mensaje: `¿${s.suspendido ? "Reactivar" : "Suspender"} ${s.nombre}?` }))) return;
    await api(`/api/ptero/admin/servidores/${s.idApp}/${accion}`, { metodo: "POST" }).then(refrescar, avisarError);
  };
  const borrar = async (s: ServidorAdmin) => {
    if (!(await confirmar({ titulo: "Eliminar servidor", mensaje: `Se borra ${s.nombre} con todos sus archivos del nodo. No se puede deshacer.`, peligroso: true, textoExacto: s.nombre, boton: "Eliminar" }))) return;
    await api(`/api/ptero/admin/servidores/${s.idApp}`, { metodo: "DELETE" })
      .catch(async (err: unknown) => {
        // Si el nodo no responde, el panel solo lo deja borrar «a la fuerza».
        if (!(await confirmar({ titulo: "El nodo no respondió", mensaje: "¿Borrarlo de todos modos del panel? Los archivos pueden quedar en el nodo.", peligroso: true, textoExacto: s.nombre, boton: "Forzar" }))) throw err;
        return api(`/api/ptero/admin/servidores/${s.idApp}?forzar=1`, { metodo: "DELETE" });
      })
      .then(() => {
        avisar(`${s.nombre} eliminado`);
        refrescar();
      }, avisarError);
  };
  return (
    <Tarjeta
      titulo="Todos los servidores"
      icono={Server}
      acciones={
        <Boton tamano="sm" variante="primario" icono={Plus} onClick={() => setCreando(true)}>
          Crear servidor
        </Boton>
      }
    >
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data?.length === 0 ? <Vacio icono={Server} texto="El panel no tiene servidores." /> : null}
      <ul className="space-y-1">
        {q.data?.map((s) => (
          <li key={s.idApp} className="flex flex-wrap items-center gap-2 rounded-lg bg-fondo px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
            {s.suspendido ? <Insignia tono="peligro">Suspendido</Insignia> : <Insignia tono="ok">Activo</Insignia>}
            <Boton tamano="sm" icono={Power} onClick={() => void cambiar(s)}>
              {s.suspendido ? "Reactivar" : "Suspender"}
            </Boton>
            <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label={`Eliminar ${s.nombre}`} onClick={() => void borrar(s)} />
          </li>
        ))}
      </ul>
      {creando ? <CrearServidor alCerrar={() => setCreando(false)} /> : null}
    </Tarjeta>
  );
}

function CrearServidor({ alCerrar }: { alCerrar: () => void }) {
  const cuentas = useCuentas();
  const nodos = useNodos();
  const nidos = useNidos();
  const [f, setF] = useState({ nombre: "", usuario: "", nodo: "", asignacion: "", egg: "", memoriaMb: 2048, discoMb: 10240, cpu: 0, respaldos: 1 });
  const [nido = 0, eggId = 0] = f.egg ? f.egg.split(":").map(Number) : [];
  const puertos = useQuery({ queryKey: ["ptero", "admin", "puertos", f.nodo], queryFn: () => api<Puerto[]>(`/api/ptero/admin/nodos/${f.nodo}/puertos`), enabled: Boolean(f.nodo) });
  const variables = useQuery({
    queryKey: ["ptero", "admin", "variables", f.egg],
    queryFn: () => api<{ nombre: string; descripcion: string; variable: string; valor: string }[]>(`/api/ptero/admin/eggs/${nido}/${eggId}/variables`),
    enabled: Boolean(nido && eggId),
  });
  const [valores, setValores] = useState<Record<string, string>>({});
  const libres = puertos.data?.filter((p) => !p.usado) ?? [];
  const crear = useMutation({
    mutationFn: () =>
      api("/api/ptero/admin/servidores", {
        cuerpo: {
          nombre: f.nombre,
          usuario: Number(f.usuario),
          nido,
          egg: eggId,
          asignacion: Number(f.asignacion),
          memoriaMb: Number(f.memoriaMb),
          discoMb: Number(f.discoMb),
          cpu: Number(f.cpu),
          respaldos: Number(f.respaldos),
          variables: valores,
        },
      }),
    onSuccess: () => {
      avisar("Servidor creado: el nodo lo está instalando");
      refrescar();
      alCerrar();
    },
  });
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal abierto titulo="Crear servidor" alCerrar={alCerrar}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <Campo etiqueta="Nombre">
          <Entrada value={f.nombre} onChange={(e) => set("nombre", e.target.value)} required maxLength={191} />
        </Campo>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Dueño (cuenta del panel)">
            <Selector value={f.usuario} onChange={(e) => set("usuario", e.target.value)} required>
              <option value="">Elige…</option>
              {cuentas.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.usuario} ({c.correo})
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Tipo (egg)">
            <Selector value={f.egg} onChange={(e) => set("egg", e.target.value)} required>
              <option value="">Elige…</option>
              {nidos.data?.map((n) => (
                <optgroup key={n.id} label={n.nombre}>
                  {n.eggs.map((e) => (
                    <option key={e.id} value={`${n.id}:${e.id}`}>
                      {e.nombre}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Nodo">
            <Selector value={f.nodo} onChange={(e) => setF((x) => ({ ...x, nodo: e.target.value, asignacion: "" }))} required>
              <option value="">Elige…</option>
              {nodos.data?.nodos.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Puerto" ayuda={f.nodo && !puertos.isLoading && !libres.length ? "Ese nodo no tiene puertos libres: agrégalos en la pestaña Nodos." : undefined}>
            <Selector value={f.asignacion} onChange={(e) => set("asignacion", e.target.value)} required disabled={!f.nodo}>
              <option value="">Elige…</option>
              {libres.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.alias ?? p.ip}:{p.puerto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="RAM (MB)">
            <Entrada type="number" min={128} value={f.memoriaMb} onChange={(e) => set("memoriaMb", e.target.value)} />
          </Campo>
          <Campo etiqueta="Disco (MB)">
            <Entrada type="number" min={256} value={f.discoMb} onChange={(e) => set("discoMb", e.target.value)} />
          </Campo>
          <Campo etiqueta="CPU % (0 = sin límite)">
            <Entrada type="number" min={0} value={f.cpu} onChange={(e) => set("cpu", e.target.value)} />
          </Campo>
          <Campo etiqueta="Respaldos permitidos">
            <Entrada type="number" min={0} value={f.respaldos} onChange={(e) => set("respaldos", e.target.value)} />
          </Campo>
        </div>
        {variables.data?.length ? (
          <details className="rounded-xl bg-fondo p-3 text-sm">
            <summary className="cursor-pointer font-medium">Variables del egg ({variables.data.length})</summary>
            <div className="mt-2 space-y-2">
              {variables.data.map((v) => (
                <Campo key={v.variable} etiqueta={v.nombre} ayuda={v.descripcion}>
                  <Entrada value={valores[v.variable] ?? v.valor} onChange={(e) => setValores((x) => ({ ...x, [v.variable]: e.target.value }))} />
                </Campo>
              ))}
            </div>
          </details>
        ) : null}
        <ErrorCaja error={crear.error ?? cuentas.error ?? nodos.error ?? nidos.error} />
        <div className="flex justify-end gap-2">
          <Boton variante="fantasma" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={crear.isPending}>
            Crear
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- cuentas
const CUENTA_VACIA = { correo: "", usuario: "", nombre: "", apellido: "", password: "", admin: false };

function Cuentas() {
  const q = useCuentas();
  const [nueva, setNueva] = useState(false);
  const [f, setF] = useState(CUENTA_VACIA);
  const crear = useMutation({
    mutationFn: () => api("/api/ptero/admin/usuarios", { cuerpo: { ...f, password: f.password || undefined } }),
    onSuccess: () => {
      avisar(f.password ? "Cuenta creada" : "Cuenta creada: el panel le manda un correo para poner su contraseña");
      setNueva(false);
      setF(CUENTA_VACIA);
      refrescar();
    },
  });
  const borrar = async (c: Cuenta) => {
    if (!(await confirmar({ titulo: "Eliminar cuenta", mensaje: `¿Eliminar la cuenta ${c.usuario} del panel? (El panel no deja si todavía tiene servidores.)`, peligroso: true, textoExacto: c.usuario, boton: "Eliminar" }))) return;
    await api(`/api/ptero/admin/usuarios/${c.id}`, { metodo: "DELETE" }).then(refrescar, avisarError);
  };
  return (
    <Tarjeta
      titulo="Cuentas registradas en el panel"
      icono={Users}
      acciones={
        <Boton tamano="sm" variante="primario" icono={UserPlus} onClick={() => setNueva(true)}>
          Nueva cuenta
        </Boton>
      }
    >
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      <ul className="space-y-1">
        {q.data?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-fondo px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {c.usuario} {c.nombre && c.nombre !== "-" ? <span className="font-normal text-tenue">· {c.nombre}</span> : null}
              </p>
              <p className="truncate text-xs text-tenue">
                {c.correo} · desde {fmtFechaHora(c.creado)}
              </p>
            </div>
            {c.admin ? <Insignia tono="aviso">Admin</Insignia> : null}
            {c.dosPasos ? <Insignia tono="ok">2FA</Insignia> : <Insignia>Sin 2FA</Insignia>}
            <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label={`Eliminar ${c.usuario}`} onClick={() => void borrar(c)} />
          </li>
        ))}
      </ul>
      {nueva ? (
        <Modal abierto titulo="Nueva cuenta del panel" alCerrar={() => setNueva(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              crear.mutate();
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Correo">
                <Entrada type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} required />
              </Campo>
              <Campo etiqueta="Usuario">
                <Entrada value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} required />
              </Campo>
              <Campo etiqueta="Nombre">
                <Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
              </Campo>
              <Campo etiqueta="Apellido">
                <Entrada value={f.apellido} onChange={(e) => setF({ ...f, apellido: e.target.value })} />
              </Campo>
            </div>
            <Campo etiqueta="Contraseña (opcional)" ayuda="Si la dejas vacía, el panel le manda un correo para que ponga la suya.">
              <Entrada type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" minLength={8} />
            </Campo>
            <Interruptor activo={f.admin} alCambiar={(v) => setF({ ...f, admin: v })} etiqueta="Administrador del panel (puede ver y cambiar todo)" />
            <ErrorCaja error={crear.error} />
            <div className="flex justify-end">
              <Boton type="submit" variante="primario" cargando={crear.isPending}>
                Crear cuenta
              </Boton>
            </div>
          </form>
        </Modal>
      ) : null}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------- nodos
function Nodos() {
  const q = useNodos();
  const [nuevo, setNuevo] = useState(false);
  const [puertosDe, setPuertosDe] = useState<Nodo | null>(null);
  const verConfig = async (n: Nodo) => {
    const r = await api<{ config: string }>(`/api/ptero/admin/nodos/${n.id}/configuracion`).catch(avisarError);
    if (!r) return;
    await navigator.clipboard.writeText(r.config).catch(() => undefined);
    await confirmar({
      titulo: `Configuración de ${n.nombre}`,
      mensaje: "Ya está copiada. Pégala en /etc/pterodactyl/config.yml del nodo y reinicia Wings (systemctl restart wings). Lleva el token del nodo: no la compartas.",
      detalle: r.config,
      boton: "Listo",
    });
  };
  return (
    <Tarjeta
      titulo="Nodos"
      icono={Server}
      acciones={
        <Boton tamano="sm" variante="primario" icono={Plus} onClick={() => setNuevo(true)}>
          Crear nodo
        </Boton>
      }
    >
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data?.nodos.length === 0 ? <Vacio icono={Server} texto="Aún no hay nodos." /> : null}
      <ul className="space-y-2">
        {q.data?.nodos.map((n) => (
          <li key={n.id} className="rounded-lg bg-fondo px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{n.nombre}</span>
              {n.mantenimiento ? <Insignia tono="aviso">Mantenimiento</Insignia> : null}
              <Boton tamano="sm" onClick={() => setPuertosDe(n)}>
                Puertos
              </Boton>
              <Boton tamano="sm" icono={Copy} onClick={() => void verConfig(n)}>
                Config de Wings
              </Boton>
            </div>
            <p className="mt-1 text-xs text-tenue">
              {n.https ? "https" : "http"}://{n.fqdn} · RAM {n.usadoMemoriaMb ?? "?"}/{n.memoriaMb} MB · disco {n.usadoDiscoMb ?? "?"}/{n.discoMb} MB
            </p>
          </li>
        ))}
      </ul>
      {nuevo ? <CrearNodo ubicaciones={q.data?.ubicaciones ?? []} alCerrar={() => setNuevo(false)} /> : null}
      {puertosDe ? <PuertosNodo nodo={puertosDe} alCerrar={() => setPuertosDe(null)} /> : null}
    </Tarjeta>
  );
}

function CrearNodo({ ubicaciones, alCerrar }: { ubicaciones: { id: number; nombre: string }[]; alCerrar: () => void }) {
  const [f, setF] = useState({ nombre: "", ubicacion: String(ubicaciones[0]?.id ?? ""), nuevaUbicacion: "", fqdn: "", https: true, detrasDeProxy: false, memoriaMb: 8192, discoMb: 102400, puertoWings: 8080, puertoSftp: 2022 });
  const crear = useMutation({
    mutationFn: async () => {
      let ubicacion = Number(f.ubicacion);
      if (!ubicacion) ubicacion = (await api<{ id: number }>("/api/ptero/admin/ubicaciones", { cuerpo: { nombre: f.nuevaUbicacion || "principal" } })).id;
      return api("/api/ptero/admin/nodos", {
        cuerpo: { nombre: f.nombre, ubicacion, fqdn: f.fqdn, https: f.https, detrasDeProxy: f.detrasDeProxy, memoriaMb: Number(f.memoriaMb), discoMb: Number(f.discoMb), puertoWings: Number(f.puertoWings), puertoSftp: Number(f.puertoSftp) },
      });
    },
    onSuccess: () => {
      avisar("Nodo creado: copia su «Config de Wings» al servidor del nodo");
      refrescar();
      alCerrar();
    },
  });
  return (
    <Modal abierto titulo="Crear nodo" alCerrar={alCerrar}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Ubicación">
            <Selector value={f.ubicacion} onChange={(e) => setF({ ...f, ubicacion: e.target.value })}>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
              <option value="">Nueva ubicación…</option>
            </Selector>
          </Campo>
          {!f.ubicacion ? (
            <Campo etiqueta="Nombre de la ubicación">
              <Entrada value={f.nuevaUbicacion} onChange={(e) => setF({ ...f, nuevaUbicacion: e.target.value })} placeholder="mx-1" />
            </Campo>
          ) : null}
          <Campo etiqueta="Dominio o IP del nodo" ayuda="Ej. node1.mexicanland.net">
            <Entrada value={f.fqdn} onChange={(e) => setF({ ...f, fqdn: e.target.value })} required />
          </Campo>
          <Campo etiqueta="RAM total (MB)">
            <Entrada type="number" value={f.memoriaMb} onChange={(e) => setF({ ...f, memoriaMb: Number(e.target.value) })} />
          </Campo>
          <Campo etiqueta="Disco total (MB)">
            <Entrada type="number" value={f.discoMb} onChange={(e) => setF({ ...f, discoMb: Number(e.target.value) })} />
          </Campo>
          <Campo etiqueta="Puerto de Wings">
            <Entrada type="number" value={f.puertoWings} onChange={(e) => setF({ ...f, puertoWings: Number(e.target.value) })} />
          </Campo>
          <Campo etiqueta="Puerto SFTP">
            <Entrada type="number" value={f.puertoSftp} onChange={(e) => setF({ ...f, puertoSftp: Number(e.target.value) })} />
          </Campo>
        </div>
        <Interruptor activo={f.https} alCambiar={(v) => setF({ ...f, https: v })} etiqueta="Usar HTTPS (recomendado)" />
        <Interruptor activo={f.detrasDeProxy} alCambiar={(v) => setF({ ...f, detrasDeProxy: v })} etiqueta="Está detrás de un proxy (Cloudflare naranja, etc.)" />
        <ErrorCaja error={crear.error} />
        <div className="flex justify-end">
          <Boton type="submit" variante="primario" cargando={crear.isPending}>
            Crear nodo
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

function PuertosNodo({ nodo, alCerrar }: { nodo: Nodo; alCerrar: () => void }) {
  const q = useQuery({ queryKey: ["ptero", "admin", "puertos", String(nodo.id)], queryFn: () => api<Puerto[]>(`/api/ptero/admin/nodos/${nodo.id}/puertos`) });
  const [ip, setIp] = useState("0.0.0.0");
  const [puertos, setPuertos] = useState("");
  const agregar = useMutation({
    mutationFn: () => api(`/api/ptero/admin/nodos/${nodo.id}/puertos`, { cuerpo: { ip, puertos: puertos.split(/[\s,]+/).filter(Boolean) } }),
    onSuccess: () => {
      avisar("Puertos agregados");
      setPuertos("");
      void q.refetch();
    },
  });
  return (
    <Modal abierto titulo={`Puertos de ${nodo.nombre}`} alCerrar={alCerrar}>
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="IP">
          <Entrada value={ip} onChange={(e) => setIp(e.target.value)} />
        </Campo>
        <Campo etiqueta="Puertos" ayuda="25565 o 25565-25570, separados por coma">
          <Entrada value={puertos} onChange={(e) => setPuertos(e.target.value)} placeholder="25565-25570" />
        </Campo>
      </div>
      <Boton className="mt-2" variante="primario" icono={Plus} cargando={agregar.isPending} disabled={!puertos.trim()} onClick={() => agregar.mutate()}>
        Agregar
      </Boton>
      <ErrorCaja error={agregar.error ?? q.error} />
      <div className="mt-3 flex max-h-64 flex-wrap gap-1 overflow-y-auto">
        {q.data?.map((p) => (
          <Insignia key={p.id} tono={p.usado ? "neutro" : "ok"}>
            {p.alias ?? p.ip}:{p.puerto}
            {p.usado ? " · en uso" : ""}
          </Insignia>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- eggs
function SelectorVps({ valor, alCambiar }: { valor: string; alCambiar: (v: string) => void }) {
  const vps = useServidores();
  if ((vps.data?.length ?? 0) < 2) return null;
  return (
    <Campo etiqueta="VPS donde está el panel">
      <Selector value={valor} onChange={(e) => alCambiar(e.target.value)}>
        {vps.data?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </Selector>
    </Campo>
  );
}

function Eggs() {
  const q = useNidos();
  const [nido, setNido] = useState("");
  const [servidor, setServidor] = useState("");
  const archivo = useRef<HTMLInputElement>(null);
  const importar = useMutation({
    mutationFn: async (f: File) =>
      api<{ nombre: string }>("/api/ptero/admin/eggs/importar", { cuerpo: { nido: Number(nido || q.data?.[0]?.id), json: await f.text(), ...(servidor ? { servidorId: servidor } : {}) } }),
    onSuccess: (r) => {
      avisar(`Egg «${r.nombre}» importado`);
      refrescar();
    },
    onError: avisarError,
  });
  return (
    <Tarjeta titulo="Eggs (tipos de servidor)" icono={Egg}>
      <div className="flex flex-wrap items-end gap-2">
        <Campo etiqueta="Importar en el nido">
          <Selector value={nido} onChange={(e) => setNido(e.target.value)}>
            {q.data?.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <SelectorVps valor={servidor} alCambiar={setServidor} />
        <input
          ref={archivo}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importar.mutate(f);
          }}
        />
        <Boton variante="primario" icono={FileJson} cargando={importar.isPending} disabled={!q.data?.length} onClick={() => archivo.current?.click()}>
          Importar egg (.json)
        </Boton>
      </div>
      <p className="mt-1 text-xs text-tenue">Bájalos de pterodactyleggs.com o de GitHub (archivo egg-*.json). Se importa en el panel por SSH, igual que «Admin → Nests → Import Egg».</p>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      <div className="mt-3 space-y-3">
        {q.data?.map((n) => (
          <div key={n.id}>
            <p className="text-sm font-medium">{n.nombre}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {n.eggs.map((e) => (
                <span key={e.id} title={e.descripcion ?? ""}>
                  <Insignia>{e.nombre}</Insignia>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------- Blueprint
interface EstadoBlueprint {
  panel: boolean;
  blueprint: boolean;
  servidor: string;
  versionPanel?: string | null;
  versionBlueprint?: string | null;
  extensiones: { id: string; nombre: string; version: string; autor: string }[];
}
interface Revision {
  token: string;
  info: { identificador: string; nombre: string; version: string; autor: string; descripcion: string; objetivo: string };
  tamano: number;
  blueprint: boolean;
  versionPanel: string | null;
  versionBlueprint: string | null;
  compatible: "si" | "quizas" | "no";
  yaInstalada: boolean;
}
interface ExtensionTienda {
  id: string;
  nombre: string;
  resumen: string;
  autor: string;
  imagen: string | null;
  origen: "blueprint" | "github";
  pagina: string;
  descarga: string | null;
  popularidad: number;
  actualizada: string | null;
  recomendada: boolean;
}

/** Muestra qué es la extensión y si es compatible; al confirmar se instala (pide PIN o huella). */
function ConfirmarInstalacion({ r, servidor, alCerrar, alTerminar }: { r: Revision; servidor: string; alCerrar: () => void; alTerminar: () => void }) {
  const instalar = useMutation({
    mutationFn: async () => {
      const ok = await confirmar({
        titulo: `Instalar ${r.info.nombre}`,
        mensaje: "Blueprint instala la extensión y recompila el panel (de 1 a 10 minutos; el panel puede verse raro mientras). Instala solo extensiones en las que confíes.",
        boton: "Instalar",
      });
      if (!ok) return false;
      await api("/api/ptero/admin/blueprint/instalar", { cuerpo: { token: r.token, ...(servidor ? { servidorId: servidor } : {}) } });
      return true;
    },
    onSuccess: (ok) => {
      if (!ok) return;
      avisar(`${r.info.nombre} instalada`);
      alTerminar();
      alCerrar();
    },
    onError: avisarError,
  });
  const textoCompat = { si: "Compatible con tu Blueprint", quizas: "No se pudo comprobar la compatibilidad", no: "Se hizo para un Blueprint más nuevo que el tuyo" } as const;
  return (
    <Modal abierto titulo="Revisar extensión" alCerrar={alCerrar} ancho="max-w-md">
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-lg font-semibold">{r.info.nombre}</p>
          <p className="text-tenue">
            {r.info.identificador}
            {r.info.version ? ` · v${r.info.version}` : ""}
            {r.info.autor ? ` · ${r.info.autor}` : ""} · {(r.tamano / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>
        {r.info.descripcion ? <p>{r.info.descripcion}</p> : null}
        <div className="rounded-xl bg-fondo p-3">
          <p>
            Panel: <b>{r.versionPanel ?? "—"}</b> · Blueprint: <b>{r.versionBlueprint ?? "—"}</b> · La extensión pide: <b>{r.info.objetivo || "—"}</b>
          </p>
          <p className="mt-1">
            <Insignia tono={r.compatible === "si" ? "ok" : r.compatible === "no" ? "peligro" : "aviso"}>{textoCompat[r.compatible]}</Insignia>
          </p>
        </div>
        {!r.blueprint ? <p className="text-peligro">Blueprint no está instalado en el panel: instálalo primero (blueprint.zip).</p> : null}
        {r.yaInstalada ? <p className="text-aviso">Ya está instalada: se actualizará a esta versión.</p> : null}
        {instalar.isPending ? <Cargando texto="Instalando y recompilando el panel… no cierres esta pantalla" /> : null}
        <Boton variante="primario" className="w-full" icono={Download} cargando={instalar.isPending} disabled={!r.blueprint} onClick={() => instalar.mutate()}>
          {r.yaInstalada ? "Actualizar" : "Instalar"}
        </Boton>
      </div>
    </Modal>
  );
}

function TiendaBlueprint({ servidor, alRevisar }: { servidor: string; alRevisar: (r: Revision) => void }) {
  const [buscar, setBuscar] = useState("");
  const [q, setQ] = useState("");
  const [origen, setOrigen] = useState<"todas" | "blueprint" | "github">("todas");
  const [pagina, setPagina] = useState(1);
  const consulta = servidor ? `?servidorId=${servidor}` : "";
  const tienda = useQuery({
    queryKey: ["ptero", "admin", "blueprint-tienda", q, origen, pagina],
    queryFn: () => api<{ total: number; paginas: number; avisos: string[]; extensiones: ExtensionTienda[] }>(`/api/ptero/admin/blueprint/tienda?q=${encodeURIComponent(q)}&origen=${origen}&pagina=${pagina}`),
  });
  const revisar = useMutation({
    mutationFn: (e: ExtensionTienda) =>
      api<Revision>(`/api/ptero/admin/blueprint/revisar${consulta}`, { cuerpo: e.descarga ? { url: e.descarga } : e.origen === "github" ? { repo: e.id.slice(3) } : { url: e.pagina } }),
    onSuccess: alRevisar,
    onError: avisarError,
  });
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(buscar.trim());
          setPagina(1);
        }}
      >
        <Entrada className="min-w-0 flex-1" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar extensiones gratis (ej. mods, temas, backups)" />
        <Selector className="w-auto" value={origen} onChange={(e) => (setOrigen(e.target.value as typeof origen), setPagina(1))}>
          <option value="todas">Todas</option>
          <option value="blueprint">Página oficial</option>
          <option value="github">GitHub</option>
        </Selector>
        <Boton type="submit" icono={Search}>
          Buscar
        </Boton>
      </form>
      {tienda.data?.avisos.map((a) => (
        <p key={a} className="text-xs text-aviso">
          {a}
        </p>
      ))}
      {tienda.isLoading ? <Cargando /> : null}
      <ErrorCaja error={tienda.error} />
      {tienda.data && !tienda.data.extensiones.length ? <Vacio icono={Puzzle} texto="No se encontraron extensiones gratis con esa búsqueda." /> : null}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {tienda.data?.extensiones.map((e) => (
          <div key={e.id} className="flex gap-3 rounded-xl border border-borde bg-fondo p-3">
            {e.imagen ? <img src={e.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <Puzzle className="h-12 w-12 shrink-0 p-2 text-tenue" />}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1 font-medium">
                <span className="truncate">{e.nombre}</span>
                {e.recomendada ? <Insignia tono="ok">Recomendada</Insignia> : null}
              </p>
              <p className="line-clamp-2 text-xs text-tenue">{e.resumen || "Sin descripción"}</p>
              <p className="mt-0.5 text-[11px] text-tenue">
                {e.autor} · {e.origen === "github" ? `★ ${e.popularidad}` : `${e.popularidad} descargas`} · {e.origen === "github" ? "GitHub" : "Blueprint"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Boton tamano="sm" variante="primario" icono={Download} cargando={revisar.isPending && revisar.variables?.id === e.id} disabled={revisar.isPending} onClick={() => revisar.mutate(e)}>
                  Instalar
                </Boton>
                <Boton tamano="sm" variante="fantasma" icono={ExternalLink} onClick={() => abrirExterno(e.pagina)}>
                  Ver
                </Boton>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Paginas pagina={pagina} total={tienda.data?.paginas} alCambiar={setPagina} />
      <p className="text-xs text-tenue">Solo extensiones gratis. Antes de instalar se baja y se revisa el archivo (nombre, versión y compatibilidad); nada se instala sin que confirmes.</p>
    </div>
  );
}

function Blueprint() {
  const [servidor, setServidor] = useState("");
  const [vista, setVista] = useState<"instaladas" | "tienda">("instaladas");
  const [revision, setRevision] = useState<Revision | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const consulta = servidor ? `?servidorId=${servidor}` : "";
  const q = useQuery({ queryKey: ["ptero", "admin", "blueprint", servidor], queryFn: () => api<EstadoBlueprint>(`/api/ptero/admin/blueprint${consulta}`), retry: false });
  const subir = useMutation({
    mutationFn: async (f: File) => {
      // Se detecta solo: .blueprint (o un .zip con conf.yml adentro, lo revisa el servidor).
      if (!/\.(blueprint|zip)$/i.test(f.name)) throw new Error("Elige un archivo .blueprint");
      const datos = new FormData();
      datos.append("archivo", f, f.name);
      return api<Revision>(`/api/ptero/admin/blueprint/revisar${consulta}`, { metodo: "POST", formulario: datos });
    },
    onSuccess: setRevision,
    onError: avisarError,
  });
  const quitar = useMutation({
    mutationFn: async (e: { id: string; nombre: string }) => {
      const ok = await confirmar({
        titulo: "Quitar extensión",
        mensaje: `Blueprint quita ${e.nombre} y recompila el panel (tarda de 1 a 5 minutos; el panel puede verse raro mientras).`,
        peligroso: true,
        textoExacto: e.id,
        boton: "Quitar",
      });
      if (!ok) return null;
      await api(`/api/ptero/admin/blueprint/${e.id}${consulta}`, { metodo: "DELETE" });
      return e;
    },
    onSuccess: (e) => {
      if (!e) return;
      avisar(`${e.nombre} quitada`);
      void q.refetch();
    },
    onError: avisarError,
  });
  return (
    <Tarjeta
      titulo="Extensiones de Blueprint"
      icono={Puzzle}
      acciones={<Boton tamano="sm" variante="fantasma" icono={RefreshCw} cargando={q.isFetching} onClick={() => void q.refetch()} aria-label="Actualizar" />}
    >
      <div className="space-y-3">
        <SelectorVps valor={servidor} alCambiar={setServidor} />
        {q.data?.panel ? (
          <p className="text-xs text-tenue">
            Panel {q.data.versionPanel ?? "—"} · Blueprint {q.data.blueprint ? (q.data.versionBlueprint ?? "instalado") : "no instalado"} · {q.data.servidor}
          </p>
        ) : null}
        <Pestanas
          valor={vista}
          alCambiar={setVista}
          opciones={[
            { id: "instaladas", texto: "Instaladas" },
            { id: "tienda", texto: "Tienda gratis" },
          ]}
        />
        {vista === "instaladas" ? (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                const f = e.dataTransfer.files[0];
                if (f) subir.mutate(f);
              }}
              className={`flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3 text-sm ${arrastrando ? "border-acento bg-acento/10" : "border-borde"}`}
            >
              <Upload className="h-5 w-5 text-tenue" />
              <span className="min-w-0 flex-1 text-tenue">Sube o arrastra aquí un archivo .blueprint para instalarlo.</span>
              <Boton tamano="sm" icono={Upload} cargando={subir.isPending} onClick={() => archivo.current?.click()}>
                Subir .blueprint
              </Boton>
              <input
                ref={archivo}
                type="file"
                accept=".blueprint,.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) subir.mutate(f);
                  e.target.value = "";
                }}
              />
            </div>
            <ErrorCaja error={q.error} />
            {q.isLoading ? <Cargando texto="Revisando el panel por SSH…" /> : null}
            {q.data && !q.data.panel ? <Vacio icono={Puzzle} texto={`No encontré el panel en /var/www/pterodactyl de ${q.data.servidor}.`} /> : null}
            {q.data?.panel && !q.data.blueprint ? <p className="text-sm text-tenue">Blueprint no está instalado en este panel.</p> : null}
            {q.data?.panel && q.data.blueprint && !q.data.extensiones.length ? <Vacio icono={Puzzle} texto="No hay extensiones instaladas." /> : null}
            {quitar.isPending ? <Cargando texto="Quitando y recompilando el panel… no cierres esta pantalla" /> : null}
            <ul className="space-y-1">
              {q.data?.extensiones.map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded-lg bg-fondo px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.nombre}</p>
                    <p className="truncate text-xs text-tenue">
                      {e.id}
                      {e.version ? ` · v${e.version}` : ""}
                      {e.autor ? ` · ${e.autor}` : ""}
                    </p>
                  </div>
                  <Boton tamano="sm" variante="peligro" icono={Trash2} disabled={quitar.isPending} onClick={() => quitar.mutate(e)}>
                    Quitar
                  </Boton>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <TiendaBlueprint servidor={servidor} alRevisar={setRevision} />
        )}
      </div>
      {revision ? <ConfirmarInstalacion r={revision} servidor={servidor} alCerrar={() => setRevision(null)} alTerminar={() => void q.refetch()} /> : null}
    </Tarjeta>
  );
}

const PESTANAS = [
  { id: "servidores", texto: "Servidores" },
  { id: "cuentas", texto: "Cuentas" },
  { id: "nodos", texto: "Nodos" },
  { id: "eggs", texto: "Eggs" },
  { id: "blueprint", texto: "Blueprint" },
] as const;

export function PteroAdmin() {
  const [vista, setVista] = useState<(typeof PESTANAS)[number]["id"]>("servidores");
  return (
    <div className="space-y-3">
      <Pestanas opciones={PESTANAS} valor={vista} alCambiar={setVista} />
      {vista === "servidores" ? <Servidores /> : null}
      {vista === "cuentas" ? <Cuentas /> : null}
      {vista === "nodos" ? <Nodos /> : null}
      {vista === "eggs" ? <Eggs /> : null}
      {vista === "blueprint" ? <Blueprint /> : null}
    </div>
  );
}
