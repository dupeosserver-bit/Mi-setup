import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronRight, House, Lock, Plug, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, Unlock, Wrench, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { usePaginado } from "../components/Paginas";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { PildorasServidor, SUAVE } from "../components/vps/piezas";
import { EntradasRecientes } from "../components/CiberExtra";
import { EnergiaVps } from "../components/EnergiaVps";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { usePuede } from "../lib/consultas";
import { useServidores } from "../lib/vps";

type Estado = "ok" | "aviso" | "mal";
interface Punto {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  accion?: Accion;
}
type Accion = "firewall_activar" | "fail2ban_instalar" | "actualizaciones_auto" | "actualizar" | "swap_crear" | "earlyoom_instalar" | "journald_limitar" | "docker_logs" | "alertas_ssh" | "ssh_solo_llave";
interface Auditoria {
  sistema: string;
  calificacion: number;
  puntos: Punto[];
  firewall: { instalado: boolean; activo: boolean; reglas: string[] };
  puertos: { proto: string; puerto: number; direccion: string; publico: boolean }[];
  puertoSsh: number;
  tailscale: string | null;
}

const ICONO = { ok: CheckCircle2, aviso: AlertTriangle, mal: XCircle } as const;
const COLOR = { ok: "text-ok", aviso: "text-aviso", mal: "text-peligro" } as const;
const TEXTO_ACCION: Record<Accion, { boton: string; explica: string }> = {
  firewall_activar: { boton: "Encender firewall", explica: "Se instala ufw si falta, se permite el puerto de SSH y se enciende. Los demás puertos que no abras quedan cerrados." },
  fail2ban_instalar: { boton: "Instalar fail2ban", explica: "Se instala y enciende fail2ban: bloquea por un rato las IP que fallan muchas contraseñas." },
  actualizaciones_auto: { boton: "Activar", explica: "Se instala unattended-upgrades para que los parches de seguridad se instalen solos cada día." },
  actualizar: { boton: "Actualizar ahora", explica: "Se ejecuta apt update y apt upgrade (puede tardar varios minutos). Conserva tus archivos de configuración." },
  swap_crear: { boton: "Crear 2 GB de swap", explica: "Se crea /swapfile de 2 GB (si hay más de 6 GB libres) y se usa solo cuando la RAM se llena, para que el servidor no se caiga." },
  earlyoom_instalar: { boton: "Activar protección", explica: "Se instala earlyoom: si la memoria se acaba, cierra el programa que más gasta antes de que se congele todo (nunca SSH, Docker, la base ni Caddy)." },
  journald_limitar: { boton: "Limitar a 500 MB", explica: "Los registros del sistema se limitan a 500 MB y se borran los más viejos." },
  docker_logs: { boton: "Limitar logs de Docker", explica: "Cada contenedor guardará como máximo 3 archivos de 20 MB. Se aplica a contenedores nuevos o al reiniciar Docker (no se reinicia nada ahora)." },
  alertas_ssh: { boton: "Activar alertas", explica: "Se instala un aviso: cada vez que alguien entre por SSH te llega una notificación con el usuario y la IP. Las conexiones de Mi Setup no avisan." },
  ssh_solo_llave: { boton: "Solo con llave", explica: "Se apaga la entrada con contraseña (y root solo con llave). Antes se prueba la configuración; si falla, no se cambia nada." },
};


const TONO_ESTADO = { ok: SUAVE.ok, aviso: SUAVE.aviso, mal: SUAVE.peligro } as const;
const TEXTO_ESTADO = { ok: "Bien", aviso: "Se puede mejorar", mal: "Urgente" } as const;

function Calificacion({ valor }: { valor: number }) {
  const color = valor >= 80 ? "var(--ok)" : valor >= 50 ? "var(--aviso)" : "var(--error)";
  const r = 54;
  const largo = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--tarjeta)" strokeWidth="12" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, valor)) / 100) * largo} ${largo}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-4xl font-bold tabular-nums">{valor}</p>
          <p className="text-xs text-tenue">de 100</p>
        </div>
      </div>
    </div>
  );
}

