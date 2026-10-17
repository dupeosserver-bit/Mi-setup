/** Diálogos globales: reautenticación y confirmación (simple o doble). */
import { AlertTriangle, Fingerprint, KeyRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, mensajeDeError } from "../lib/api";
import { biometriaDisponible, reautenticarConBiometria } from "../lib/biometria";
import { useConfirmar } from "../lib/confirmar";
import { queryClient, useMe } from "../lib/consultas";
import { useReauth } from "../lib/reauth";
import { Boton, Campo, Entrada, Modal } from "./ui";

export function DialogoReauth() {
  const { abierto, metodo, terminar } = useReauth();
  const { data: me } = useMe();
  const [modo, setModo] = useState<"password" | "pin">("password");
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [bio, setBio] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setValor("");
    setError(null);
    setModo(metodo === "pin" && me?.tienePin ? "pin" : "password");
    void biometriaDisponible().then(setBio);
  }, [abierto, metodo, me?.tienePin]);

  const listo = async () => {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    terminar(true);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api("/api/auth/reauth", {
        cuerpo: modo === "password" ? { metodo: "password", password: valor } : { metodo: "pin", pin: valor },
      });
      await listo();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
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

  return (
    <Modal abierto={abierto} titulo="Confirma tu identidad" alCerrar={() => terminar(false)} ancho="max-w-sm">
      <p className="mb-4 text-sm text-tenue">
        {metodo === "fuerte"
          ? "Esta acción es sensible: confirma con tu contraseña o con tu huella."
          : "Confirma con tu PIN, tu contraseña o tu huella."}
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
        {metodo === "pin" && me?.tienePin ? (
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
