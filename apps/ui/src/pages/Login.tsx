import { IDIOMAS_APP, type IdiomaApp, type LoginResponse } from "@mi-setup/shared";
import { ArrowRight, LogIn, Server } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Logo, useAparienciaPublica } from "../components/Logo";
import { Boton, Campo, Entrada, ErrorCaja, Selector } from "../components/ui";
import { FALTA_SERVIDOR, PUEDE_CAMBIAR_SERVIDOR, SERVIDOR_EN_USO, SERVIDOR_PREDETERMINADO_ACTUAL, WEB_OFICIAL, api, cambiarServidor, origenServidor, servidorResponde, servidoresRecordados } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { idiomaGuardado, ponerIdioma } from "../lib/idioma";
import { nombrePorDefecto } from "../lib/plataforma";
import { useSesion } from "../lib/sesion";

/** Dirección escrita → revisa que ese Mi Setup conteste y se cambia a él. */
function useElegirServidor(inicial: string) {
  const [url, setUrl] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const usar = async () => {
    const origen = origenServidor(url);
    if (!origen) return setError("Escribe la dirección de tu Mi Setup, p. ej. setup.tudominio.com");
    setRevisando(true);
    setError(null);
    const ok = await servidorResponde(origen);
    setRevisando(false);
    if (ok) cambiarServidor(origen);
    else setError(`No se pudo conectar con ${new URL(origen).host}. Revisa la dirección y que ese Mi Setup esté encendido.`);
  };
  return { url, setUrl, error, revisando, usar };
}

/** Servidor al que se conecta la app (para usar la misma app con otra instalación de Mi Setup). */
function Servidor() {
  const [editando, setEditando] = useState(false);
  const { url, setUrl, error, revisando, usar } = useElegirServidor(SERVIDOR_EN_USO);
  const otros = servidoresRecordados().filter((s) => !s.actual);
  if (!editando) {
    return (
      <div className="space-y-1">
      {otros.length ? (
        <div className="flex flex-wrap justify-center gap-1">
          {otros.map((s) => (
            <button key={s.url} type="button" onClick={() => cambiarServidor(s.url)} className="rounded-full border border-borde px-2 py-0.5 text-[11px] text-tenue hover:text-texto">
              {new URL(s.url).host}
              {s.nombre ? ` · ${s.nombre}` : ""}
            </button>
          ))}
        </div>
      ) : null}
      <p className="flex items-center justify-center gap-1 text-center text-xs text-tenue">
        <Server className="h-3.5 w-3.5" />
        <span className="truncate">{SERVIDOR_EN_USO ? new URL(SERVIDOR_EN_USO).host : ""}</span>
        <button type="button" className="underline hover:text-texto" onClick={() => setEditando(true)}>
          Cambiar servidor
        </button>
      </p>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-borde p-3">
      <Campo etiqueta="Servidor de Mi Setup" ayuda="Para entrar a otra instalación (la tuya, la de un familiar o la de un cliente). Tu sesión de aquí se guarda para volver con un toque.">
        <Entrada value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://setup.tudominio.com" />
      </Campo>
      {error ? <p className="text-xs text-peligro">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Boton tamano="sm" variante="primario" cargando={revisando} onClick={() => void usar()}>
          Usar este servidor
        </Boton>
        {SERVIDOR_PREDETERMINADO_ACTUAL && SERVIDOR_EN_USO !== SERVIDOR_PREDETERMINADO_ACTUAL ? (
          <Boton tamano="sm" variante="fantasma" onClick={() => cambiarServidor(null)}>
            Volver al predeterminado
          </Boton>
        ) : null}
        <Boton tamano="sm" variante="fantasma" onClick={() => setEditando(false)}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}

/** Lo que solo existe en las apps de PC y celular. */
const SOLO_EN_APPS = ["El host local de tu PC", "La terminal de PowerShell de tu PC", "Autocompletar contraseñas", "Entrar con huella"];

function SoloEnApps() {
  return (
    <details className="rounded-xl border border-borde px-3 py-2 text-xs text-tenue">
      <summary className="cursor-pointer">Qué no funciona en el navegador</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {SOLO_EN_APPS.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="mt-2">Para eso descarga la app de Windows o de Android en la página oficial.</p>
    </details>
  );
}

/** Versión web de la página oficial: primero se escribe la dirección del Mi Setup de la persona. */
function PrimerServidor() {
  const { url, setUrl, error, revisando, usar } = useElegirServidor("");
  const recordados = servidoresRecordados();
  const seguir = (e: FormEvent) => {
    e.preventDefault();
    void usar();
  };
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={seguir} className="w-full max-w-sm space-y-4 rounded-tarjeta border border-borde bg-superficie p-6">
        <div className="flex flex-col items-center gap-2 pb-1 text-center">
          <Logo tamano="lg" />
          <h1 className="text-lg font-semibold">Usa Mi Setup en el navegador</h1>
          <p className="text-sm text-tenue">Sin descargar nada. Escribe la dirección de tu Mi Setup y entra con tu cuenta.</p>
        </div>
        <Campo etiqueta="Dirección de tu Mi Setup">
          <Entrada value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="url" placeholder="setup.tudominio.com" required autoFocus />
        </Campo>
        {error ? <p className="text-xs text-peligro">{error}</p> : null}
        <Boton type="submit" variante="primario" className="w-full" icono={ArrowRight} cargando={revisando}>
          Continuar
        </Boton>
        {recordados.length ? (
          <div className="flex flex-wrap justify-center gap-1">
            {recordados.map((s) => (
              <button key={s.url} type="button" onClick={() => cambiarServidor(s.url)} className="rounded-full border border-borde px-2 py-0.5 text-[11px] text-tenue hover:text-texto">
                {new URL(s.url).host}
                {s.nombre ? ` · ${s.nombre}` : ""}
              </button>
            ))}
          </div>
        ) : null}
        <p className="text-center text-xs text-tenue">En el celular: menú del navegador → «Agregar a inicio» y se abre como app.</p>
        <SoloEnApps />
        <p className="text-center text-xs text-tenue">
          ¿Todavía no tienes Mi Setup?{" "}
          <a href="/instalar" className="underline hover:text-texto">
            Instálalo en tu VPS
          </a>
        </p>
      </form>
    </div>
  );
}

export default function Login() {
  if (FALTA_SERVIDOR) return <PrimerServidor />;
  return <Entrar />;
}

function Entrar() {
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
        {PUEDE_CAMBIAR_SERVIDOR ? <Servidor /> : null}
        {WEB_OFICIAL ? <SoloEnApps /> : null}
        <Idioma />
      </form>
    </div>
  );
}

/** Idioma de esta pantalla (al entrar se usa el de tu cuenta si ya elegiste uno). */
function Idioma() {
  const [idioma, setIdioma] = useState<IdiomaApp>(idiomaGuardado);
  return (
    <div className="flex justify-center">
      <Selector
        aria-label="Idioma"
        className="h-8 w-40 text-xs"
        value={idioma}
        onChange={(e) => {
          const nuevo = e.target.value as IdiomaApp;
          setIdioma(nuevo);
          void ponerIdioma(nuevo);
        }}
      >
        {Object.entries(IDIOMAS_APP).map(([id, nombre]) => (
          <option key={id} value={id}>
            {nombre}
          </option>
        ))}
      </Selector>
    </div>
  );
}
