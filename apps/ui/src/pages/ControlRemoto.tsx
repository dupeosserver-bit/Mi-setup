import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Globe, MonitorUp, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePaginado } from "../components/Paginas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Punto, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { copiarSeguro } from "../lib/boveda/utilidades";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";

interface Equipo {
  id: string;
  nombre: string;
  rustdeskId: string;
  tieneContrasena: boolean;
  dispositivo: { id: string; nombre: string; conectado: boolean; visto: string | null } | null;
}
interface Datos {
  servidor: string;
  clavePublica: string | null;
  equipos: Equipo[];
}

const suave = (color: string) => ({ background: `color-mix(in srgb, ${color} 16%, transparent)`, color });

function Paso({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex min-w-0 gap-3 rounded-xl border border-borde bg-fondo p-3 text-sm">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold" style={suave("var(--acento)")}>
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function TarjetaEquipo({ e, puede, conectando, alConectar, alEditar, alBorrar }: { e: Equipo; puede: boolean; conectando: boolean; alConectar: () => void; alEditar: () => void; alBorrar: () => void }) {
  const encendido = Boolean(e.dispositivo?.conectado);
  return (
    <section className={cx("flex min-w-0 flex-col gap-3 rounded-tarjeta border bg-superficie p-4", encendido ? "border-[color-mix(in_srgb,var(--ok)_45%,transparent)]" : "border-borde")}>
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={suave(encendido ? "var(--ok)" : "var(--acento)")}>
          <MonitorUp className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">{e.nombre}</b>
          {e.dispositivo ? (
            <span className="flex items-center gap-1.5 text-xs text-tenue">
              <Punto conectado={e.dispositivo.conectado} />
              {e.dispositivo.conectado ? "Encendida (app abierta)" : `Sin señal · visto ${haceCuanto(e.dispositivo.visto)}`}
            </span>
          ) : (
            <span className="text-xs text-tenue">Sin dispositivo vinculado</span>
          )}
        </span>
        {puede ? (
          <span className="flex shrink-0">
            <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar" onClick={alEditar} />
            <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={alBorrar} />
          </span>
        ) : null}
      </header>
      <div className="rounded-xl border border-borde bg-fondo px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-tenue">ID de RustDesk</p>
        <p className="truncate font-mono text-xl tabular-nums">{e.rustdeskId.replace(/(\d{3})(?=\d)/g, "$1 ")}</p>
      </div>
      <Boton variante="primario" icono={MonitorUp} cargando={conectando} onClick={alConectar}>
        Conectar
      </Boton>
    </section>
  );
}

function Formulario({ equipo, alCerrar }: { equipo: Equipo | null; alCerrar: () => void }) {
  const puedeVerEquipos = usePuede("equipos", "lectura");
  const dispositivos = useQuery({
    queryKey: ["equipos"],
    queryFn: () => api<{ id: string; nombre: string; tipo: string }[]>("/api/equipos"),
    enabled: puedeVerEquipos,
  });
  const [d, setD] = useState({ nombre: equipo?.nombre ?? "", rustdeskId: equipo?.rustdeskId ?? "", contrasena: "", dispositivoId: equipo?.dispositivo?.id ?? "" });
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        nombre: d.nombre,
        rustdeskId: d.rustdeskId.replace(/\s/g, ""),
        dispositivoId: d.dispositivoId || null,
        ...(d.contrasena ? { contrasena: d.contrasena } : {}),
      };
      return equipo ? api(`/api/control-remoto/${equipo.id}`, { metodo: "PATCH", cuerpo }) : api("/api/control-remoto", { metodo: "POST", cuerpo });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["control-remoto"] });
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
      <Campo etiqueta="Nombre">
        <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="PC de la casa" required />
      </Campo>
      <Campo etiqueta="ID de RustDesk" ayuda="Lo ves en la ventana principal de RustDesk del equipo.">
        <Entrada value={d.rustdeskId} onChange={(e) => setD({ ...d, rustdeskId: e.target.value })} inputMode="numeric" required />
      </Campo>
      <Campo etiqueta={equipo?.tieneContrasena ? "Contraseña (déjala vacía para no cambiarla)" : "Contraseña permanente"} ayuda="Se guarda cifrada; solo se muestra al conectar.">
        <Entrada type="password" autoComplete="off" value={d.contrasena} onChange={(e) => setD({ ...d, contrasena: e.target.value })} />
      </Campo>
      {puedeVerEquipos ? (
        <Campo etiqueta="Dispositivo vinculado (para ver si está encendido)">
          <Selector value={d.dispositivoId} onChange={(e) => setD({ ...d, dispositivoId: e.target.value })}>
            <option value="">Ninguno</option>
            {dispositivos.data?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
      ) : null}
      <ErrorCaja error={guardar.error} />
      <Boton type="submit" variante="primario" cargando={guardar.isPending}>
        Guardar
      </Boton>
    </form>
  );
}

