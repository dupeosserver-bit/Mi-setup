/** Crear o abrir la bóveda con la clave maestra (nunca sale de este dispositivo). */
import { Fingerprint, KeyRound, Lock, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { mensajeDeError } from "../lib/api";
import { abrirBoveda, crearBoveda, useBoveda, useConfigBoveda } from "../lib/boveda/estado";
import { abrirRapido, aperturaRapida } from "../lib/boveda/rapida";
import { fortaleza } from "../lib/boveda/generador";
import { usePuede } from "../lib/consultas";
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Tarjeta, cx } from "./ui";

export function MedidorFortaleza({ clave }: { clave: string }) {
  const f = fortaleza(clave);
  const colores = ["bg-peligro", "bg-peligro", "bg-aviso", "bg-ok", "bg-ok"];
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cx("h-1.5 flex-1 rounded-full", clave && i < Math.max(1, f.puntos) ? colores[f.puntos] : "bg-tarjeta")} />
        ))}
      </div>
      {clave ? <p className="mt-1 text-xs text-tenue">{f.etiqueta} · ~{f.bits} bits</p> : null}
    </div>
  );
}

const AVISO = "Si pierdes la clave maestra no hay forma de recuperar la bóveda: nadie más la conoce, ni el servidor.";

export function Desbloqueo({ children }: { children: ReactNode }) {
  const config = useConfigBoveda();
  const clave = useBoveda((s) => s.clave);
  const puedeCrear = usePuede("boveda", "administrar");
  const [valor, setValor] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const rapida = aperturaRapida();
  const intentado = useRef(false);

  const abrirConRapida = async () => {
    setError(null);
    setTrabajando(true);
    try {
      await abrirRapido(config.data!);
    } catch (err) {
      const texto = mensajeDeError(err);
      if (!/cancel/i.test(texto)) setError(texto);
    } finally {
      setTrabajando(false);
    }
  };

  // Con huella o PIN activados se piden solos al entrar: si son correctos, abre directo.
  useEffect(() => {
    if (clave || intentado.current || !rapida || !config.data?.configurada) return;
    intentado.current = true;
    void abrirConRapida();
  }, [clave, config.data?.configurada]);

  if (clave) return <>{children}</>;
  if (config.isLoading) return <Cargando />;
  if (config.error) return <ErrorCaja error={config.error} />;

  const crear = !config.data?.configurada;
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (crear) {
      if (valor.length < 12) return setError("La clave maestra debe tener al menos 12 caracteres");
      if (valor !== repetida) return setError("Las claves no coinciden");
    }
    setTrabajando(true);
    try {
      if (crear) await crearBoveda(valor);
      else await abrirBoveda(valor, config.data!);
      setValor("");
      setRepetida("");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setTrabajando(false);
    }
  };

  if (crear && !puedeCrear) return <p className="py-10 text-center text-sm text-tenue">La bóveda aún no se ha creado.</p>;

  return (
    <div className="mx-auto max-w-md py-6">
      <Tarjeta titulo={crear ? "Primer paso: crea tu bóveda" : "Bóveda bloqueada"} icono={crear ? KeyRound : Lock}>
        {!crear && rapida ? (
          <div className="mb-4 space-y-2">
            <Boton
              variante="primario"
              className="w-full"
              icono={Fingerprint}
              cargando={trabajando}
              onClick={() => void abrirConRapida()}
            >
              {rapida.metodo === "huella" ? "Abrir con huella" : "Abrir con mi PIN"}
            </Boton>
            <p className="text-center text-xs text-tenue">o escribe tu clave maestra:</p>
          </div>
        ) : null}
        <form onSubmit={enviar} className="space-y-3">
          <p className="text-sm text-tenue">
            {crear
              ? "Esto se hace una sola vez. La bóveda es una caja fuerte cifrada donde se guardan tus contraseñas y tus códigos 2FA. Elige UNA clave maestra para abrirla; después, adentro, podrás guardar contraseñas y generar nuevas. (Si solo quieres generar una contraseña, usa la pestaña Generador.)"
              : "Escribe tu clave maestra para descifrar la bóveda en este dispositivo. Se bloquea sola tras 5 minutos sin uso."}
          </p>
          <Campo etiqueta="Clave maestra">
            <Entrada type="password" autoComplete={crear ? "new-password" : "current-password"} value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
            {crear ? <MedidorFortaleza clave={valor} /> : null}
          </Campo>
          {crear ? (
            <Campo etiqueta="Repite la clave maestra">
              <Entrada type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
            </Campo>
          ) : null}
          {crear ? (
            <p className="flex items-start gap-2 rounded-xl border border-aviso/40 bg-aviso/10 p-3 text-xs text-aviso">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {AVISO}
            </p>
          ) : null}
          {error ? <p className="text-sm text-peligro">{error}</p> : null}
          <Boton type="submit" variante="primario" className="w-full" cargando={trabajando} icono={crear ? KeyRound : Lock}>
            {crear ? "Crear bóveda" : "Abrir"}
          </Boton>
          {trabajando ? <p className="text-center text-xs text-tenue">Derivando la clave (Argon2id)…</p> : null}
        </form>
      </Tarjeta>
    </div>
  );
}

export { AVISO as AVISO_SIN_RECUPERACION };
