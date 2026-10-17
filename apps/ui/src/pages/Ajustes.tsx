/**
 * Ajustes en pestañas: cuenta (perfil, contraseña, avatar), apariencia (tema,
 * fuente, zoom, imágenes, idioma), terminal (tema, fuente, tamaño), voz e IA,
 * seguridad (PIN, huella) y este dispositivo.
 */
import {
  FUENTES_APP,
  FUENTES_TERMINAL,
  MODELOS_IA,
  TEMAS_APP,
  TEMAS_TERMINAL,
  type FuenteApp,
  type FuenteTerminal,
  type ModeloIa,
  type TemaApp,
  type TemaTerminal,
} from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Fingerprint, GraduationCap, ImagePlus, KeyRound, LogOut, Minus, Plus, RotateCcw, Save, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cerrarSesion } from "../components/Layout";
import { Logo } from "../components/Logo";
import { abrirTutorial } from "../components/Tutorial";
import { InsigniaRol } from "./Cuentas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Pestanas, Selector, Tarjeta, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { biometriaDisponible, biometriaSoportada, inscribirBiometria, quitarBiometria } from "../lib/biometria";
import { queryClient, useApariencia, useMe, usePuede } from "../lib/consultas";
import { dispositivoActual } from "../lib/dispositivo";
import { tipoDispositivo } from "../lib/plataforma";
import { TEMAS_XTERM, useGuardarPreferencias, usePreferencias } from "../lib/preferencias";
import { hablar, vocesEspanol } from "../lib/voz";

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

// ---------------------------------------------------------------- cuenta

