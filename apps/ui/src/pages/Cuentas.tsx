/**
 * Cuentas y permisos (solo maestra): alta de cuentas, permisos por módulo,
 * roles tipo Discord (nombre, color y permisos), desactivar y restablecer
 * contraseña. Los permisos de una cuenta = los suyos + los de sus roles.
 */
import { MODULES, MODULE_IDS, moduloEnEdicion, PERMISSION_LEVELS, type ModuleId, type PermissionLevel } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Crown, KeyRound, LogOut, Pencil, Plus, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import { useState } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { fmtFecha } from "../lib/formato";

type Permisos = Partial<Record<ModuleId, PermissionLevel>>;

interface Cuenta {
  id: string;
  email: string;
  nombre: string;
  rol: "maestra" | "usuario";
  activo: boolean;
  dosPasos: boolean;
  sesiones: number;
  creada: string;
  permisos: Permisos;
  roles: string[];
}

interface Rol {
  id: string;
  nombre: string;
  color: string;
  posicion: number;
  permisos: Permisos;
  miembros: number;
}

const OTORGABLES = MODULE_IDS.filter((m) => !MODULES[m].masterOnly && moduloEnEdicion(m));
const NIVEL: Record<PermissionLevel, string> = { ninguno: "Sin acceso", lectura: "Ver", escritura: "Editar", administrar: "Administrar" };

function useRoles() {
  return useQuery({ queryKey: ["cuentas", "roles"], queryFn: () => api<Rol[]>("/api/roles") });
}

export function InsigniaRol({ nombre, color }: { nombre: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: color, color }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {nombre}
    </span>
  );
}

function EditorPermisos({ valor, alCambiar }: { valor: Permisos; alCambiar: (p: Permisos) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {OTORGABLES.map((m) => (
        <label key={m} className="flex items-center justify-between gap-2 rounded-xl bg-tarjeta px-3 py-2 text-sm">
          <span className="truncate">{MODULES[m].label}</span>
          <Selector className="h-8 w-36" value={valor[m] ?? "ninguno"} onChange={(e) => alCambiar({ ...valor, [m]: e.target.value as PermissionLevel })}>
            {PERMISSION_LEVELS.map((n) => (
              <option key={n} value={n}>
                {NIVEL[n]}
              </option>
            ))}
          </Selector>
        </label>
      ))}
    </div>
  );
}

function SelectorRoles({ valor, alCambiar }: { valor: string[]; alCambiar: (ids: string[]) => void }) {
  const roles = useRoles();
  if (!roles.data?.length) return <p className="text-xs text-tenue">No hay roles. Créalos en la pestaña Roles.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {roles.data.map((r) => {
        const activo = valor.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => alCambiar(activo ? valor.filter((x) => x !== r.id) : [...valor, r.id])}
            className={cx("rounded-full border px-3 py-1 text-xs font-medium transition-opacity", !activo && "opacity-40 hover:opacity-80")}
            style={{ borderColor: r.color, color: r.color, background: activo ? `${r.color}22` : "transparent" }}
          >
            {activo ? "✓ " : ""}
            {r.nombre}
          </button>
        );
      })}
    </div>
  );
}

function Nueva({ alCerrar }: { alCerrar: () => void }) {
  const [d, setD] = useState({ email: "", nombre: "", password: "" });
  const [permisos, setPermisos] = useState<Permisos>({});
  const [roles, setRoles] = useState<string[]>([]);
  const crear = useMutation({
    mutationFn: async () => {
      const r = await api<{ id: string }>("/api/cuentas", { metodo: "POST", cuerpo: { ...d, permisos } });
      if (roles.length) await api(`/api/cuentas/${r.id}/roles`, { metodo: "PUT", cuerpo: { roles } });
    },
    onSuccess: () => {
      avisar("Cuenta creada");
      void queryClient.invalidateQueries({ queryKey: ["cuentas"] });
      alCerrar();
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
    >
      <Campo etiqueta="Nombre">
        <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required />
      </Campo>
      <Campo etiqueta="Correo">
        <Entrada type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} required />
      </Campo>
      <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 12 caracteres. Compártela por un medio seguro; la persona puede cambiarla en Ajustes → Cuenta.">
        <Entrada type="password" autoComplete="new-password" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} required />
      </Campo>
      <Campo etiqueta="Roles">
        <SelectorRoles valor={roles} alCambiar={setRoles} />
      </Campo>
      <p className="text-sm font-medium">Permisos extra (además de los de sus roles)</p>
      <EditorPermisos valor={permisos} alCambiar={setPermisos} />
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" cargando={crear.isPending}>
        Crear cuenta
      </Boton>
    </form>
  );
}

