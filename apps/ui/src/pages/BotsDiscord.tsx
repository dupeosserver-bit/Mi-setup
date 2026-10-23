import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, CalendarClock, Copy, KeyRound, Link2, Plus, Trash2, Unlink } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PanelBot, type ApiBot, type BotDetalle } from "../components/PanelBot";
import { EtiquetaInvitados } from "../components/CuentaRed";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { copiarSeguro } from "../lib/boveda/utilidades";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";
import { localeActual } from "../lib/idioma";

interface BotResumen {
  id: string;
  nombre: string;
  botNombre: string | null;
  cliente: string;
  estado: "apagado" | "conectando" | "encendido" | "error";
  vence: string | null;
  vencido: boolean;
  compartido: boolean;
  error: string | null;
}
type BotPropio = BotDetalle & { cliente: string; compartido: boolean };

const aFechaCorta = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["bots"] });

function Nuevo({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (id: string) => void }) {
  const [d, setD] = useState({ nombre: "", token: "", cliente: "", vence: "" });
  const crear = useMutation({
    mutationFn: () => api<BotDetalle>("/api/bots", { cuerpo: { nombre: d.nombre, token: d.token, cliente: d.cliente, vence: d.vence ? new Date(`${d.vence}T23:59:59`).toISOString() : null } }),
    onSuccess: (b) => {
      refrescar();
      alCrear(b.id);
    },
    onError: avisarError,
  });
  return (
    <Modal abierto titulo="Nuevo bot de Discord" alCerrar={alCerrar}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <ol className="list-decimal space-y-1 rounded-xl bg-fondo p-3 pl-6 text-xs text-tenue">
          <li>
            En{" "}
            <button type="button" className="underline" onClick={() => abrirExterno("https://discord.com/developers/applications")}>
              discord.com/developers
            </button>{" "}
            crea una aplicación nueva.
          </li>
          <li>Ve a «Bot» y activa los tres «Privileged Gateway Intents» (Presence no hace falta, pero sí Server Members y Message Content).</li>
          <li>Toca «Reset Token», cópialo y pégalo aquí. Se guarda cifrado y no se vuelve a mostrar.</li>
          <li>Al crearlo te damos el enlace para invitar el bot a tu servidor.</li>
        </ol>
        <Campo etiqueta="Nombre para reconocerlo">
          <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Bot del clan" maxLength={60} required />
        </Campo>
        <Campo etiqueta="Token del bot">
          <Entrada type="password" autoComplete="off" value={d.token} onChange={(e) => setD({ ...d, token: e.target.value })} placeholder="Pega aquí el token" required />
        </Campo>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Cliente (opcional)" ayuda="Si lo vendes: para qué cliente es.">
            <Entrada value={d.cliente} onChange={(e) => setD({ ...d, cliente: e.target.value })} maxLength={80} />
          </Campo>
          <Campo etiqueta="Vence (opcional)" ayuda="Al llegar la fecha el bot se apaga solo.">
            <Entrada type="date" value={d.vence} onChange={(e) => setD({ ...d, vence: e.target.value })} />
          </Campo>
        </div>
        <Boton type="submit" variante="primario" cargando={crear.isPending} disabled={d.token.trim().length < 40 || !d.nombre.trim()}>
          Crear bot
        </Boton>
      </form>
    </Modal>
  );
}

