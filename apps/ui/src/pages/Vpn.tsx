/**
 * VPN WireGuard (una ubicación). La llave privada se genera en este
 * dispositivo y solo se muestra aquí (QR o archivo .conf): el servidor solo
 * recibe la pública.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import sodium from "libsodium-wrappers-sumo";
import { Download, Plus, Power, Shield, ShieldAlert, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, FaltaConfigurar, Insignia, Modal, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes, haceCuanto } from "../lib/formato";
import { abrirExterno, escritorio, esMovil } from "../lib/plataforma";

interface Dispositivo {
  id: string;
  nombre: string;
  direccion: string;
  conectado: boolean;
  ultimoSaludo: string | null;
  rx: number;
  tx: number;
}

interface Alta {
  direccion: string;
  llaveServidor: string;
  endpoint: string;
  dns: string;
  ipsPermitidas: string;
}

/** Par de llaves Curve25519 de WireGuard (privada "clampeada" + pública). */
async function generarLlaves(): Promise<{ privada: string; publica: string; psk: string }> {
  await sodium.ready;
  const privada = sodium.randombytes_buf(32);
  privada[0] = (privada[0] ?? 0) & 248;
  privada[31] = ((privada[31] ?? 0) & 127) | 64;
  const publica = sodium.crypto_scalarmult_base(privada);
  const b64 = (x: Uint8Array) => sodium.to_base64(x, sodium.base64_variants.ORIGINAL);
  const r = { privada: b64(privada), publica: b64(publica), psk: b64(sodium.randombytes_buf(32)) };
  sodium.memzero(privada);
  return r;
}

function construirConfig(privada: string, psk: string, a: Alta): string {
  return [
    "[Interface]",
    `PrivateKey = ${privada}`,
    `Address = ${a.direccion}`,
    `DNS = ${a.dns}`,
    "",
    "[Peer]",
    `PublicKey = ${a.llaveServidor}`,
    `PresharedKey = ${psk}`,
    `Endpoint = ${a.endpoint}`,
    `AllowedIPs = ${a.ipsPermitidas}`,
    "PersistentKeepalive = 25",
    "",
  ].join("\n");
}

function abrirWireGuard() {
  if (esMovil()) {
    // Abre la app oficial si está instalada; si no, su página en la tienda.
    window.location.href = "intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.wireguard.android;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.wireguard.android;end";
  } else if (escritorio()) {
    avisar("Abre WireGuard desde el menú Inicio y pulsa Activar en el túnel de Mi Setup.", "info");
  } else {
    abrirExterno("https://www.wireguard.com/install/");
  }
}

function NuevoDispositivo({ alTerminar }: { alTerminar: (config: { nombre: string; texto: string; qr: string }) => void }) {
  const [nombre, setNombre] = useState("");
  const crear = useMutation({
    mutationFn: async () => {
      const llaves = await generarLlaves();
      const a = await api<Alta>("/api/vpn/dispositivos", { cuerpo: { nombre, llavePublica: llaves.publica, psk: llaves.psk } });
      const texto = construirConfig(llaves.privada, llaves.psk, a);
      return { nombre, texto, qr: await QRCode.toDataURL(texto, { margin: 1, width: 320, color: { dark: "#000000", light: "#ffffff" } }) };
    },
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ["vpn"] });
      alTerminar(r);
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => (e.preventDefault(), crear.mutate())}>
      <Campo etiqueta="Nombre del dispositivo" ayuda="Minúsculas, números y guiones. Ej.: celular, pc-casa">
        <Entrada value={nombre} onChange={(e) => setNombre(e.target.value.toLowerCase())} required maxLength={32} pattern="[a-z0-9-]+" autoFocus />
      </Campo>
      <p className="text-xs text-tenue">Las llaves se generan en este dispositivo. El servidor solo recibe la pública.</p>
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" icono={Plus} cargando={crear.isPending}>Crear acceso VPN</Boton>
    </form>
  );
}

export default function Vpn() {
  const puede = usePuede("vpn", "escritura");
  const [nuevo, setNuevo] = useState(false);
  const [config, setConfig] = useState<{ nombre: string; texto: string; qr: string } | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["vpn"], queryFn: () => api<{ servicio: boolean; dispositivos: Dispositivo[] }>("/api/vpn/dispositivos"), refetchInterval: 20_000 });

  const descargar = () => {
    if (!config) return;
    const url = URL.createObjectURL(new Blob([config.texto], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mi-setup-${config.nombre}.conf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <>
      <Encabezado
        titulo="VPN"
        descripcion="WireGuard en tu VPS. Conecta y desconecta desde la app oficial de WireGuard."
        acciones={
          <>
            <Boton icono={Power} onClick={abrirWireGuard}>Abrir WireGuard</Boton>
            {puede ? <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)} disabled={data?.servicio === false}>Dispositivo</Boton> : null}
          </>
        }
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      {data?.servicio === false ? (
        <div className="mb-4">
          <FaltaConfigurar variable="VPN_SOCKET" detalle="Instala el servicio VPN del host con deploy/host-install.sh (lo ejecuta el script del VPS)." />
        </div>
      ) : null}
      {data?.dispositivos.length === 0 ? <Vacio icono={Shield} texto="Agrega tu celular o tu PC para usar la VPN." /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.dispositivos.map((d) => (
          <Tarjeta
            key={d.id}
            titulo={d.nombre}
            icono={d.conectado ? Shield : ShieldAlert}
            acciones={
              <>
                <Insignia tono={d.conectado ? "ok" : "neutro"}>{d.conectado ? "Conectado" : "Desconectado"}</Insignia>
                {puede ? (
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Quitar"
                    onClick={async () => {
                      if (!(await confirmar({ titulo: "Quitar dispositivo VPN", mensaje: `${d.nombre} dejará de poder conectarse.`, boton: "Quitar" }))) return;
                      await api(`/api/vpn/dispositivos/${d.id}`, { metodo: "DELETE" }).catch(avisarError);
                      await queryClient.invalidateQueries({ queryKey: ["vpn"] });
                    }}
                  />
                ) : null}
              </>
            }
          >
            <p className="text-sm text-tenue">
              {d.direccion} · último saludo {haceCuanto(d.ultimoSaludo)} · ↓ {fmtBytes(d.rx)} ↑ {fmtBytes(d.tx)}
            </p>
          </Tarjeta>
        ))}
      </div>
      <Modal abierto={nuevo} titulo="Nuevo dispositivo VPN" alCerrar={() => setNuevo(false)}>
        <NuevoDispositivo
          alTerminar={(c) => {
            setNuevo(false);
            setConfig(c);
          }}
        />
      </Modal>
      <Modal abierto={config !== null} titulo={`Configuración de ${config?.nombre ?? ""}`} alCerrar={() => setConfig(null)}>
        {config ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-aviso">Esta es la única vez que se muestra: contiene la llave privada. Escanéala o descárgala ahora.</p>
            <img src={config.qr} alt="Código QR de la configuración de WireGuard" className="mx-auto rounded-xl" />
            <p className="text-xs text-tenue">En la app WireGuard: + → Escanear desde código QR.</p>
            <Boton className="w-full" icono={Download} onClick={descargar}>Descargar archivo .conf</Boton>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