/** Claves de los servicios: si esta persona usa las del servidor y si puede verlas (enmascaradas). */
function PoliticaClaves({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["cuentas", id, "politica-claves"], queryFn: () => api<{ usarDelServidor: boolean; verServicios: boolean }>(`/api/cuentas/${id}/politica-claves`) });
  const guardar = useMutation({
    mutationFn: (d: { usarDelServidor: boolean; verServicios: boolean }) => api(`/api/cuentas/${id}/politica-claves`, { metodo: "PUT", cuerpo: d }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cuentas", id, "politica-claves"] }),
    onError: avisarError,
  });
  if (!q.data) return null;
  const d = q.data;
  return (
    <div className="space-y-2 rounded-xl border border-borde p-3">
      <p className="text-sm font-medium">Claves de los servicios (APIs)</p>
      <Interruptor
        activo={d.usarDelServidor}
        alCambiar={(v) => guardar.mutate({ ...d, usarDelServidor: v })}
        etiqueta="Puede usar tus claves (IA, Gemini, TMDB…); si no, usa las suyas"
      />
      <Interruptor
        activo={d.verServicios}
        alCambiar={async (v) => {
          if (v && !(await confirmar({ titulo: "Mostrar servicios y claves", mensaje: "Podrá ver qué servicios tienes configurados y los datos que no son secretos (URLs, IDs). Las claves secretas nunca se le muestran.", boton: "Permitir" }))) return;
          guardar.mutate({ ...d, verServicios: v });
        }}
        etiqueta="Puede ver Ajustes → Servicios y claves (solo lectura, secretos ocultos)"
      />
      <p className="text-xs text-tenue">Cada persona puede poner sus propias claves en Ajustes → Mis claves, y compartirlas si quiere (se le avisa que gastan su cuota).</p>
    </div>
  );
}