function Detalle({ id, alVolver }: { id: string; alVolver: () => void }) {
  const q = useQuery({ queryKey: ["bots", id], queryFn: () => api<BotPropio>(`/api/bots/${id}`), refetchInterval: 10_000 });
  const [cliente, setCliente] = useState<string | null>(null);
  const [vence, setVence] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const b = q.data;

  const guardarDatos = useMutation({
    mutationFn: () =>
      api(`/api/bots/${id}`, {
        metodo: "PATCH",
        cuerpo: { cliente: cliente ?? b?.cliente ?? "", vence: (vence ?? aFechaCorta(b?.vence ?? null)) ? new Date(`${vence ?? aFechaCorta(b?.vence ?? null)}T23:59:59`).toISOString() : null },
      }),
    onSuccess: () => {
      avisar("Datos guardados");
      setCliente(null);
      setVence(null);
      refrescar();
    },
    onError: avisarError,
  });
  const crearEnlace = useMutation({
    mutationFn: () => api<{ ruta: string }>(`/api/bots/${id}/compartir`, { metodo: "POST" }),
    onSuccess: (r) => {
      setEnlace(`${API_BASE || window.location.origin}${r.ruta}`);
      refrescar();
    },
    onError: avisarError,
  });
  const quitarEnlace = useMutation({
    mutationFn: () => api(`/api/bots/${id}/compartir`, { metodo: "DELETE" }),
    onSuccess: () => {
      setEnlace(null);
      refrescar();
    },
    onError: avisarError,
  });
  const cambiarToken = useMutation({
    mutationFn: () => api(`/api/bots/${id}/token`, { metodo: "PUT", cuerpo: { token } }),
    onSuccess: () => {
      avisar("Token cambiado. Enciende el bot de nuevo.");
      setToken(null);
      refrescar();
    },
    onError: avisarError,
  });

  if (q.isLoading) return <Cargando />;
  if (!b) return <ErrorCaja error={q.error} />;
  const apis: ApiBot = {
    guardar: (config) => api(`/api/bots/${id}/config`, { metodo: "PUT", cuerpo: config }),
    accion: (a) => api<BotDetalle>(`/api/bots/${id}/${a}`, { metodo: "POST" }),
    recargar: refrescar,
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Volver" onClick={alVolver} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{b.nombre}</h2>
        <EtiquetaInvitados />
      </div>
      <PanelBot bot={b} api={apis} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Cliente y vencimiento" icono={CalendarClock}>
          <div className="space-y-3">
            <Campo etiqueta="Cliente">
              <Entrada value={cliente ?? b.cliente} onChange={(e) => setCliente(e.target.value)} maxLength={80} />
            </Campo>
            <Campo etiqueta="El servicio vence" ayuda="Ese día el bot se apaga solo y el cliente ya no puede encenderlo. Déjalo vacío para que no venza.">
              <Entrada type="date" value={vence ?? aFechaCorta(b.vence)} onChange={(e) => setVence(e.target.value)} />
            </Campo>
            <Boton variante="primario" cargando={guardarDatos.isPending} disabled={cliente === null && vence === null} onClick={() => guardarDatos.mutate()}>
              Guardar
            </Boton>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Enlace para el dueño del bot" icono={Link2} acciones={<Insignia tono={b.compartido ? "ok" : "neutro"}>{b.compartido ? "Activo" : "Sin enlace"}</Insignia>}>
          <p className="text-xs text-tenue">Con este enlace tu cliente configura, enciende, apaga y reinicia SOLO este bot. No ve tu cuenta, tus otros bots ni el token.</p>
          {enlace ? (
            <div className="mt-3 space-y-2">
              <p className="break-all rounded-xl bg-fondo p-2 font-mono text-xs">{enlace}</p>
              <p className="text-xs text-amber-400">Cópialo ahora: por seguridad no se vuelve a mostrar (si lo pierdes, crea uno nuevo).</p>
              <Boton icono={Copy} onClick={() => void copiarSeguro(enlace, "Enlace copiado")}>
                Copiar enlace
              </Boton>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Boton
              icono={Link2}
              cargando={crearEnlace.isPending}
              onClick={async () => {
                if (!b.compartido || (await confirmar({ titulo: "Crear un enlace nuevo", mensaje: "El enlace anterior deja de funcionar.", boton: "Crear nuevo" }))) crearEnlace.mutate();
              }}
            >
              {b.compartido ? "Crear enlace nuevo" : "Crear enlace"}
            </Boton>
            {b.compartido ? (
              <Boton variante="fantasma" icono={Unlink} cargando={quitarEnlace.isPending} onClick={() => quitarEnlace.mutate()}>
                Quitar enlace
              </Boton>
            ) : null}
          </div>
        </Tarjeta>
        <Tarjeta titulo="Token y borrar" icono={KeyRound}>
          <div className="space-y-3">
            <Campo etiqueta="Cambiar el token" ayuda="Si lo regeneraste en Discord. El bot se apaga y lo enciendes de nuevo.">
              <Entrada type="password" autoComplete="off" value={token ?? ""} onChange={(e) => setToken(e.target.value)} placeholder="Nuevo token" />
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Boton cargando={cambiarToken.isPending} disabled={!token || token.trim().length < 40} onClick={() => cambiarToken.mutate()}>
                Cambiar token
              </Boton>
              <Boton
                variante="fantasma"
                icono={Trash2}
                className="text-peligro"
                onClick={async () => {
                  if (
                    !(await confirmar({
                      titulo: "Borrar bot",
                      mensaje: `${b.nombre} se apaga y se borra con su configuración, niveles y monedas.`,
                      peligroso: true,
                      textoExacto: b.nombre,
                      boton: "Borrar",
                    }))
                  )
                    return;
                  await api(`/api/bots/${id}`, { metodo: "DELETE" }).catch(avisarError);
                  refrescar();
                  alVolver();
                }}
              >
                Borrar bot
              </Boton>
            </div>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}

export default function BotsDiscord() {
  const [params, setParams] = useSearchParams();
  const elegido = params.get("bot");
  const [nuevo, setNuevo] = useState(false);
  const puede = usePuede("bots_discord", "escritura");
  const q = useQuery({ queryKey: ["bots"], queryFn: () => api<BotResumen[]>("/api/bots"), refetchInterval: 15_000 });
  const pgBd = usePaginado(q.data, 12);
  if (elegido) return <Detalle id={elegido} alVolver={() => setParams({})} />;
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Bots de Discord"
        descripcion="Crea bots con módulos (bienvenida, moderación, niveles, economía, tickets…) y Mi Setup los mantiene encendidos. Puedes venderlos con un enlace para el cliente."
        acciones={
          <>
            <EtiquetaInvitados />
            {puede ? (
              <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>
                Nuevo bot
              </Boton>
            ) : null}
          </>
        }
      />
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data?.length === 0 ? <Vacio icono={Bot} texto="Crea tu primer bot: pegas el token de tu aplicación de Discord y listo." /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pgBd.visibles.map((b) => (
          <button key={b.id} type="button" onClick={() => setParams({ bot: b.id })} className="rounded-tarjeta border border-borde bg-superficie p-4 text-left transition-colors hover:bg-tarjeta">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5865f2] text-white">
                <Bot className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{b.nombre}</span>
              <Insignia tono={b.estado === "encendido" ? "ok" : b.estado === "error" ? "peligro" : "neutro"}>
                {b.estado === "encendido" ? "Encendido" : b.estado === "error" ? "Error" : "Apagado"}
              </Insignia>
            </div>
            <p className="mt-1 truncate text-xs text-tenue">
              {b.botNombre ?? "Sin conectar"}
              {b.cliente ? ` · ${b.cliente}` : ""}
            </p>
            <p className={`mt-2 text-[11px] ${b.vencido ? "text-peligro" : "text-tenue"}`}>
              {b.vence ? (b.vencido ? "Servicio vencido" : `Vence ${new Date(b.vence).toLocaleDateString(localeActual(), { day: "numeric", month: "short", year: "numeric" })}`) : "Sin vencimiento"}
            </p>
            {b.compartido ? <p className="text-[11px] text-tenue">Con enlace para el cliente</p> : null}
            {b.error ? <p className="mt-1 truncate text-[11px] text-peligro">{b.error}</p> : null}
          </button>
        ))}
      </div>
      {pgBd.paginas}
      {nuevo ? (
        <Nuevo
          alCerrar={() => setNuevo(false)}
          alCrear={(id) => {
            setNuevo(false);
            setParams({ bot: id });
          }}
        />
      ) : null}
    </div>
  );
}
