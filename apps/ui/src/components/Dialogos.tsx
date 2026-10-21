/** Diálogos globales: reautenticación y confirmación (simple o doble). */
import { AlertTriangle, Fingerprint, KeyRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, mensajeDeError } from "../lib/api";
import { biometriaDisponible, biometriaSoportada, inscribirBiometria, reautenticarConBiometria } from "../lib/biometria";
import { useConfirmar } from "../lib/confirmar";
import { queryClient, useMe } from "../lib/consultas";
import { useReauth } from "../lib/reauth";
import { Boton, Campo, Entrada, Interruptor, Modal, avisar } from "./ui";

export function DialogoReauth() {
  const { abierto, metodo, terminar } = useReauth();
  const { data: me } = useMe();
  const [modo, setModo] = useState<"password" | "pin">("password");
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [bio, setBio] = useState(false);
  /** El celular tiene huella pero aún no está activada en Mi Setup. */
  const [ofrecerHuella, setOfrecerHuella] = useState(false);
  const [activarHuella, setActivarHuella] = useState(true);

  const listo = async () => {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    terminar(true);
  };

  const conHuella = async () => {
    setError(null);
    try {
      await reautenticarConBiometria();
      await listo();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  useEffect(() => {
    if (!abierto) return;
    setValor("");
    setError(null);
    // El PIN sirve para todo (también acciones sensibles); la contraseña queda como respaldo.
    setModo(me?.tienePin ? "pin" : "password");
    void (async () => {
      const lista = await biometriaDisponible();
      setBio(lista);
      setOfrecerHuella(!lista && (await biometriaSoportada()));
      // Con la huella activada se pide de una vez, sin tener que tocar nada.
      if (lista) void conHuella();
    })();
  }, [abierto, metodo, me?.tienePin]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api("/api/auth/reauth", {
        cuerpo: modo === "password" ? { metodo: "password", password: valor } : { metodo: "pin", pin: valor },
      });
      if (ofrecerHuella && activarHuella) {
        // La confirmación recién hecha permite activar la huella sin pedir nada más.
        await inscribirBiometria().then(
          () => avisar("Huella activada: la próxima vez solo pon tu dedo"),
          () => undefined,
        );
      }
      await listo();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal abierto={abierto} titulo="Confirma tu identidad" alCerrar={() => terminar(false)} ancho="max-w-sm">
      <p className="mb-4 text-sm text-tenue">
        {bio ? "Pon tu dedo en el sensor, o confirma con tu PIN." : me?.tienePin ? "Confirma con tu PIN." : "Confirma con tu contraseña (en Ajustes puedes crear un PIN para no escribirla)."}
      </p>
      <form onSubmit={enviar} className="space-y-3">
        <Campo etiqueta={modo === "password" ? "Contraseña" : "PIN"}>
          <Entrada
            type="password"
            inputMode={modo === "pin" ? "numeric" : undefined}
            autoComplete={modo === "password" ? "current-password" : "off"}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
          />
        </Campo>
        {error ? <p className="text-sm text-peligro">{error}</p> : null}
        <Boton type="submit" variante="primario" className="w-full" cargando={enviando} icono={KeyRound}>
          Confirmar
        </Boton>
        {bio ? (
          <Boton className="w-full" icono={Fingerprint} onClick={conHuella}>
            Usar huella o rostro
          </Boton>
        ) : null}
        {ofrecerHuella ? <Interruptor activo={activarHuella} alCambiar={setActivarHuella} etiqueta="Activar mi huella en este celular" /> : null}
        {me?.tienePin ? (
          <button
            type="button"
            className="w-full text-center text-xs text-tenue hover:text-texto"
            onClick={() => {
              setModo(modo === "pin" ? "password" : "pin");
              setValor("");
            }}
          >
            {modo === "pin" ? "Usar contraseña" : "Usar PIN"}
          </button>
        ) : null}
      </form>
    </Modal>
  );
}

export function DialogoConfirmar() {
  const { pedido, terminar } = useConfirmar();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    setPaso(1);
    setTexto("");
  }, [pedido]);

  if (!pedido) return null;
  const exacto = pedido.textoExacto ?? "CONFIRMAR";

  return (
    <Modal abierto titulo={pedido.titulo} alCerrar={() => terminar(false)} ancho="max-w-md">
      {pedido.peligroso ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-peligro/40 bg-peligro/10 p-3 text-sm text-peligro">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Acción peligrosa: requiere doble confirmación.
        </div>
      ) : null}
      <p className="text-sm">{pedido.mensaje}</p>
      {pedido.detalle ? (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-fondo p-3 font-mono text-xs">{pedido.detalle}</pre>
      ) : null}

      {pedido.peligroso && paso === 2 ? (
        <Campo etiqueta={`Escribe "${exacto}" para confirmar`} className="mt-4">
          <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
        </Campo>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <Boton variante="fantasma" onClick={() => terminar(false)}>
          Cancelar
        </Boton>
        {pedido.peligroso && paso === 1 ? (
          <Boton variante="peligro" onClick={() => setPaso(2)}>
            Continuar
          </Boton>
        ) : (
          <Boton
            variante={pedido.peligroso ? "peligro" : "primario"}
            disabled={pedido.peligroso ? texto.trim() !== exacto : false}
            onClick={() => terminar(true)}
          >
            {pedido.boton ?? "Confirmar"}
          </Boton>
        )}
      </div>
    </Modal>
  );
}
