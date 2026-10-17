/** Ajustes: apariencia (imágenes propias), seguridad (PIN, huella) y sesión. */
import { useMutation } from "@tanstack/react-query";
import { Fingerprint, ImagePlus, KeyRound, LogOut, Palette, RotateCcw, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cerrarSesion } from "../components/Layout";
import { Logo } from "../components/Logo";
import { Boton, Campo, Encabezado, Entrada, Tarjeta, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { biometriaDisponible, biometriaSoportada, inscribirBiometria, quitarBiometria } from "../lib/biometria";
import { queryClient, useApariencia, useMe, usePuede } from "../lib/consultas";
import { dispositivoActual } from "../lib/dispositivo";

const ACEPTA = "image/png,image/jpeg,image/webp,image/svg+xml";

function SubirImagen({ ruta, etiqueta, actual }: { ruta: string; etiqueta: string; actual: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const subir = useMutation({
    mutationFn: (archivo: File) => {
      if (archivo.size > 5 * 1024 * 1024) throw new Error("La imagen supera 5 MB");
      const datos = new FormData();
      datos.append("archivo", archivo);
      return api(ruta, { formulario: datos });
    },
    onSuccess: () => {
      avisar(`${etiqueta} actualizado`);
      void queryClient.invalidateQueries({ queryKey: ["apariencia"] });
    },
    onError: avisarError,
  });
  const restablecer = useMutation({
    mutationFn: () => api(ruta, { metodo: "DELETE" }),
    onSuccess: () => {
      avisar(`${etiqueta} restablecido`);
      void queryClient.invalidateQueries({ queryKey: ["apariencia"] });
    },
    onError: avisarError,
  });
  return (
    <div className="flex items-center gap-4 rounded-xl bg-fondo p-3">
      <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-lg bg-tarjeta">
        {actual ? <img src={actual} alt="" className="max-h-full max-w-full object-contain" /> : <span className="px-2 text-center text-[10px] text-tenue">Predeterminado</span>}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{etiqueta}</p>
        <p className="text-xs text-tenue">PNG, JPG, WEBP o SVG · máx. 5 MB</p>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACEPTA}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) subir.mutate(f);
          e.target.value = "";
        }}
      />
      <Boton tamano="sm" icono={ImagePlus} cargando={subir.isPending} onClick={() => input.current?.click()}>
        Subir
      </Boton>
      {actual ? <Boton tamano="sm" variante="fantasma" icono={RotateCcw} onClick={() => restablecer.mutate()} aria-label="Restablecer" /> : null}
    </div>
  );
}

function Pin() {
  const { data: me } = useMe();
  const [pin, setPin] = useState("");
  const guardar = useMutation({
    mutationFn: () => api("/api/auth/pin", { metodo: "PUT", cuerpo: { pin } }),
    onSuccess: () => {
      setPin("");
      avisar("PIN guardado");
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: avisarError,
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        guardar.mutate();
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <Campo etiqueta={me?.tienePin ? "Cambiar PIN" : "Crear PIN"} ayuda="De 6 a 12 dígitos. Sirve para reautenticarte en acciones normales; para bóveda, root y control remoto se pide contraseña o huella." className="min-w-56 flex-1">
        <Entrada type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} maxLength={12} />
      </Campo>
      <Boton type="submit" variante="primario" icono={KeyRound} disabled={pin.length < 6} cargando={guardar.isPending}>
        Guardar PIN
      </Boton>
    </form>
  );
}

function Huella() {
  const [soportada, setSoportada] = useState(false);
  const [activa, setActiva] = useState(false);
  useEffect(() => {
    void biometriaSoportada().then(setSoportada);
    void biometriaDisponible().then(setActiva);
  }, []);
  if (!soportada) return <p className="text-xs text-tenue">La huella o el rostro se activan desde la app de Android.</p>;
  return activa ? (
    <Boton
      icono={Fingerprint}
      onClick={() =>
        void quitarBiometria().then(() => {
          setActiva(false);
          avisar("Huella desactivada");
        })
      }
    >
      Desactivar huella en este celular
    </Boton>
  ) : (
    <Boton
      icono={Fingerprint}
      variante="primario"
      onClick={() =>
        void inscribirBiometria()
          .then(() => {
            setActiva(true);
            avisar("Huella activada");
          })
          .catch(avisarError)
      }
    >
      Activar huella en este celular
    </Boton>
  );
}

export default function Ajustes() {
  const { data: apariencia } = useApariencia();
  const esAdmin = usePuede("ajustes", "administrar");
  const navegar = useNavigate();
  return (
    <>
      <Encabezado titulo="Ajustes" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Apariencia" icono={Palette}>
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-fondo p-3">
            <Logo />
            <span className="text-xs text-tenue">Vista previa del encabezado</span>
          </div>
          <div className="space-y-3">
            {esAdmin ? (
              <>
                <SubirImagen ruta="/api/apariencia/global/logo" etiqueta="Logo de la app" actual={apariencia?.logo ?? null} />
                <SubirImagen ruta="/api/apariencia/global/fondo" etiqueta="Fondo (opcional)" actual={apariencia?.fondo ?? null} />
              </>
            ) : null}
            <SubirImagen ruta="/api/apariencia/avatar" etiqueta="Tu avatar" actual={apariencia?.avatar ?? null} />
          </div>
          <p className="mt-3 text-xs text-tenue">Restablecer vuelve al logo de MexicanLand.</p>
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta titulo="Seguridad" icono={KeyRound}>
            <div className="space-y-4">
              <Pin />
              <Huella />
            </div>
          </Tarjeta>
          <Tarjeta titulo="Este dispositivo" icono={Smartphone}>
            <p className="break-all text-xs text-tenue">Identificador: {dispositivoActual() ?? "sin registrar"}</p>
          </Tarjeta>
          <Tarjeta titulo="Sesión" icono={LogOut}>
            <Boton variante="peligro" icono={LogOut} onClick={() => void cerrarSesion().then(() => navegar("/login"))}>
              Cerrar sesión en este dispositivo
            </Boton>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