function PuertosLista({
  puertos,
  puertoSsh,
  puede,
  ocupado,
  alCerrar,
}: {
  puertos: Auditoria["puertos"];
  puertoSsh: number;
  puede: boolean;
  ocupado: boolean;
  alCerrar: (puerto: number, proto: string) => void;
}) {
  const ordenados = [...puertos].sort((a, b) => Number(b.publico) - Number(a.publico) || a.puerto - b.puerto);
  const pg = usePaginado(ordenados, 6);
  return (
    <>
      <ul className="space-y-2">
        {pg.visibles.map((p) => (
          <li
            key={`${p.proto}-${p.puerto}-${p.direccion}`}
            className={cx("flex items-center gap-3 rounded-xl border p-2.5", p.publico ? "border-[color-mix(in_srgb,var(--aviso)_40%,transparent)]" : "border-borde")}
            title={p.direccion}
          >
            <div className="w-16 shrink-0">
              <p className={cx("font-mono text-sm font-bold", p.publico ? "text-aviso" : "text-tenue")}>{p.puerto}</p>
              <p className="font-mono text-[11px] text-tenue">{p.proto}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{p.publico ? "Abierto a internet" : "Solo dentro del servidor"}</p>
              <p className="truncate font-mono text-[11px] text-tenue">{p.direccion}</p>
            </div>
            {puede && p.publico && p.puerto !== puertoSsh ? (
              <Boton tamano="sm" disabled={ocupado} onClick={() => alCerrar(p.puerto, p.proto)}>
                Cerrar
              </Boton>
            ) : null}
          </li>
        ))}
      </ul>
      {pg.paginas}
    </>
  );
}

