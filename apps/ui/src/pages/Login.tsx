import type { LoginResponse } from "@mi-setup/shared";
import { LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Logo, useAparienciaPublica } from "../components/Logo";
import { Boton, Campo, Entrada, ErrorCaja } from "../components/ui";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { nombrePorDefecto } from "../lib/plataforma";
import { useSesion } from "../lib/sesion";

export default function Login() {
  const navegar = useNavigate();
  const guardar = useSesion((s) => s.guardar);
  const { data: apariencia } = useAparienciaPublica();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await api<LoginResponse>("/api/auth/login", {
        cuerpo: { email, password, totp, dispositivo: nombrePorDefecto() },
      });
      queryClient.clear();
      guardar(r);
      navegar("/", { replace: true });
    } catch (err) {
      setError(err);
      setTotp("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="flex min-h-full items-center justify-center p-4"
      style={
        apariencia?.fondo
          ? { backgroundImage: `linear-gradient(rgba(18,18,18,.85), rgba(18,18,18,.95)), url(${apariencia.fondo})`, backgroundSize: "cover" }
          : undefined
      }
    >
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-tarjeta border border-borde bg-superficie p-6">
        <div className="flex flex-col items-center gap-2 pb-2">
          <Logo tamano="lg" />
          <p className="text-sm text-tenue">Mi Setup</p>
        </div>
        <Campo etiqueta="Correo">
          <Entrada type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Campo>
        <Campo etiqueta="Contraseña">
          <Entrada type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Campo>
        <Campo etiqueta="Código 2FA" ayuda="Los 6 dígitos de tu app autenticadora (obligatorio para la cuenta maestra).">
          <Entrada
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
          />
        </Campo>
        <ErrorCaja error={error} />
        <Boton type="submit" variante="primario" className="w-full" cargando={enviando} icono={LogIn}>
          Entrar
        </Boton>
      </form>
    </div>
  );
}
