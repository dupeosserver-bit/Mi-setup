/**
 * Seguridad del servidor: revisión con calificación, firewall (abrir y cerrar
 * puertos) y arreglos de un botón. Todo pide confirmar con tu contraseña o
 * huella y escribir el nombre del servidor.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Lock, Network, RefreshCw, ShieldAlert, ShieldCheck, Unlock, Wrench, XCircle } from "lucide-react";
import { useState } from "react";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { usePuede } from "../lib/consultas";
import { SelectorServidor, useServidores } from "../lib/vps";

type Estado = "ok" | "aviso" | "mal";
interface Punto {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  accion?: Accion;
}
type Accion = "firewall_activar" | "fail2ban_instalar" | "actualizaciones_auto" | "actualizar";
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
};

export default function VpsSeguridad() {
  const [servidor, setServidor] = useState<string | null>(null);
  const puede = usePuede("vps_seguridad", "administrar");
  const servidores = useServidores();
  const nombre = servidores.data?.find((s) => s.id === servidor)?.nombre ?? "";
  const [puerto, setPuerto] = useState("");
  const [proto, setProto] = useState<"tcp" | "udp">("tcp");
  const [salida, setSalida] = useState<string | null>(null);

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

  const puertoNum = Number(puerto);
  const puertoValido = Number.isInteger(puertoNum) && puertoNum >= 1 && puertoNum <= 65535;
  const a = q.data;

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Seguridad del servidor"
        descripcion="Revisa qué tan protegido está tu VPS o home lab y arréglalo con un botón."
        acciones={
          <>
            <SelectorServidor valor={servidor} alCambiar={setServidor} />
            <Boton icono={RefreshCw} disabled={!servidor || q.isFetching} onClick={() => void q.refetch()}>
              Revisar
            </Boton>
          </>
        }
      />
      {servidores.data && !servidores.data.length ? <Vacio icono={ShieldAlert} texto="Agrega tu servidor en VPS → Servidores para revisarlo." /> : null}
      <ErrorCaja error={q.error} />
      {q.isFetching && !a ? <Cargando texto="Revisando el servidor…" /> : null}
      {a ? (
        <>
          <Tarjeta>
            <div className="flex flex-wrap items-center gap-4">
              <div
                className={cx(
                  "grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 text-2xl font-bold",
                  a.calificacion >= 80 ? "border-ok text-ok" : a.calificacion >= 50 ? "border-aviso text-aviso" : "border-peligro text-peligro",
                )}
              >
                {a.calificacion}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.calificacion >= 80 ? "Bien protegido" : a.calificacion >= 50 ? "Se puede mejorar" : "Necesita atención"}</p>
                <p className="text-sm text-tenue">
                  {a.sistema} · SSH en el puerto {a.puertoSsh}
                </p>
                {a.tailscale ? <p className="text-xs text-tenue">Tailscale activo: {a.tailscale}</p> : null}
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Revisión" icono={ShieldCheck}>
            <ul className="divide-y divide-borde">
              {a.puntos.map((p) => {
                const Icono = ICONO[p.estado];
                return (
                  <li key={p.id} className="flex flex-wrap items-start gap-3 py-3">
                    <Icono className={cx("mt-0.5 h-5 w-5 shrink-0", COLOR[p.estado])} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.titulo}</p>
                      <p className="break-words text-xs text-tenue">{p.detalle}</p>
                    </div>
                    {p.accion && puede ? (
                      <Boton tamano="sm" icono={Wrench} disabled={accion.isPending} onClick={() => void ejecutar(p.titulo, TEXTO_ACCION[p.accion!].explica, { accion: p.accion! })}>
                        {TEXTO_ACCION[p.accion].boton}
                      </Boton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Tarjeta>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Tarjeta titulo="Firewall" icono={Lock}>
              <div className="space-y-3">
                <Insignia tono={a.firewall.activo ? "ok" : "peligro"}>{a.firewall.activo ? "Encendido" : a.firewall.instalado ? "Apagado" : "No instalado"}</Insignia>
                {a.firewall.reglas.length ? (
                  <pre className="max-h-48 overflow-auto rounded-xl bg-fondo p-2 text-xs">{a.firewall.reglas.join("\n")}</pre>
                ) : (
                  <p className="text-xs text-tenue">Sin reglas todavía.</p>
                )}
                {puede ? (
                  <div className="space-y-2">
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
                  </div>
                ) : null}
              </div>
            </Tarjeta>

            <Tarjeta titulo="Puertos escuchando" icono={Network}>
              <div className="flex flex-wrap gap-1.5">
                {a.puertos.map((p) => (
                  <span key={`${p.proto}-${p.puerto}`} className={cx("rounded-lg px-2 py-1 font-mono text-xs", p.publico ? "bg-aviso/15" : "bg-fondo text-tenue")} title={p.direccion}>
                    {p.puerto}/{p.proto}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-tenue">En amarillo: abiertos a todas las redes. En gris: solo dentro del servidor (más seguro).</p>
            </Tarjeta>
          </div>
        </>
      ) : null}

      {accion.isPending ? <Cargando texto="Aplicando cambios en el servidor…" /> : null}
      {salida ? (
        <Tarjeta titulo="Salida del último cambio" acciones={<Boton tamano="sm" variante="fantasma" onClick={() => setSalida(null)}>Cerrar</Boton>}>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-fondo p-2 text-xs">{salida}</pre>
        </Tarjeta>
      ) : null}

      <Tarjeta titulo="¿Home lab en tu casa?" icono={Network}>
        <p className="text-sm text-tenue">
          Para entrar a tu home lab desde fuera sin abrir puertos en tu módem, instala Tailscale en el home lab y en el VPS (curl -fsSL https://tailscale.com/install.sh | sh y luego tailscale up). Después agrega el home lab en
          Servidores usando su IP 100.x de Tailscale. Así puedes pasar archivos entre los dos desde el explorador de archivos (botón de enviar).
        </p>
      </Tarjeta>
    </div>
  );
}