export default function VpsSeguridad() {
  const [servidor, setServidor] = useState<string | null>(null);
  const puede = usePuede("vps_seguridad", "administrar");
  const navegar = useNavigate();
  const servidores = useServidores();
  const nombre = servidores.data?.find((s) => s.id === servidor)?.nombre ?? "";
  const [puerto, setPuerto] = useState("");
  const [proto, setProto] = useState<"tcp" | "udp">("tcp");
  const [salida, setSalida] = useState<string | null>(null);
  const [verReglas, setVerReglas] = useState(false);

  const q = useQuery({
    queryKey: ["vps", "seguridad", servidor],
    queryFn: () => api<Auditoria>(`/api/vps/servidores/${servidor}/seguridad`),
    enabled: Boolean(servidor),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const accion = useMutation({
    mutationFn: (cuerpo: { accion: string; puerto?: number; proto?: string; confirmacion: string }) =>
      api<{ ok: boolean; salida: string; aviso: string | null }>(`/api/vps/servidores/${servidor}/seguridad/accion`, { cuerpo }),
    onSuccess: (r) => {
      setSalida(r.salida);
      if (r.aviso) avisar(r.aviso, "error");
      else avisar(r.ok ? "Listo" : "Terminó con errores (mira la salida)", r.ok ? "ok" : "error");
      void q.refetch();
    },
    onError: avisarError,
  });

  const ejecutar = async (titulo: string, explica: string, cuerpo: { accion: string; puerto?: number; proto?: string }) => {
    if (await confirmar({ titulo, mensaje: explica, detalle: `Servidor: ${nombre}`, peligroso: true, textoExacto: nombre, boton: "Hacerlo" })) {
      accion.mutate({ ...cuerpo, confirmacion: nombre });
    }
  };

  const preguntarIa = (a: Auditoria) => {
    const pendientes = a.puntos.filter((p) => p.estado !== "ok").map((p) => `- ${p.titulo}: ${p.detalle}`).join("\n");
    try {
      sessionStorage.setItem("mi-setup.pregunta", `Revisé la seguridad de mi servidor (${a.sistema}, calificación ${a.calificacion}). Esto falta:\n${pendientes || "- Nada"}\nExplícame qué hacer primero y, si se puede, propón los comandos para que yo los apruebe.`);
    } catch {
      avisar("No se pudo pasar la revisión a la IA; pregúntale tú directamente.", "info");
    }
    navegar("/ia?pregunta=@sesion");
  };

  const puertoNum = Number(puerto);
  const puertoValido = Number.isInteger(puertoNum) && puertoNum >= 1 && puertoNum <= 65535;
  const a = q.data;
  const cuenta = a ? { ok: a.puntos.filter((p) => p.estado === "ok").length, aviso: a.puntos.filter((p) => p.estado === "aviso").length, mal: a.puntos.filter((p) => p.estado === "mal").length } : null;

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Seguridad del servidor"
        descripcion="Revisa qué tan protegido está tu servidor y arréglalo con un botón."
        acciones={
          <>
            <PildorasServidor valor={servidor} alCambiar={setServidor} />
            <Boton icono={RefreshCw} disabled={!servidor || q.isFetching} onClick={() => void q.refetch()}>
              Revisar
            </Boton>
          </>
        }
      />
      {servidores.data && !servidores.data.length ? <Vacio icono={ShieldAlert} texto="Agrega tu servidor en Terminal para revisarlo." /> : null}
      <ErrorCaja error={q.error} />
      {q.isFetching && !a ? <Cargando texto="Revisando el servidor…" /> : null}
      {a && cuenta ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
          <section className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-4">
            <Calificacion valor={a.calificacion} />
            <div className="text-center">
              <p className={cx("text-lg font-bold", a.calificacion >= 80 ? "text-ok" : a.calificacion >= 50 ? "text-aviso" : "text-peligro")}>
                {a.calificacion >= 80 ? "Bien protegido" : a.calificacion >= 50 ? "Se puede mejorar" : "Necesita atención"}
              </p>
              <p className="text-xs text-tenue">
                {`${cuenta.ok} de ${a.puntos.length} protecciones activas · ${a.sistema} · SSH en el puerto ${a.puertoSsh}`}
              </p>
              {a.tailscale ? <p className="text-xs text-tenue">Tailscale activo: {a.tailscale}</p> : null}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["ok", cuenta.ok, "bien"],
                  ["aviso", cuenta.aviso, "mejorar"],
                  ["mal", cuenta.mal, "urgente"],
                ] as const
              ).map(([t, n, txt]) => (
                <div key={t} className="rounded-xl bg-fondo p-2">
                  <p className={cx("text-xl font-bold", t === "ok" ? "text-ok" : t === "aviso" ? "text-aviso" : "text-peligro")}>{n}</p>
                  <p className="text-xs text-tenue">{txt}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => preguntarIa(a)}
              className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--acento)_35%,transparent)] bg-[color-mix(in_srgb,var(--acento)_9%,var(--superficie))] p-3 text-left"
            >
              <Sparkles className="h-5 w-5 shrink-0 text-acento" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Pregúntale a la IA</span>
                <span className="block text-xs text-tenue">Le paso esta revisión y te explica qué conviene arreglar primero.</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-tenue" />
            </button>
          </section>
          <Tarjeta titulo="Revisión" icono={ShieldCheck}>
            <ul className="grid gap-x-6 xl:grid-cols-2">
              {a.puntos.map((p) => {
                const Icono = ICONO[p.estado];
                return (
                  <li key={p.id} className="flex items-start gap-3 border-b border-borde py-3">
                    <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", TONO_ESTADO[p.estado])}>
                      <Icono className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{p.titulo}</p>
                      <p className="break-words text-xs text-tenue">{p.detalle}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={cx("inline-flex items-center gap-1 text-xs", COLOR[p.estado])}>
                        <Icono className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{TEXTO_ESTADO[p.estado]}</span>
                      </span>
                      {p.accion && puede ? (
                        <Boton
                          tamano="sm"
                          variante={p.estado === "mal" ? "primario" : "secundario"}
                          icono={Wrench}
                          disabled={accion.isPending}
                          onClick={() => void ejecutar(p.titulo, TEXTO_ACCION[p.accion!].explica, { accion: p.accion! })}
                        >
                          {TEXTO_ACCION[p.accion].boton}
                        </Boton>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {a ? (
          <Tarjeta titulo="Puertos" icono={Plug} acciones={<span className="text-xs text-tenue">{`${a.puertos.length} en total · amarillo: abierto a internet`}</span>}>
            <PuertosLista
              puertos={a.puertos}
              puertoSsh={a.puertoSsh}
              puede={puede}
              ocupado={accion.isPending}
              alCerrar={(n, pr) => void ejecutar(`Cerrar puerto ${n}/${pr}`, "Lo que use ese puerto dejará de ser accesible desde internet.", { accion: "puerto_cerrar", puerto: n, proto: pr })}
            />
            <div className="mt-4 space-y-2 border-t border-borde pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Lock className="h-4 w-4 text-tenue" />
                <span className="text-sm font-semibold">Firewall</span>
                <Insignia tono={a.firewall.activo ? "ok" : "peligro"}>{a.firewall.activo ? "Encendido" : a.firewall.instalado ? "Apagado" : "No instalado"}</Insignia>
                {a.firewall.reglas.length ? (
                  <button type="button" onClick={() => setVerReglas((v) => !v)} className="ml-auto text-xs text-acento">
                    {verReglas ? "Ocultar reglas" : `Ver ${a.firewall.reglas.length} reglas`}
                  </button>
                ) : null}
              </div>
              {verReglas ? <pre className="max-h-48 overflow-auto rounded-xl bg-fondo p-2 text-xs">{a.firewall.reglas.join("\n")}</pre> : null}
              {puede ? (
                <>
                  <p className="text-xs text-tenue">Abre el puerto de tu juego (Minecraft 25565, por ejemplo) o cierra uno que no uses. El de SSH ({a.puertoSsh}) no se puede cerrar.</p>
                  <div className="flex flex-wrap gap-2">
                    <Entrada className="w-28" inputMode="numeric" value={puerto} onChange={(e) => setPuerto(e.target.value.replace(/\D/g, ""))} placeholder="Puerto" />
                    <Selector className="w-24" value={proto} onChange={(e) => setProto(e.target.value as "tcp" | "udp")}>
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </Selector>
                    <Boton
                      icono={Unlock}
                      disabled={!puertoValido || accion.isPending}
                      onClick={() => void ejecutar(`Abrir puerto ${puertoNum}/${proto}`, "Cualquiera en internet podrá conectarse a ese puerto.", { accion: "puerto_abrir", puerto: puertoNum, proto })}
                    >
                      Abrir
                    </Boton>
                    <Boton
                      icono={Lock}
                      disabled={!puertoValido || puertoNum === a.puertoSsh || accion.isPending}
                      onClick={() => void ejecutar(`Cerrar puerto ${puertoNum}/${proto}`, "Lo que use ese puerto dejará de ser accesible desde internet.", { accion: "puerto_cerrar", puerto: puertoNum, proto })}
                    >
                      Cerrar
                    </Boton>
                  </div>
                </>
              ) : null}
            </div>
          </Tarjeta>
        ) : null}
        <EntradasRecientes />
      </div>

      {accion.isPending ? <Cargando texto="Aplicando cambios en el servidor…" /> : null}
      {salida ? (
        <Tarjeta titulo="Salida del último cambio" acciones={<Boton tamano="sm" variante="fantasma" onClick={() => setSalida(null)}>Cerrar</Boton>}>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-fondo p-2 text-xs">{salida}</pre>
        </Tarjeta>
      ) : null}

      {servidor && puede ? <EnergiaVps servidor={servidor} nombre={nombre} /> : null}

      <section className="flex gap-3 rounded-tarjeta border border-dashed border-borde p-4">
        <House className="mt-0.5 h-5 w-5 shrink-0 text-acento" />
        <div className="text-sm">
          <p className="font-semibold">¿Servidor en tu casa?</p>
          <p className="text-tenue">
            Para entrar a tu home lab desde fuera sin abrir puertos en tu módem, instala Tailscale en el home lab y en el VPS (curl -fsSL https://tailscale.com/install.sh | sh y luego tailscale up). Después agrega el home lab en Terminal usando su IP 100.x de Tailscale. Así puedes pasar archivos entre los dos desde Archivos (botón de enviar).
          </p>
        </div>
      </section>
    </div>
  );
}