function Detalle({ c }: { c: Cuenta }) {
  const [permisos, setPermisos] = useState(c.permisos);
  const [roles, setRoles] = useState(c.roles);
  const [clave, setClave] = useState<string | null>(null);
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["cuentas"] });
  const cambiar = useMutation({
    mutationFn: (cuerpo: Record<string, unknown>) => api(`/api/cuentas/${c.id}`, { metodo: "PATCH", cuerpo }),
    onSuccess: () => {
      avisar("Guardado");
      refrescar();
    },
    onError: avisarError,
  });
  const guardarRoles = useMutation({
    mutationFn: () => api(`/api/cuentas/${c.id}/roles`, { metodo: "PUT", cuerpo: { roles } }),
    onSuccess: () => {
      avisar("Roles guardados");
      refrescar();
    },
    onError: avisarError,
  });
  const contrasena = useMutation({
    mutationFn: (password: string) => api(`/api/cuentas/${c.id}/contrasena`, { metodo: "POST", cuerpo: { password } }),
    onSuccess: () => {
      setClave(null);
      avisar("Contraseña restablecida; se cerraron sus sesiones");
      refrescar();
    },
    onError: avisarError,
  });
  const cerrar = useMutation({
    mutationFn: () => api(`/api/cuentas/${c.id}/cerrar-sesiones`, { metodo: "POST" }),
    onSuccess: () => {
      avisar("Sesiones cerradas");
      refrescar();
    },
    onError: avisarError,
  });
  const hacerMaestra = useMutation({
    mutationFn: () => api(`/api/cuentas/${c.id}/hacer-maestra`, { cuerpo: { confirmacion: c.email } }),
    onSuccess: () => {
      avisar(`${c.nombre} ahora es la cuenta maestra`);
      void queryClient.invalidateQueries();
      window.location.assign("/");
    },
    onError: avisarError,
  });
  const eliminar = useMutation({
    mutationFn: () => api(`/api/cuentas/${c.id}`, { metodo: "DELETE", cuerpo: { confirmacion: c.email } }),
    onSuccess: () => {
      avisar("Cuenta eliminada");
      refrescar();
    },
    onError: avisarError,
  });
  const cambioPermisos = JSON.stringify(permisos) !== JSON.stringify(c.permisos);
  const cambioRoles = [...roles].sort().join() !== [...c.roles].sort().join();

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">Roles</p>
        <SelectorRoles valor={roles} alCambiar={setRoles} />
        {cambioRoles ? (
          <Boton className="mt-2" tamano="sm" variante="primario" cargando={guardarRoles.isPending} onClick={() => guardarRoles.mutate()}>
            Guardar roles
          </Boton>
        ) : null}
      </div>
      {c.rol === "maestra" ? (
        <p className="text-xs text-tenue">La cuenta maestra tiene acceso total; los roles solo se muestran como insignia.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Interruptor
              activo={c.activo}
              alCambiar={async (v) => {
                if (!v && !(await confirmar({ titulo: `Desactivar a ${c.nombre}`, mensaje: "No podrá entrar y se cierran sus sesiones al momento.", peligroso: true, boton: "Desactivar" })))
                  return;
                cambiar.mutate({ activo: v });
              }}
              etiqueta={c.activo ? "Activa" : "Desactivada"}
            />
            <Boton tamano="sm" icono={LogOut} onClick={() => cerrar.mutate()} cargando={cerrar.isPending}>
              Cerrar sesiones ({c.sesiones})
            </Boton>
            <Boton tamano="sm" icono={KeyRound} onClick={() => setClave("")}>
              Restablecer contraseña
            </Boton>
            <Boton
              tamano="sm"
              variante="peligro"
              icono={Trash2}
              cargando={eliminar.isPending}
              onClick={async () => {
                const ok = await confirmar({
                  titulo: `Eliminar la cuenta de ${c.nombre}`,
                  mensaje:
                    "Se borran sus notas, recordatorios, chats, sesiones y permisos, y desaparece de la lista. El correo queda libre para usarlo otra vez. El registro de actividad se conserva. No se puede deshacer.",
                  detalle: c.email,
                  peligroso: true,
                  textoExacto: c.email,
                  boton: "Eliminar",
                });
                if (ok) eliminar.mutate();
              }}
            >
              Eliminar cuenta
            </Boton>
            <Boton
              tamano="sm"
              icono={Crown}
              cargando={hacerMaestra.isPending}
              onClick={async () => {
                if (!c.dosPasos) {
                  avisar(`${c.nombre} primero debe activar su código 2FA en su app: Ajustes → Seguridad → Código 2FA.`, "info");
                  return;
                }
                const ok = await confirmar({
                  titulo: `Pasar la cuenta maestra a ${c.nombre}`,
                  mensaje:
                    "Tendrá control total de la app (VPS, bóveda maestra, cuentas, registro de actividad). Tú quedarás como cuenta normal y solo esa persona podrá devolvértela. Úsalo solo con alguien de total confianza.",
                  detalle: c.email,
                  peligroso: true,
                  textoExacto: c.email,
                  boton: "Pasar cuenta maestra",
                });
                if (ok) hacerMaestra.mutate();
              }}
            >
              Pasar cuenta maestra
            </Boton>
          </div>
          <PoliticaClaves id={c.id} />
          <p className="text-sm font-medium">Permisos extra (además de los de sus roles)</p>
          <EditorPermisos valor={permisos} alCambiar={setPermisos} />
          <Boton variante="primario" disabled={!cambioPermisos} cargando={cambiar.isPending} onClick={() => cambiar.mutate({ permisos })}>
            Guardar permisos
          </Boton>
        </>
      )}
      <Modal abierto={clave !== null} titulo="Nueva contraseña" alCerrar={() => setClave(null)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (clave) contrasena.mutate(clave);
          }}
        >
          <Entrada type="password" autoComplete="new-password" value={clave ?? ""} onChange={(e) => setClave(e.target.value)} placeholder="Mínimo 12 caracteres" />
          <Boton type="submit" variante="primario" cargando={contrasena.isPending}>
            Guardar
          </Boton>
        </form>
      </Modal>
    </div>
  );
}

