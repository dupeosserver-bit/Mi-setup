/** Control remoto: equipos con RustDesk autoalojado; "Conectar" pide huella/contraseña, copia la contraseña y abre el cliente. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, MonitorUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Punto, Selector, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
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
      abrirExterno(`rustdesk://${encodeURIComponent(r.rustdeskId)}`);
      setAyuda(true);
    },
    onError: avisarError,
  });
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/control-remoto/${id}`, { metodo: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["control-remoto"] }),
    onError: avisarError,
  });

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
      {datos.isLoading ? <Cargando /> : null}
      <ErrorCaja error={datos.error} />
      {datos.data?.equipos.length === 0 ? <Vacio icono={MonitorUp} texto="Agrega tu PC con su ID de RustDesk." /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {datos.data?.equipos.map((e) => (
          <Tarjeta
            key={e.id}
            titulo={e.nombre}
            icono={MonitorUp}
            acciones={
              puede ? (
                <>
                  <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar" onClick={() => setEditar(e)} />
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Borrar"
                    onClick={async () => {
                      if (await confirmar({ titulo: "Quitar equipo", mensaje: e.nombre })) borrar.mutate(e.id);
                    }}
                  />
                </>
              ) : null
            }
          >
            <p className="font-mono text-lg">{e.rustdeskId.replace(/(\d{3})(?=\d)/g, "$1 ")}</p>
            {e.dispositivo ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-tenue">
                <Punto conectado={e.dispositivo.conectado} />
                {e.dispositivo.conectado ? "Encendida (app abierta)" : `Sin señal · visto ${haceCuanto(e.dispositivo.visto)}`}
              </div>
            ) : null}
            <Boton className="mt-3" variante="primario" icono={MonitorUp} cargando={conectar.isPending && conectar.variables === e.id} onClick={() => conectar.mutate(e.id)}>
              Conectar
            </Boton>
          </Tarjeta>
        ))}
      </div>

      <Tarjeta titulo="Configurar el cliente RustDesk (una vez por dispositivo)">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-tenue">
          <li>Instala RustDesk desde rustdesk.com (Windows) o la tienda de apps (Android).</li>
          <li>Ajustes → Red → Servidor de ID/Relay: servidor de ID y de relay = {datos.data?.servidor ?? "rd.mexicanland.net"}.</li>
          <li>
            Clave:{" "}
            {datos.data?.clavePublica ? (
              <button type="button" className="inline-flex items-center gap-1 font-mono text-texto underline" onClick={() => void copiarSeguro(datos.data!.clavePublica!, "Clave copiada")}>
                {datos.data.clavePublica.slice(0, 16)}… <Copy className="h-3 w-3" />
              </button>
            ) : (
              <span>la del archivo id_ed25519.pub del servidor (pon RD_PUBLIC_KEY en el .env para verla aquí).</span>
            )}
          </li>
          <li>En la PC: pon una contraseña permanente en RustDesk y guárdala aquí junto con el ID.</li>
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