export default function ControlRemoto() {
  const puede = usePuede("control_remoto", "escritura");
  const datos = useQuery({ queryKey: ["control-remoto"], queryFn: () => api<Datos>("/api/control-remoto"), refetchInterval: 15_000 });
  const [editar, setEditar] = useState<Equipo | null | undefined>(undefined);
  const [ayuda, setAyuda] = useState(false);

  const conectar = useMutation({
    mutationFn: (id: string) => api<{ rustdeskId: string; contrasena: string | null }>(`/api/control-remoto/${id}/conectar`, { metodo: "POST" }),
    onSuccess: async (r) => {
      if (r.contrasena) await copiarSeguro(r.contrasena, "Contraseña copiada");
      abrirExterno(`rustdesk://connection/new/${encodeURIComponent(r.rustdeskId)}`);
      setAyuda(true);
    },
    onError: avisarError,
  });
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/control-remoto/${id}`, { metodo: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["control-remoto"] }),
    onError: avisarError,
  });
  const lista = usePaginado(datos.data?.equipos, 6);

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Control remoto"
        descripcion={`RustDesk con tu propio servidor (${datos.data?.servidor ?? "rd.mexicanland.net"}). Conectar pide tu huella o contraseña.`}
        acciones={
          puede ? (
            <Boton variante="primario" icono={Plus} onClick={() => setEditar(null)}>
              Agregar equipo
            </Boton>
          ) : null
        }
      />
      <Tarjeta titulo="La forma más fácil: Escritorio remoto de Chrome (oficial de Google, gratis)" icono={Globe}>
        <ol className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <Paso n={1}>En tu PC abre «Preparar esta PC», entra con tu cuenta de Google, instala lo que pide y elige un PIN de 6 números.</Paso>
          <Paso n={2}>En el celular instala «Escritorio remoto de Chrome» y entra con la misma cuenta de Google.</Paso>
          <Paso n={3}>Toca tu PC en la lista y escribe el PIN: ya la controlas desde el celular (también funciona desde otra PC en el navegador).</Paso>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <Boton variante="primario" onClick={() => abrirExterno("https://remotedesktop.google.com/access")}>
            Preparar esta PC
          </Boton>
          <Boton onClick={() => abrirExterno("https://play.google.com/store/apps/details?id=com.google.chromeremotedesktop")}>
            App para Android
          </Boton>
          <Boton variante="fantasma" onClick={() => abrirExterno("https://remotedesktop.google.com/access")}>
            Conectarme ahora
          </Boton>
        </div>
        <p className="mt-2 text-xs text-tenue">Funciona aunque estés fuera de casa y sin abrir puertos. RustDesk (abajo) es la opción con tu propio servidor.</p>
      </Tarjeta>
      {datos.isLoading ? <Cargando /> : null}
      <ErrorCaja error={datos.error} />
      {datos.data?.equipos.length === 0 ? <Vacio icono={MonitorUp} texto="Agrega tu PC con su ID de RustDesk." /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {lista.visibles.map((e) => (
          <TarjetaEquipo
            key={e.id}
            e={e}
            puede={puede}
            conectando={conectar.isPending && conectar.variables === e.id}
            alConectar={() => conectar.mutate(e.id)}
            alEditar={() => setEditar(e)}
            alBorrar={async () => {
              if (await confirmar({ titulo: "Quitar equipo", mensaje: e.nombre })) borrar.mutate(e.id);
            }}
          />
        ))}
      </div>
      {lista.paginas}

      <Tarjeta titulo="Configurar el cliente RustDesk (una vez por dispositivo)" icono={Server}>
        <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Paso n={1}>Instala RustDesk desde rustdesk.com (Windows) o la tienda de apps (Android).</Paso>
          <Paso n={2}>Ajustes → Red → Servidor de ID/Relay: servidor de ID y de relay = {datos.data?.servidor ?? "rd.mexicanland.net"}.</Paso>
          <Paso n={3}>
            Clave:{" "}
            {datos.data?.clavePublica ? (
              <button type="button" className="inline-flex items-center gap-1 font-mono text-texto underline" onClick={() => void copiarSeguro(datos.data!.clavePublica!, "Clave copiada")}>
                {datos.data.clavePublica.slice(0, 16)}… <Copy className="h-3 w-3" />
              </button>
            ) : (
              <span className="text-tenue">la del archivo id_ed25519.pub del servidor (pon RD_PUBLIC_KEY en el .env para verla aquí).</span>
            )}
          </Paso>
          <Paso n={4}>En la PC: pon una contraseña permanente en RustDesk y guárdala aquí junto con el ID.</Paso>
        </ol>
      </Tarjeta>

      <Modal abierto={editar !== undefined} titulo={editar ? "Editar equipo" : "Agregar equipo"} alCerrar={() => setEditar(undefined)}>
        {editar !== undefined ? <Formulario equipo={editar} alCerrar={() => setEditar(undefined)} /> : null}
      </Modal>
      <Modal abierto={ayuda} titulo="Abriendo RustDesk" alCerrar={() => setAyuda(false)}>
        <p className="text-sm text-tenue">
          Si RustDesk no se abrió, instálalo y configúralo con los pasos de abajo. La contraseña quedó copiada: pégala cuando el cliente la pida.
        </p>
        <Boton
          className="mt-3"
          onClick={() => {
            setAyuda(false);
            avisar("Listo", "info");
          }}
        >
          Entendido
        </Boton>
      </Modal>
    </div>
  );
}