function ListaCuentas() {
  const lista = useQuery({ queryKey: ["cuentas"], queryFn: () => api<Cuenta[]>("/api/cuentas") });
  const roles = useRoles();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const rolPorId = new Map((roles.data ?? []).map((r) => [r.id, r]));
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Boton variante="primario" icono={Plus} onClick={() => setNueva(true)}>
          Nueva cuenta
        </Boton>
      </div>
      {lista.isLoading ? <Cargando /> : null}
      <ErrorCaja error={lista.error} />
      {lista.data?.map((c) => (
        <Tarjeta
          key={c.id}
          icono={c.rol === "maestra" ? ShieldCheck : UserCog}
          titulo={
            <span>
              {c.nombre} <span className="font-normal text-tenue">· {c.email}</span>
            </span>
          }
          acciones={
            <>
              {c.rol === "maestra" ? <Insignia tono="ok">Maestra</Insignia> : null}
              {!c.activo ? <Insignia tono="peligro">Desactivada</Insignia> : null}
              {c.dosPasos ? <Insignia>2FA</Insignia> : null}
              <Boton tamano="sm" variante="fantasma" onClick={() => setAbierta(abierta === c.id ? null : c.id)}>
                {abierta === c.id ? "Cerrar" : "Editar"}
              </Boton>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {c.roles.map((id) => {
              const r = rolPorId.get(id);
              return r ? <InsigniaRol key={id} nombre={r.nombre} color={r.color} /> : null;
            })}
            <span className="text-xs text-tenue">
              Creada {fmtFecha(c.creada)} · {c.sesiones} sesión(es) activa(s)
              {c.rol === "maestra" ? " · acceso total" : ""}
            </span>
          </div>
          {abierta === c.id ? (
            <div className="mt-4">
              <Detalle c={c} />
            </div>
          ) : null}
        </Tarjeta>
      ))}
      <Modal abierto={nueva} titulo="Nueva cuenta" alCerrar={() => setNueva(false)} ancho="max-w-2xl">
        <Nueva alCerrar={() => setNueva(false)} />
      </Modal>
    </div>
  );
}

const COLORES = ["#f5c542", "#5ab4ff", "#30d158", "#ff453a", "#b794ff", "#ff9f0a", "#64d2ff", "#ff6482", "#8e8e93"];