function Cuenta() {
  const { data: me } = useMe();
  const { data: apariencia } = useApariencia();
  const [nombre, setNombre] = useState(me?.usuario.displayName ?? "");
  const [claves, setClaves] = useState({ actual: "", nueva: "", repetida: "" });
  useEffect(() => setNombre(me?.usuario.displayName ?? ""), [me?.usuario.displayName]);

  const perfil = useMutation({
    mutationFn: () => api("/api/cuenta/perfil", { metodo: "PATCH", cuerpo: { nombre } }),
    onSuccess: () => {
      avisar("Nombre actualizado");
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: avisarError,
  });
  const contrasena = useMutation({
    mutationFn: () => {
      if (claves.nueva !== claves.repetida) throw new Error("Las contraseñas nuevas no coinciden");
      return api("/api/cuenta/contrasena", { metodo: "POST", cuerpo: { actual: claves.actual, nueva: claves.nueva } });
    },
    onSuccess: () => {
      setClaves({ actual: "", nueva: "", repetida: "" });
      avisar("Contraseña cambiada; se cerraron tus otras sesiones");
    },
    onError: avisarError,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tarjeta titulo="Tu cuenta">
        <div className="mb-4 flex items-center gap-4">
          {apariencia?.avatar ? (
            <img src={apariencia.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tarjeta text-xl font-semibold">{me?.usuario.displayName.slice(0, 1).toUpperCase()}</div>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{me?.usuario.displayName}</p>
            <p className="truncate text-sm text-tenue">{me?.usuario.email}</p>
            <div className="mt-1 flex gap-1">
              <Insignia tono={me?.usuario.role === "maestra" ? "ok" : "neutro"}>{me?.usuario.role === "maestra" ? "Cuenta maestra" : "Usuario"}</Insignia>
              {me?.roles?.map((r) => <InsigniaRol key={r.id} nombre={r.nombre} color={r.color} />)}
            </div>
          </div>
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            perfil.mutate();
          }}
        >
          <Campo etiqueta="Nombre visible" className="flex-1">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
          </Campo>
          <Boton type="submit" icono={Save} disabled={!nombre.trim() || nombre === me?.usuario.displayName} cargando={perfil.isPending}>
            Guardar
          </Boton>
        </form>
        <div className="mt-4">
          <SubirImagen ruta="/api/apariencia/avatar" etiqueta="Tu foto de perfil" actual={apariencia?.avatar ?? null} />
        </div>
        <Boton className="mt-4" variante="secundario" icono={GraduationCap} onClick={abrirTutorial}>
          Ver tutorial otra vez
        </Boton>
      </Tarjeta>
      <Tarjeta titulo="Cambiar contraseña" icono={KeyRound}>
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            contrasena.mutate();
          }}
        >
          <Campo etiqueta="Contraseña actual">
            <Entrada type="password" autoComplete="current-password" value={claves.actual} onChange={(e) => setClaves({ ...claves, actual: e.target.value })} />
          </Campo>
          <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 12 caracteres.">
            <Entrada type="password" autoComplete="new-password" value={claves.nueva} onChange={(e) => setClaves({ ...claves, nueva: e.target.value })} />
          </Campo>
          <Campo etiqueta="Repite la nueva contraseña">
            <Entrada type="password" autoComplete="new-password" value={claves.repetida} onChange={(e) => setClaves({ ...claves, repetida: e.target.value })} />
          </Campo>
          <Boton type="submit" variante="primario" disabled={!claves.actual || claves.nueva.length < 12} cargando={contrasena.isPending}>
            Cambiar contraseña
          </Boton>
          <p className="text-xs text-tenue">Al cambiarla se cierran tus sesiones en los demás dispositivos.</p>
        </form>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------- apariencia

const MUESTRA: Record<TemaApp, [string, string, string]> = {
  oscuro: ["#121212", "#2c2c2e", "#e5e5ea"],
  claro: ["#f2f2f7", "#ffffff", "#1c1c1e"],
  sistema: ["#121212", "#f2f2f7", "#8e8e93"],
  gris: ["#2b2b2b", "#3d3d3d", "#f0f0f0"],
  amoled: ["#000000", "#161616", "#ffffff"],
  oceano: ["#0b1622", "#16293d", "#5ab4ff"],
  violeta: ["#14101f", "#251d38", "#b794ff"],
  bosque: ["#0f1612", "#1d2a22", "#6fdc8c"],
  "alto-contraste": ["#000000", "#111111", "#ffff00"],
};

function Apariencia() {
  const prefs = usePreferencias();
  const guardar = useGuardarPreferencias();
  const { data: apariencia } = useApariencia();
  const esAdmin = usePuede("ajustes", "administrar");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tarjeta titulo="Tema">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(TEMAS_APP) as TemaApp[]).map((t) => {
            const [f, s, a] = MUESTRA[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => guardar((p) => ({ ...p, tema: t }))}
                className={cx("rounded-xl border p-2 text-left text-xs", prefs.tema === t ? "border-acento ring-1 ring-acento" : "border-borde hover:bg-tarjeta")}
              >
                <div className="mb-1.5 flex h-10 items-end gap-1 rounded-lg p-1.5" style={{ background: t === "sistema" ? `linear-gradient(90deg, ${f} 50%, ${s} 50%)` : f }}>
                  <div className="h-4 flex-1 rounded" style={{ background: s }} />
                  <div className="h-4 w-4 rounded" style={{ background: a }} />
                </div>
                {TEMAS_APP[t]}
              </button>
            );
          })}
        </div>
      </Tarjeta>
      <div className="space-y-4">
        <Tarjeta titulo="Texto">
          <div className="space-y-4">
            <Campo etiqueta="Fuente">
              <Selector value={prefs.fuente} onChange={(e) => guardar((p) => ({ ...p, fuente: e.target.value as FuenteApp }))}>
                {(Object.keys(FUENTES_APP) as FuenteApp[]).map((f) => (
                  <option key={f} value={f} style={{ fontFamily: FUENTES_APP[f].css }}>
                    {FUENTES_APP[f].nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Zoom">
              <div className="flex items-center gap-2">
                <Boton tamano="icono" icono={Minus} aria-label="Alejar" disabled={prefs.zoom <= 70} onClick={() => guardar((p) => ({ ...p, zoom: Math.max(70, p.zoom - 10) }))} />
                <span className="w-16 text-center text-sm font-medium">{prefs.zoom}%</span>
                <Boton tamano="icono" icono={Plus} aria-label="Acercar" disabled={prefs.zoom >= 150} onClick={() => guardar((p) => ({ ...p, zoom: Math.min(150, p.zoom + 10) }))} />
                <Boton tamano="sm" variante="fantasma" onClick={() => guardar((p) => ({ ...p, zoom: 100 }))}>
                  Restablecer
                </Boton>
              </div>
            </Campo>
            <Campo etiqueta="Idioma" ayuda="Por ahora la app está solo en español.">
              <Selector value="es" disabled>
                <option value="es">Español</option>
              </Selector>
            </Campo>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Imágenes">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-fondo p-3">
            <Logo />
            <span className="text-xs text-tenue">Vista previa del encabezado</span>
          </div>
          <div className="space-y-3">
            {esAdmin ? (
              <>
                <SubirImagen ruta="/api/apariencia/global/logo" etiqueta="Logo de la app" actual={apariencia?.logo ?? null} />
                <SubirImagen ruta="/api/apariencia/global/fondo" etiqueta="Fondo de pantalla" actual={apariencia?.fondo ?? null} />
              </>
            ) : (
              <p className="text-xs text-tenue">El logo y el fondo los cambia la cuenta maestra.</p>
            )}
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- terminal

function TerminalAjustes() {
  const prefs = usePreferencias();
  const guardar = useGuardarPreferencias();
  const t = prefs.terminal;
  const tema = TEMAS_XTERM[t.tema];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tarjeta titulo="Terminal SSH">
        <div className="space-y-4">
          <Campo etiqueta="Tema">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TEMAS_TERMINAL) as TemaTerminal[]).map((id) => {
                const x = TEMAS_XTERM[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => guardar((p) => ({ ...p, terminal: { ...p.terminal, tema: id } }))}
                    className={cx("rounded-xl border p-2 text-left text-xs", t.tema === id ? "border-acento ring-1 ring-acento" : "border-borde hover:bg-tarjeta")}
                  >
                    <div className="mb-1.5 rounded-md px-2 py-1.5 font-mono text-[10px]" style={{ background: x.background, color: x.foreground }}>
                      root@vps:~$ ls
                    </div>
                    {TEMAS_TERMINAL[id]}
                  </button>
                );
              })}
            </div>
          </Campo>
          <Campo etiqueta="Fuente">
            <Selector value={t.fuente} onChange={(e) => guardar((p) => ({ ...p, terminal: { ...p.terminal, fuente: e.target.value as FuenteTerminal } }))}>
              {(Object.keys(FUENTES_TERMINAL) as FuenteTerminal[]).map((f) => (
                <option key={f} value={f}>
                  {FUENTES_TERMINAL[f].nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={`Tamaño de letra: ${t.tamano}px`}>
            <input
              type="range"
              min={10}
              max={24}
              value={t.tamano}
              onChange={(e) => guardar((p) => ({ ...p, terminal: { ...p.terminal, tamano: Number(e.target.value) } }))}
              className="w-full"
            />
          </Campo>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Vista previa">
        <pre
          className="overflow-x-auto rounded-xl p-4"
          style={{ background: tema.background, color: tema.foreground, fontFamily: FUENTES_TERMINAL[t.fuente].css, fontSize: t.tamano }}
        >
          <span style={{ color: tema.green ?? tema.foreground }}>root@mexicanland</span>:<span style={{ color: tema.blue ?? tema.foreground }}>~</span>$ docker ps{"\n"}
          misetup-core   Up 2 hours{"\n"}
          misetup-db     Up 2 hours (healthy){"\n"}
          <span style={{ color: tema.red ?? tema.foreground }}>error</span>: ejemplo de color{"\n"}
          <span style={{ color: tema.green ?? tema.foreground }}>root@mexicanland</span>:~$ <span style={{ background: tema.cursor }}> </span>
        </pre>
        <p className="mt-2 text-xs text-tenue">Se aplica a las terminales que abras desde VPS → Terminal.</p>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------- voz e IA

function VozIa() {
  const prefs = usePreferencias();
  const guardar = useGuardarPreferencias();
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    void vocesEspanol().then(setVoces);
  }, []);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tarjeta titulo="Modelo de IA">
        <div className="space-y-2">
          <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-3", prefs.ia.modelo === null ? "border-acento" : "border-borde")}>
            <input type="radio" checked={prefs.ia.modelo === null} onChange={() => guardar((p) => ({ ...p, ia: { modelo: null } }))} className="mt-1" />
            <span>
              <span className="block text-sm font-medium">El del servidor</span>
              <span className="block text-xs text-tenue">Usa el que esté en AI_MODEL (por defecto Sonnet 5.5).</span>
            </span>
          </label>
          {(Object.keys(MODELOS_IA) as ModeloIa[]).map((m) => (
            <label key={m} className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-3", prefs.ia.modelo === m ? "border-acento" : "border-borde")}>
              <input type="radio" checked={prefs.ia.modelo === m} onChange={() => guardar((p) => ({ ...p, ia: { modelo: m } }))} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">{MODELOS_IA[m].nombre}</span>
                <span className="block text-xs text-tenue">{MODELOS_IA[m].detalle}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-tenue">El gasto de cada modelo cuenta para el mismo tope mensual (IA → Gasto del mes).</p>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Voz de la IA" icono={Volume2}>
        <div className="space-y-4">
          {voces.length === 0 ? <p className="text-xs text-tenue">Este dispositivo no tiene voces de texto a voz instaladas.</p> : null}
          <Campo etiqueta="Voz" ayuda="Son las voces que trae tu sistema (Windows o Android). Puedes instalar más desde la configuración de voz del sistema.">
            <Selector value={prefs.voz.nombre ?? ""} onChange={(e) => guardar((p) => ({ ...p, voz: { ...p.voz, nombre: e.target.value || null } }))}>
              <option value="">Predeterminada en español</option>
              {voces.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={`Velocidad: ${prefs.voz.velocidad.toFixed(1)}×`}>
            <input type="range" min={0.5} max={2} step={0.1} value={prefs.voz.velocidad} onChange={(e) => guardar((p) => ({ ...p, voz: { ...p.voz, velocidad: Number(e.target.value) } }))} className="w-full" />
          </Campo>
          <Campo etiqueta={`Tono: ${prefs.voz.tono.toFixed(1)}`}>
            <input type="range" min={0.5} max={2} step={0.1} value={prefs.voz.tono} onChange={(e) => guardar((p) => ({ ...p, voz: { ...p.voz, tono: Number(e.target.value) } }))} className="w-full" />
          </Campo>
          <Interruptor activo={prefs.voz.leerRespuestas} alCambiar={(v) => guardar((p) => ({ ...p, voz: { ...p.voz, leerRespuestas: v } }))} etiqueta="Leer en voz alta las respuestas de la IA" />
          <Boton icono={Volume2} onClick={() => hablar("Hola, soy el asistente de Mi Setup. Así sueno.", prefs.voz)}>
            Probar voz
          </Boton>
        </div>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------- seguridad

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

function Seguridad() {
  const navegar = useNavigate();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tarjeta titulo="Confirmar tu identidad" icono={KeyRound}>
        <div className="space-y-4">
          <Pin />
          <Huella />
        </div>
      </Tarjeta>
      <div className="space-y-4">
        <Tarjeta titulo="Este dispositivo">
          <p className="text-sm">Tipo: {tipoDispositivo() === "pc" ? "PC (app de Windows)" : tipoDispositivo() === "celular" ? "Celular (app de Android)" : "Navegador"}</p>
          <p className="mt-1 break-all text-xs text-tenue">Identificador: {dispositivoActual() ?? "sin registrar"}</p>
        </Tarjeta>
        <Tarjeta titulo="Sesión" icono={LogOut}>
          <Boton variante="peligro" icono={LogOut} onClick={() => void cerrarSesion().then(() => navegar("/login"))}>
            Cerrar sesión en este dispositivo
          </Boton>
        </Tarjeta>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- servicios (claves de API)

interface ClaveServicio {
  nombre: string;
  etiqueta: string;
  grupo: string;
  secreto: boolean;
  ayuda: string;
  reinicio: boolean;
  configurada: boolean;
  origen: "ajustes" | "env" | null;
  valor: string;
}

function FilaClave({ c }: { c: ClaveServicio }) {
  const [valor, setValor] = useState(c.secreto ? "" : c.valor);
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["claves"] });
  const guardar = useMutation({
    mutationFn: () => api<{ reinicio: boolean }>(`/api/claves/${c.nombre}`, { metodo: "PUT", cuerpo: { valor } }),
    onSuccess: (r) => {
      avisar(r.reinicio ? `${c.etiqueta} guardado. Se aplica al reiniciar el servidor.` : `${c.etiqueta} guardado y aplicado`);
      if (c.secreto) setValor("");
      refrescar();
    },
    onError: avisarError,
  });
  const quitar = useMutation({
    mutationFn: () => api(`/api/claves/${c.nombre}`, { metodo: "DELETE" }),
    onSuccess: () => {
      avisar("Quitado: se usa el valor del .env (si hay)");
      refrescar();
    },
    onError: avisarError,
  });
  return (
    <form
      className="space-y-1.5 rounded-xl bg-fondo p-3"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{c.etiqueta}</span>
        <code className="text-[10px] text-tenue">{c.nombre}</code>
        {c.origen === "ajustes" ? <Insignia tono="ok">Configurada aquí</Insignia> : c.origen === "env" ? <Insignia>Desde .env</Insignia> : <Insignia tono="aviso">Sin configurar</Insignia>}
        {c.secreto && c.valor ? <span className="font-mono text-xs text-tenue">{c.valor}</span> : null}
      </div>
      <div className="flex gap-2">
        <Entrada
          type={c.secreto ? "password" : "text"}
          autoComplete="off"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={c.secreto && c.configurada ? "Escribe para reemplazarla" : ""}
        />
        <Boton type="submit" icono={Save} disabled={!valor.trim() || (!c.secreto && valor === c.valor)} cargando={guardar.isPending}>
          Guardar
        </Boton>
        {c.origen === "ajustes" ? (
          <Boton variante="fantasma" icono={RotateCcw} aria-label="Quitar" cargando={quitar.isPending} onClick={() => quitar.mutate()} />
        ) : null}
      </div>
      <p className="text-xs text-tenue">
        {c.ayuda}
        {c.reinicio ? " (se aplica al reiniciar el servidor)" : ""}
      </p>
    </form>
  );
}

function Servicios() {
  const claves = useQuery({ queryKey: ["claves"], queryFn: () => api<ClaveServicio[]>("/api/claves") });
  const grupos = [...new Set((claves.data ?? []).map((c) => c.grupo))];
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-borde bg-superficie p-3 text-sm text-tenue">
        Aquí pones las claves de API y datos de los servicios sin tocar el servidor. Se guardan cifradas, tienen prioridad sobre el archivo .env y nunca se vuelven a mostrar
        completas. Guardar o quitar una clave pide tu contraseña o huella. Las claves internas (base de datos, JWT_SECRET, SERVER_ENC_KEY) solo se cambian en el .env del VPS.
      </p>
      {claves.isLoading ? <Cargando /> : null}
      <ErrorCaja error={claves.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        {grupos.map((g) => (
          <Tarjeta key={g} titulo={g}>
            <div className="space-y-2">
              {claves.data
                ?.filter((c) => c.grupo === g)
                .map((c) => (
                  <FilaClave key={`${c.nombre}-${c.origen}-${c.valor}`} c={c} />
                ))}
            </div>
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- página

type Pestana = "cuenta" | "apariencia" | "terminal" | "voz" | "seguridad" | "servicios";

export default function Ajustes() {
  const [pestana, setPestana] = useState<Pestana>("cuenta");
  const { data: me } = useMe();
  const esMaestra = me?.usuario.role === "maestra";
  return (
    <>
      <Encabezado titulo="Ajustes" descripcion="Tus cambios se guardan en tu cuenta y se aplican en la PC y el celular." />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "cuenta", texto: "Cuenta" },
          { id: "apariencia", texto: "Apariencia" },
          { id: "terminal", texto: "Terminal" },
          { id: "voz", texto: "Voz e IA" },
          { id: "seguridad", texto: "Seguridad" },
          ...(esMaestra ? [{ id: "servicios" as const, texto: "Servicios y claves" }] : []),
        ]}
      />
      {pestana === "cuenta" ? <Cuenta /> : null}
      {pestana === "apariencia" ? <Apariencia /> : null}
      {pestana === "terminal" ? <TerminalAjustes /> : null}
      {pestana === "voz" ? <VozIa /> : null}
      {pestana === "seguridad" ? <Seguridad /> : null}
      {pestana === "servicios" && esMaestra ? <Servicios /> : null}
    </>
  );
}
