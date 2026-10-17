/** Cuentas y permisos: alta de cuentas, permisos por módulo, desactivar y restablecer contraseña (solo maestra). */
import { MODULES, MODULE_IDS, PERMISSION_LEVELS, type ModuleId, type PermissionLevel } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, LogOut, Plus, ShieldCheck, UserCog } from "lucide-react";
import { useState } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Selector, Tarjeta, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { fmtFecha } from "../lib/formato";

interface Cuenta {
  id: string;
  email: string;
  nombre: string;
  rol: "maestra" | "usuario";
  activo: boolean;
  dosPasos: boolean;
  sesiones: number;
  creada: string;
  permisos: Partial<Record<ModuleId, PermissionLevel>>;
}

const OTORGABLES = MODULE_IDS.filter((m) => !MODULES[m].masterOnly);
const NIVEL: Record<PermissionLevel, string> = { ninguno: "Sin acceso", lectura: "Ver", escritura: "Editar", administrar: "Administrar" };

function EditorPermisos({ valor, alCambiar }: { valor: Cuenta["permisos"]; alCambiar: (p: Cuenta["permisos"]) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
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

function Nueva({ alCerrar }: { alCerrar: () => void }) {
  const [d, setD] = useState({ email: "", nombre: "", password: "" });
  const [permisos, setPermisos] = useState<Cuenta["permisos"]>({});
  const crear = useMutation({
    mutationFn: () => api("/api/cuentas", { metodo: "POST", cuerpo: { ...d, permisos } }),
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
      <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 12 caracteres. Compártela por un medio seguro.">
        <Entrada type="password" autoComplete="new-password" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} required />
      </Campo>
      <p className="text-sm font-medium">Permisos</p>
      <EditorPermisos valor={permisos} alCambiar={setPermisos} />
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" cargando={crear.isPending}>
        Crear cuenta
      </Boton>
    </form>
  );
}

function Detalle({ c }: { c: Cuenta }) {
  const [permisos, setPermisos] = useState(c.permisos);
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
  const cambiado = JSON.stringify(permisos) !== JSON.stringify(c.permisos);

  return (
    <div className="space-y-4">
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
      </div>
      <EditorPermisos valor={permisos} alCambiar={setPermisos} />
      <Boton variante="primario" disabled={!cambiado} cargando={cambiar.isPending} onClick={() => cambiar.mutate({ permisos })}>
        Guardar permisos
      </Boton>
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

export default function Cuentas() {
  const lista = useQuery({ queryKey: ["cuentas"], queryFn: () => api<Cuenta[]>("/api/cuentas") });
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Cuentas y permisos"
        descripcion="Las cuentas no se borran: se desactivan. Bóveda, VPS, control remoto y demás apartados solo-maestra no se pueden otorgar."
        acciones={
          <Boton variante="primario" icono={Plus} onClick={() => setNueva(true)}>
            Nueva cuenta
          </Boton>
        }
      />
      {lista.isLoading ? <Cargando /> : null}
      <ErrorCaja error={lista.error} />
      <div className="space-y-3">
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
                {c.rol !== "maestra" ? (
                  <Boton tamano="sm" variante="fantasma" onClick={() => setAbierta(abierta === c.id ? null : c.id)}>
                    {abierta === c.id ? "Cerrar" : "Editar"}
                  </Boton>
                ) : null}
              </>
            }
          >
            <p className="text-xs text-tenue">
              Creada {fmtFecha(c.creada)} · {c.sesiones} sesión(es) activa(s) ·{" "}
              {c.rol === "maestra" ? "acceso total" : `${Object.keys(c.permisos).length} módulo(s) con acceso`}
            </p>
            {abierta === c.id ? (
              <div className="mt-4">
                <Detalle c={c} />
              </div>
            ) : null}
          </Tarjeta>
        ))}
      </div>
      <Modal abierto={nueva} titulo="Nueva cuenta" alCerrar={() => setNueva(false)} ancho="max-w-2xl">
        <Nueva alCerrar={() => setNueva(false)} />
      </Modal>
    </div>
  );
}
