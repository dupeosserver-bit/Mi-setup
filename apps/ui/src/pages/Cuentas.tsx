import { usePaginado } from "../components/Paginas";
import { MODULES, MODULE_IDS, moduloEnEdicion, PERMISSION_LEVELS, type ModuleId, type PermissionLevel } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Crown, KeyRound, Lock, LogOut, Pencil, Plus, Search, Trash2, UserCog, Users } from "lucide-react";
import { useState } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { fmtFecha } from "../lib/formato";
import { useForma, useModoPagina } from "../lib/marco";
import { CATEGORIAS } from "../modulos";
import { Iniciales } from "../components/boveda/comun";

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
  const grupos = CATEGORIAS.map((c) => ({ ...c, modulos: OTORGABLES.filter((m) => MODULES[m].category === c.id) })).filter((g) => g.modulos.length);
  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <section key={g.id} className="space-y-2">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-tenue">
            <g.icono className="h-3.5 w-3.5" />
            {g.titulo}
          </h4>
          {g.modulos.map((m) => {
            const actual = valor[m] ?? "ninguno";
            return (
              <div key={m} className="flex flex-col gap-2 rounded-xl border border-borde bg-fondo px-3 py-2 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1 truncate text-sm">{MODULES[m].label}</span>
                <div className="grid grid-cols-4 gap-1 rounded-lg bg-tarjeta p-1 sm:w-[22rem]" role="radiogroup" aria-label={MODULES[m].label}>
                  {PERMISSION_LEVELS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={actual === n}
                      onClick={() => alCambiar({ ...valor, [m]: n })}
                      className={cx("h-7 truncate rounded-md px-1 text-xs font-medium", actual === n ? "text-texto" : "text-tenue hover:text-texto")}
                      style={actual === n ? { background: n === "ninguno" ? "var(--superficie)" : "color-mix(in srgb, var(--acento) 22%, var(--superficie))" } : undefined}
                    >
                      {NIVEL[n]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
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

function TarjetaPersona({ c, roles, elegida, alElegir }: { c: Cuenta; roles: Map<string, Rol>; elegida: boolean; alElegir: () => void }) {
  return (
    <button
      type="button"
      onClick={alElegir}
      className={cx("flex w-full items-center gap-3 rounded-xl border p-3 text-left", elegida ? "border-acento bg-tarjeta" : "border-borde bg-superficie hover:bg-tarjeta")}
    >
      <span className="relative">
        <Iniciales texto={c.nombre} tam={40} />
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-superficie" style={{ background: c.activo ? "var(--ok)" : "var(--error)" }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <b className="truncate text-sm">{c.nombre}</b>
          {c.rol === "maestra" ? <Crown className="h-3.5 w-3.5 shrink-0 text-aviso" /> : null}
        </span>
        <span className="block truncate text-xs text-tenue">{c.email}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {c.roles.slice(0, 3).map((id) => {
            const r = roles.get(id);
            return r ? <InsigniaRol key={id} nombre={r.nombre} color={r.color} /> : null;
          })}
        </span>
      </span>
    </button>
  );
}

function FichaCuenta({ c, roles, alVolver }: { c: Cuenta; roles: Map<string, Rol>; alVolver?: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {alVolver ? <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} aria-label="Volver" /> : null}
        <Iniciales texto={c.nombre} tam={48} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{c.nombre}</h2>
          <p className="truncate text-xs text-tenue">{c.email}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {c.rol === "maestra" ? <Insignia tono="ok">Maestra</Insignia> : null}
          {!c.activo ? <Insignia tono="peligro">Desactivada</Insignia> : null}
          {c.dosPasos ? <Insignia>2FA</Insignia> : null}
        </div>
      </div>
      <p className="text-xs text-tenue">
        Creada {fmtFecha(c.creada)} · {c.sesiones} sesión(es) activa(s)
        {c.rol === "maestra" ? " · acceso total" : ""}
        {c.roles.length ? ` · ${c.roles.map((id) => roles.get(id)?.nombre).filter(Boolean).join(", ")}` : ""}
      </p>
      <Detalle key={c.id} c={c} />
    </div>
  );
}

function FichaCompleta(props: { c: Cuenta; roles: Map<string, Rol>; alVolver: () => void }) {
  useModoPagina("completa");
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-fondo p-4">
      <div className="mx-auto w-full max-w-3xl">
        <FichaCuenta {...props} />
      </div>
    </div>
  );
}

function ListaCuentas() {
  const lista = useQuery({ queryKey: ["cuentas"], queryFn: () => api<Cuenta[]>("/api/cuentas") });
  const roles = useRoles();
  const forma = useForma();
  const [q, setQ] = useState("");
  const [elegida, setElegida] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const filtradas = (lista.data ?? []).filter((c) => !q || `${c.nombre} ${c.email}`.toLowerCase().includes(q.toLowerCase()));
  const pgCu = usePaginado(filtradas, 10);
  const rolPorId = new Map((roles.data ?? []).map((r) => [r.id, r]));
  const ancho = forma === "pc";
  const actual = lista.data?.find((c) => c.id === elegida) ?? (ancho ? lista.data?.[0] : undefined);

  if (!ancho && actual) return <FichaCompleta c={actual} roles={rolPorId} alVolver={() => setElegida(null)} />;

  return (
    <div className={cx("grid grid-cols-1 gap-4", ancho && "grid-cols-[minmax(0,360px)_minmax(0,1fr)]")}>
      <section className="min-w-0 space-y-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-tenue" />
            <Entrada className="pl-9" placeholder="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Boton variante="primario" icono={Plus} onClick={() => setNueva(true)}>
            Nueva
          </Boton>
        </div>
        {lista.isLoading ? <Cargando /> : null}
        <ErrorCaja error={lista.error} />
        {lista.data && !filtradas.length ? <Vacio icono={Users} texto="Sin resultados." /> : null}
        {pgCu.visibles.map((c) => (
          <TarjetaPersona key={c.id} c={c} roles={rolPorId} elegida={actual?.id === c.id} alElegir={() => setElegida(c.id)} />
        ))}
        {pgCu.paginas}
      </section>
      {ancho ? (
        <section className="min-w-0 self-start rounded-tarjeta border border-borde bg-superficie p-4">
          {actual ? <FichaCuenta c={actual} roles={rolPorId} /> : <Vacio icono={UserCog} texto="Elige una persona." />}
        </section>
      ) : null}
      <Modal abierto={nueva} titulo="Nueva cuenta" alCerrar={() => setNueva(false)} ancho="max-w-2xl">
        <Nueva alCerrar={() => setNueva(false)} />
      </Modal>
    </div>
  );
}

const CANDADOS: { titulo: string; texto: string }[] = [
  { titulo: "Panel (Pterodactyl y Negocio y cobros)", texto: "Solo tú y los roles que elijas." },
  { titulo: "Redes y streams", texto: "Solo tú y quien tenga el rol Invitado." },
  { titulo: "Host local", texto: "Solo tú. No se puede dar a nadie." },
  { titulo: "VPS, bóveda, registro y cuentas", texto: "Solo tú. No se pueden dar a nadie." },
];

function Candados() {
  return (
    <section className="rounded-tarjeta border border-borde bg-superficie p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4 text-tenue" />
        Candados
      </h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {CANDADOS.map((x) => (
          <div key={x.titulo} className="flex items-start gap-3 rounded-xl border border-borde bg-fondo p-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-aviso" style={{ background: "color-mix(in srgb, var(--aviso) 14%, transparent)" }}>
              <Lock className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <b className="block text-sm">{x.titulo}</b>
              <small className="text-xs text-tenue">{x.texto}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
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
      <Candados />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-tenue">Como en Discord: crea roles con color y permisos y asígnalos a las cuentas. Si alguien tiene varios roles, se suman sus permisos.</p>
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
        descripcion="Quién entra a tu Mi Setup y qué puede hacer. Los apartados con candado no se pueden dar a nadie."
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