function EditorRol({ inicial, alCerrar }: { inicial: Rol | null; alCerrar: () => void }) {
  const [d, setD] = useState({ nombre: inicial?.nombre ?? "", color: inicial?.color ?? COLORES[0]!, posicion: inicial?.posicion ?? 10 });
  const [permisos, setPermisos] = useState<Permisos>(inicial?.permisos ?? {});
  const guardar = useMutation({
    mutationFn: () =>
      inicial
        ? api(`/api/roles/${inicial.id}`, { metodo: "PATCH", cuerpo: { ...d, permisos } })
        : api("/api/roles", { metodo: "POST", cuerpo: { ...d, permisos } }),
    onSuccess: () => {
      avisar("Rol guardado");
      void queryClient.invalidateQueries({ queryKey: ["cuentas"] });
      alCerrar();
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <Campo etiqueta="Nombre del rol">
          <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Ej. Moderador" required maxLength={40} />
        </Campo>
        <Campo etiqueta="Orden">
          <Entrada type="number" min={0} max={1000} value={d.posicion} onChange={(e) => setD({ ...d, posicion: Number(e.target.value) })} className="w-24" />
        </Campo>
      </div>
      <Campo etiqueta="Color">
        <div className="flex flex-wrap items-center gap-2">
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setD({ ...d, color: c })}
              className={cx("h-8 w-8 rounded-full border-2", d.color === c ? "border-texto" : "border-transparent")}
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
          <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-8 w-10 cursor-pointer rounded bg-transparent" aria-label="Otro color" />
          <InsigniaRol nombre={d.nombre || "Vista previa"} color={d.color} />
        </div>
      </Campo>
      <p className="text-sm font-medium">Permisos del rol</p>
      <EditorPermisos valor={permisos} alCambiar={setPermisos} />
      <ErrorCaja error={guardar.error} />
      <Boton type="submit" variante="primario" cargando={guardar.isPending}>
        Guardar rol
      </Boton>
    </form>
  );
}

function ListaRoles() {
  const roles = useRoles();
  const [editando, setEditando] = useState<Rol | null | "nuevo">(null);
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/roles/${id}`, { metodo: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cuentas"] }),
    onError: avisarError,
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-tenue">Como en Discord: crea roles con color y permisos y asígnalos a las cuentas. Si alguien tiene varios roles, se suman sus permisos.</p>
        <Boton variante="primario" icono={Plus} onClick={() => setEditando("nuevo")}>
          Nuevo rol
        </Boton>
      </div>
      {roles.isLoading ? <Cargando /> : null}
      {roles.data?.length === 0 ? <Vacio icono={Users} texto="Sin roles todavía." /> : null}
      {roles.data?.map((r) => (
        <Tarjeta
          key={r.id}
          titulo={<InsigniaRol nombre={r.nombre} color={r.color} />}
          acciones={
            <>
              <span className="text-xs text-tenue">{r.miembros} miembro(s)</span>
              <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar rol" onClick={() => setEditando(r)} />
              <Boton
                tamano="icono"
                variante="fantasma"
                icono={Trash2}
                aria-label="Borrar rol"
                onClick={async () => {
                  if (await confirmar({ titulo: `Borrar el rol ${r.nombre}`, mensaje: "Las cuentas que lo tienen pierden los permisos que les daba.", boton: "Borrar" })) borrar.mutate(r.id);
                }}
              />
            </>
          }
        >
          <p className="text-xs text-tenue">
            {Object.entries(r.permisos)
              .filter(([, n]) => n && n !== "ninguno")
              .map(([m, n]) => `${MODULES[m as ModuleId]?.label ?? m}: ${NIVEL[n as PermissionLevel]}`)
              .join(" · ") || "Sin permisos"}
          </p>
        </Tarjeta>
      ))}
      <Modal abierto={editando !== null} titulo={editando === "nuevo" ? "Nuevo rol" : "Editar rol"} alCerrar={() => setEditando(null)} ancho="max-w-2xl">
        {editando !== null ? <EditorRol inicial={editando === "nuevo" ? null : editando} alCerrar={() => setEditando(null)} /> : null}
      </Modal>
    </div>
  );
}

export default function Cuentas() {
  const [pestana, setPestana] = useState<"cuentas" | "roles">("cuentas");
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Cuentas y permisos"
        descripcion="Las cuentas no se borran: se desactivan. Bóveda, VPS, control remoto y demás apartados solo-maestra no se pueden otorgar."
      />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "cuentas", texto: "Cuentas" },
          { id: "roles", texto: "Roles" },
        ]}
      />
      {pestana === "cuentas" ? <ListaCuentas /> : <ListaRoles />}
    </div>
  );
}
