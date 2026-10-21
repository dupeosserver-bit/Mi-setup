/**
 * Ajustes en pestañas: cuenta (perfil, contraseña, avatar), apariencia (tema,
 * fuente, zoom, imágenes, idioma), terminal (tema, fuente, tamaño), voz e IA,
 * seguridad (PIN, huella) y este dispositivo.
 */
import {
  FUENTES_APP,
  FUENTES_TERMINAL,
  MODELOS_IA,
  IDIOMAS_APP,
  TEMAS_APP,
  TEMAS_TERMINAL,
  type FuenteApp,
  type FuenteTerminal,
  type IdiomaApp,
  type ModeloIa,
  type TemaApp,
  type TemaTerminal,
} from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Fingerprint, GraduationCap, ImagePlus, KeyRound, LogOut, Minus, Plus, RotateCcw, Save, Server, ShieldCheck, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cerrarSesion } from "../components/Layout";
import { Logo, useAparienciaPublica } from "../components/Logo";
import { abrirTutorial } from "../components/Tutorial";
import { DescargasApps } from "../components/DescargasApps";
import { CodigoQr } from "../components/CodigoQr";
import { InsigniaRol } from "./Cuentas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Pestanas, Selector, Tarjeta, avisar, avisarError, cx } from "../components/ui";
import { confirmar } from "../lib/confirmar";
import { PUEDE_CAMBIAR_SERVIDOR, api, cambiarServidor, olvidarServidor, servidoresRecordados } from "../lib/api";
import { useModelosExtra } from "../lib/ia-modelos";
import { biometriaDisponible, biometriaSoportada, inscribirBiometria, quitarBiometria } from "../lib/biometria";
import { queryClient, useApariencia, useMe, usePuede } from "../lib/consultas";
import { dispositivoActual } from "../lib/dispositivo";
import { tipoDispositivo } from "../lib/plataforma";
import { idiomaGuardado } from "../lib/idioma";
import { TEMAS_XTERM, useFlotantes, useGuardarPreferencias, usePreferencias, type ModoFlotantes } from "../lib/preferencias";
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
      return api("/api/cuenta/contrasena", {
        metodo: "POST",
        cuerpo: { actual: claves.actual, nueva: claves.nueva },
      });
    },
    onSuccess: () => {
      setClaves({ actual: "", nueva: "", repetida: "" });
      avisar("Contraseña cambiada; se cerraron tus otras sesiones");
    },
    onError: avisarError,
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              {me?.roles?.map((r) => (
                <InsigniaRol key={r.id} nombre={r.nombre} color={r.color} />
              ))}
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

/** Nombre que muestra la app en esta instalación (encabezado, inicio de sesión y título). */
function NombreApp() {
  const { data } = useAparienciaPublica();
  const [nombre, setNombre] = useState<string | null>(null);
  const actual = nombre ?? data?.nombre ?? "";
  const guardar = useMutation({
    mutationFn: () =>
      api("/api/apariencia/nombre", {
        metodo: "PUT",
        cuerpo: { nombre: actual },
      }),
    onSuccess: () => {
      avisar("Nombre guardado");
      setNombre(null);
      void queryClient.invalidateQueries({ queryKey: ["apariencia"] });
    },
    onError: avisarError,
  });
  return (
    <Campo etiqueta="Nombre de la app" ayuda="Se ve arriba del menú, en el inicio de sesión y en el título. Vacío = MexicanLand.">
      <div className="flex gap-2">
        <Entrada value={actual} maxLength={40} onChange={(e) => setNombre(e.target.value)} placeholder="MexicanLand" />
        <Boton variante="primario" cargando={guardar.isPending} disabled={nombre === null || nombre === (data?.nombre ?? "")} onClick={() => guardar.mutate()}>
          Guardar
        </Boton>
      </div>
    </Campo>
  );
}

function Apariencia() {
  const prefs = usePreferencias();
  const guardar = useGuardarPreferencias();
  const { data: apariencia } = useApariencia();
  const esAdmin = usePuede("ajustes", "administrar");
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                <div
                  className="mb-1.5 flex h-10 items-end gap-1 rounded-lg p-1.5"
                  style={{
                    background: t === "sistema" ? `linear-gradient(90deg, ${f} 50%, ${s} 50%)` : f,
                  }}
                >
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
              <Selector
                value={prefs.fuente}
                onChange={(e) =>
                  guardar((p) => ({
                    ...p,
                    fuente: e.target.value as FuenteApp,
                  }))
                }
              >
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
            <Campo etiqueta="Idioma" ayuda="Cambia los textos de toda la app. Tus notas y datos se quedan como los escribiste.">
              <Selector value={prefs.idioma ?? idiomaGuardado()} onChange={(e) => guardar((p) => ({ ...p, idioma: e.target.value as IdiomaApp }))}>
                {Object.entries(IDIOMAS_APP).map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Fondo transparente">
          {apariencia?.fondo ? null : (
            <p className="mb-3 text-xs text-tenue">Primero pon un fondo de pantalla (en «Imágenes», lo cambia la cuenta maestra); luego aquí lo dejas ver.</p>
          )}
          <div className="space-y-4">
            <Campo etiqueta={`Paneles transparentes: ${prefs.vidrio.paneles}%`} ayuda="Barra lateral, tarjetas y cajas dejan ver el fondo de pantalla.">
              <input
                type="range"
                min={0}
                max={85}
                step={5}
                value={prefs.vidrio.paneles}
                onChange={(e) =>
                  guardar((p) => ({
                    ...p,
                    vidrio: { ...p.vidrio, paneles: Number(e.target.value) },
                  }))
                }
                className="w-full accent-acento"
              />
            </Campo>
            <Campo etiqueta={`Oscurecer la imagen: ${prefs.vidrio.velo}%`} ayuda="Menos % = el fondo se ve más claro y nítido.">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={prefs.vidrio.velo}
                onChange={(e) =>
                  guardar((p) => ({
                    ...p,
                    vidrio: { ...p.vidrio, velo: Number(e.target.value) },
                  }))
                }
                className="w-full accent-acento"
              />
            </Campo>
            <Campo etiqueta="Cómo se acomoda la imagen" ayuda="Automático: si la foto no tiene la forma de la pantalla (ej. una foto del celular en la PC) se ve completa, sin cortarse.">
              <Selector value={prefs.vidrio.ajuste} onChange={(e) => guardar((p) => ({ ...p, vidrio: { ...p.vidrio, ajuste: e.target.value as "auto" | "llenar" | "completo" } }))}>
                <option value="auto">Automático</option>
                <option value="llenar">Llenar la pantalla (puede cortarse)</option>
                <option value="completo">Completa (sin cortar)</option>
              </Selector>
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Boton tamano="sm" onClick={() => guardar((p) => ({ ...p, vidrio: { ...p.vidrio, paneles: 60, velo: 35 } }))}>
                Ver el fondo
              </Boton>
              <Boton tamano="sm" variante="fantasma" onClick={() => guardar((p) => ({ ...p, vidrio: { paneles: 0, velo: 90, ajuste: "auto" } }))}>
                Restablecer
              </Boton>
            </div>
          </div>
        </Tarjeta>
        <BotonesFlotantes />
        <Tarjeta titulo="Imágenes">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-fondo p-3">
            <Logo />
            <span className="text-xs text-tenue">Vista previa del encabezado</span>
          </div>
          <div className="space-y-3">
            {esAdmin ? (
              <>
                <NombreApp />
                <SubirImagen ruta="/api/apariencia/global/logo" etiqueta="Logo de la app" actual={apariencia?.logo ?? null} />
                <SubirImagen ruta="/api/apariencia/global/fondo" etiqueta="Fondo de pantalla (celular y general)" actual={apariencia?.fondo ?? null} />
                <SubirImagen ruta="/api/apariencia/global/fondo-pc" etiqueta="Fondo para la PC (opcional, horizontal)" actual={apariencia?.fondoPc ?? null} />
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                    onClick={() =>
                      guardar((p) => ({
                        ...p,
                        terminal: { ...p.terminal, tema: id },
                      }))
                    }
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
            <Selector
              value={t.fuente}
              onChange={(e) =>
                guardar((p) => ({
                  ...p,
                  terminal: {
                    ...p.terminal,
                    fuente: e.target.value as FuenteTerminal,
                  },
                }))
              }
            >
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
              onChange={(e) =>
                guardar((p) => ({
                  ...p,
                  terminal: { ...p.terminal, tamano: Number(e.target.value) },
                }))
              }
              className="w-full"
            />
          </Campo>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Vista previa">
        <pre
          className="overflow-x-auto rounded-xl p-4"
          style={{
            background: tema.background,
            color: tema.foreground,
            fontFamily: FUENTES_TERMINAL[t.fuente].css,
            fontSize: t.tamano,
          }}
        >
          <span style={{ color: tema.green ?? tema.foreground }}>root@mexicanland</span>:<span style={{ color: tema.blue ?? tema.foreground }}>~</span>$ docker ps{"\n"}
          misetup-core Up 2 hours{"\n"}
          misetup-db Up 2 hours (healthy){"\n"}
          <span style={{ color: tema.red ?? tema.foreground }}>error</span>: ejemplo de color{"\n"}
          <span style={{ color: tema.green ?? tema.foreground }}>root@mexicanland</span>
          :~$ <span style={{ background: tema.cursor }}> </span>
        </pre>
        <p className="mt-2 text-xs text-tenue">Se aplica a las terminales que abras desde VPS → Terminal.</p>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------- voz e IA

function VozIa() {
  const prefs = usePreferencias();
  const extras = useModelosExtra();
  const guardar = useGuardarPreferencias();
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    void vocesEspanol().then(setVoces);
  }, []);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          {extras.map((m) => (
            <label key={m.id} className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-3", prefs.ia.modelo === m.id ? "border-acento" : "border-borde")}>
              <input type="radio" checked={prefs.ia.modelo === m.id} onChange={() => guardar((p) => ({ ...p, ia: { modelo: m.id } }))} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">{m.nombre}</span>
                <span className="block text-xs text-tenue">{m.detalle}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-tenue">El gasto de los modelos Claude cuenta para el tope mensual (IA → Gasto del mes). Ollama y los agentes del VPS no.</p>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Voz de la IA" icono={Volume2}>
        <div className="space-y-4">
          {voces.length === 0 ? <p className="text-xs text-tenue">Este dispositivo no tiene voces de texto a voz instaladas.</p> : null}
          <Campo etiqueta="Voz" ayuda="Son las voces que trae tu sistema (Windows o Android). Puedes instalar más desde la configuración de voz del sistema.">
            <Selector
              value={prefs.voz.nombre ?? ""}
              onChange={(e) =>
                guardar((p) => ({
                  ...p,
                  voz: { ...p.voz, nombre: e.target.value || null },
                }))
              }
            >
              <option value="">Predeterminada en español</option>
              {voces.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={`Velocidad: ${prefs.voz.velocidad.toFixed(1)}×`}>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={prefs.voz.velocidad}
              onChange={(e) =>
                guardar((p) => ({
                  ...p,
                  voz: { ...p.voz, velocidad: Number(e.target.value) },
                }))
              }
              className="w-full"
            />
          </Campo>
          <Campo etiqueta={`Tono: ${prefs.voz.tono.toFixed(1)}`}>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={prefs.voz.tono}
              onChange={(e) =>
                guardar((p) => ({
                  ...p,
                  voz: { ...p.voz, tono: Number(e.target.value) },
                }))
              }
              className="w-full"
            />
          </Campo>
          <Interruptor
            activo={prefs.voz.leerRespuestas}
            alCambiar={(v) => guardar((p) => ({ ...p, voz: { ...p.voz, leerRespuestas: v } }))}
            etiqueta="Leer en voz alta las respuestas de la IA"
          />
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
      <Campo
        etiqueta={me?.tienePin ? "Cambiar PIN" : "Crear PIN"}
        ayuda="De 6 a 12 dígitos. Sirve para reautenticarte en acciones normales; para bóveda, root y control remoto se pide contraseña o huella."
        className="min-w-56 flex-1"
      >
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

/** Código 2FA para cualquier cuenta: escaneas el QR con tu app autenticadora y confirmas. */
function DosPasos() {
  const { data: me } = useMe();
  const estado = useQuery({
    queryKey: ["cuenta", "2fa"],
    queryFn: () => api<{ activo: boolean }>("/api/cuenta/2fa"),
  });
  const [nuevo, setNuevo] = useState<{ secreto: string; uri: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["cuenta", "2fa"] });
  const iniciar = useMutation({
    mutationFn: () =>
      api<{ secreto: string; uri: string }>("/api/cuenta/2fa/iniciar", {
        metodo: "POST",
      }),
    onSuccess: setNuevo,
    onError: avisarError,
  });
  const confirmar2 = useMutation({
    mutationFn: () => api("/api/cuenta/2fa/confirmar", { cuerpo: { codigo } }),
    onSuccess: () => {
      avisar("Código 2FA activado: desde ahora el inicio de sesión lo pide");
      setNuevo(null);
      setCodigo("");
      refrescar();
    },
    onError: avisarError,
  });
  const quitar = useMutation({
    mutationFn: () => api("/api/cuenta/2fa", { metodo: "DELETE" }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  const esMaestra = me?.usuario.role === "maestra";

  return (
    <Tarjeta titulo="Código 2FA" icono={ShieldCheck}>
      {estado.data?.activo ? (
        <div className="space-y-2 text-sm">
          <p>
            <Insignia tono="ok">Activado</Insignia> Al entrar se pide el código de 6 dígitos de tu app autenticadora.
          </p>
          {esMaestra ? (
            <p className="text-xs text-tenue">La cuenta maestra siempre lo necesita.</p>
          ) : (
            <Boton tamano="sm" variante="fantasma" cargando={quitar.isPending} onClick={() => quitar.mutate()}>
              Quitar código 2FA
            </Boton>
          )}
        </div>
      ) : nuevo ? (
        <div className="space-y-3 text-sm">
          <p>1. En tu app autenticadora (Google Authenticator, Aegis…) toca + y escanea este código:</p>
          <div className="w-fit rounded-xl bg-white p-2">
            <CodigoQr datos={nuevo.uri} tamano={200} />
          </div>
          <p className="break-all text-xs text-tenue">O escribe la clave a mano: {nuevo.secreto}</p>
          <p>2. Escribe el código de 6 dígitos que te muestra:</p>
          <div className="flex gap-2">
            <Entrada inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            <Boton variante="primario" cargando={confirmar2.isPending} disabled={codigo.length !== 6} onClick={() => confirmar2.mutate()}>
              Activar
            </Boton>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-tenue">Protege tu cuenta con un código que cambia cada 30 segundos. También es necesario para poder recibir la cuenta maestra.</p>
          <Boton variante="primario" cargando={iniciar.isPending} onClick={() => iniciar.mutate()}>
            Activar código 2FA
          </Boton>
        </div>
      )}
    </Tarjeta>
  );
}

function Seguridad() {
  const navegar = useNavigate();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Tarjeta titulo="Confirmar tu identidad" icono={KeyRound}>
          <div className="space-y-4">
            <Pin />
            <Huella />
          </div>
        </Tarjeta>
        <DosPasos />
      </div>
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
  soloLectura?: boolean;
}

function FilaClave({ c }: { c: ClaveServicio }) {
  const [valor, setValor] = useState(c.secreto ? "" : c.valor);
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["claves"] });
  const guardar = useMutation({
    mutationFn: () =>
      api<{ reinicio: boolean }>(`/api/claves/${c.nombre}`, {
        metodo: "PUT",
        cuerpo: { valor },
      }),
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
        {c.origen === "ajustes" ? (
          <Insignia tono="ok">Configurada aquí</Insignia>
        ) : c.origen === "env" ? (
          <Insignia>Desde .env</Insignia>
        ) : (
          <Insignia tono="aviso">Sin configurar</Insignia>
        )}
        {c.secreto && c.valor ? <span className="font-mono text-xs text-tenue">{c.valor}</span> : null}
      </div>
      <div className="flex gap-2">
        {c.soloLectura ? null : (
          <>
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
            {c.origen === "ajustes" ? <Boton variante="fantasma" icono={RotateCcw} aria-label="Quitar" cargando={quitar.isPending} onClick={() => quitar.mutate()} /> : null}
          </>
        )}
      </div>
      <p className="text-xs text-tenue">
        {c.ayuda}
        {c.reinicio ? " (se aplica al reiniciar el servidor)" : ""}
      </p>
    </form>
  );
}

function Servicios() {
  const claves = useQuery({
    queryKey: ["claves"],
    queryFn: () => api<ClaveServicio[]>("/api/claves"),
  });
  const grupos = [...new Set((claves.data ?? []).map((c) => c.grupo))];
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-borde bg-superficie p-3 text-sm text-tenue">
        Aquí pones las claves de API y datos de los servicios sin tocar el servidor. Se guardan cifradas, tienen prioridad sobre el archivo .env y nunca se vuelven a mostrar
        completas. Guardar o quitar una clave pide tu contraseña o huella. Las claves internas (base de datos, JWT_SECRET, SERVER_ENC_KEY) solo se cambian en el .env del VPS.
      </p>
      {claves.isLoading ? <Cargando /> : null}
      <ErrorCaja error={claves.error} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

// ---------------------------------------------------------------- mis claves (cada persona)

interface MiClave {
  nombre: string;
  etiqueta: string;
  ayuda: string;
  propia: boolean;
  final: string | null;
  compartida: boolean;
  enUso: "propia" | "servidor" | "compartida" | null;
}
interface RespuestaMisClaves {
  claves: MiClave[];
  politica: { usarDelServidor: boolean; verServicios: boolean };
  aviso: string;
}

const ORIGEN: Record<NonNullable<MiClave["enUso"]>, string> = {
  propia: "Usas la tuya",
  servidor: "Usas la del servidor",
  compartida: "Usas una que alguien compartió",
};

function FilaMiClave({ c, aviso }: { c: MiClave; aviso: string }) {
  const [valor, setValor] = useState("");
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["mis-claves"] });
  const guardar = useMutation({
    mutationFn: (d: { valor?: string; compartir: boolean; entiendo?: boolean }) => api(`/api/mis-claves/${c.nombre}`, { metodo: "PUT", cuerpo: d }),
    onSuccess: () => {
      setValor("");
      refrescar();
      avisar("Guardado");
    },
    onError: avisarError,
  });
  const quitar = useMutation({
    mutationFn: () => api(`/api/mis-claves/${c.nombre}`, { metodo: "DELETE" }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  return (
    <div className="space-y-1.5 rounded-xl bg-fondo p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{c.etiqueta}</span>
        {c.propia ? <Insignia tono="ok">Tuya ••••{c.final}</Insignia> : null}
        {c.enUso ? <Insignia>{ORIGEN[c.enUso]}</Insignia> : <Insignia tono="aviso">Sin clave</Insignia>}
        {c.compartida ? <Insignia tono="aviso">Compartida</Insignia> : null}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate({
            valor: valor.trim(),
            compartir: c.compartida,
            ...(c.compartida ? { entiendo: true } : {}),
          });
        }}
      >
        <Entrada
          type="password"
          autoComplete="off"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={c.propia ? "Escribe para reemplazarla" : "Pega tu clave"}
        />
        <Boton type="submit" icono={Save} disabled={valor.trim().length < 8} cargando={guardar.isPending}>
          Guardar
        </Boton>
        {c.propia ? <Boton variante="fantasma" icono={RotateCcw} aria-label="Quitar mi clave" cargando={quitar.isPending} onClick={() => quitar.mutate()} /> : null}
      </form>
      {c.propia ? (
        <Interruptor
          activo={c.compartida}
          alCambiar={async (v) => {
            if (
              v &&
              !(await confirmar({
                titulo: "Compartir tu clave",
                mensaje: aviso,
                boton: "Compartir",
              }))
            )
              return;
            guardar.mutate({ compartir: v, ...(v ? { entiendo: true } : {}) });
          }}
          etiqueta="Compartirla con las demás personas de este Mi Setup"
        />
      ) : null}
      <p className="text-xs text-tenue">{c.ayuda}</p>
    </div>
  );
}

/** Cada persona pone sus propias claves (IA, Gemini, TMDB, CurseForge) y decide si las comparte. */
function MisClaves() {
  const q = useQuery({
    queryKey: ["mis-claves"],
    queryFn: () => api<RespuestaMisClaves>("/api/mis-claves"),
  });
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-borde bg-superficie p-3 text-sm text-tenue">
        Pon tus propias claves para usar la IA y otros servicios con tu cuenta y tu saldo. Se guardan cifradas: nadie las puede ver, ni la cuenta maestra.
        {q.data && !q.data.politica.usarDelServidor ? " En este Mi Setup no tienes permiso de usar las claves del servidor: pon las tuyas." : ""}
      </p>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {q.data?.claves.map((c) => (
          <FilaMiClave key={`${c.nombre}-${c.propia}-${c.compartida}-${c.final}`} c={c} aviso={q.data.aviso} />
        ))}
      </div>
    </div>
  );
}

/** Los botones flotantes del celular (+ y la IA): se esconden al escribir, se mueven o se apagan. */
function BotonesFlotantes() {
  const { modo, dx, dy, cambiar } = useFlotantes();
  return (
    <Tarjeta titulo="Botones flotantes (+ y la IA)">
      <Selector value={modo} onChange={(e) => cambiar({ modo: e.target.value as ModoFlotantes })}>
        <option value="auto">Esconderlos mientras escribo</option>
        <option value="siempre">Mostrarlos siempre</option>
        <option value="ocultos">No mostrarlos</option>
      </Selector>
      <p className="mt-2 text-xs text-tenue">Para moverlos, mantén presionado un botón medio segundo y arrástralo a donde no estorbe.</p>
      {dx || dy ? (
        <Boton className="mt-2" tamano="sm" variante="fantasma" onClick={() => cambiar({ dx: 0, dy: 0 })}>
          Regresarlos a su lugar
        </Boton>
      ) : null}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------- servidores de Mi Setup

/** Cambiar entre tu Mi Setup y otros (de tu familia, de un cliente) sin volver a iniciar sesión. */
function ServidoresMiSetup() {
  const [lista, setLista] = useState(() => servidoresRecordados());
  const [nuevo, setNuevo] = useState("");
  if (!PUEDE_CAMBIAR_SERVIDOR) return null;
  return (
    <Tarjeta titulo="Servidores de Mi Setup" icono={Server}>
      <ul className="space-y-1">
        {lista.map((s) => (
          <li key={s.url} className="flex flex-wrap items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {new URL(s.url).host}
              {s.nombre ? <span className="text-xs text-tenue"> · {s.nombre}</span> : null}
            </span>
            {s.actual ? (
              <Insignia tono="ok">En uso</Insignia>
            ) : (
              <>
                <Boton tamano="sm" onClick={() => cambiarServidor(s.url)}>
                  Cambiar
                </Boton>
                <Boton
                  tamano="icono"
                  variante="fantasma"
                  icono={RotateCcw}
                  aria-label="Olvidar"
                  title="Olvidar este servidor"
                  onClick={() => {
                    olvidarServidor(s.url);
                    setLista(servidoresRecordados());
                  }}
                />
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const u = new URL(nuevo.trim());
            if (u.protocol !== "https:") throw new Error();
            cambiarServidor(u.origin);
          } catch {
            avisarError(new Error("Escribe la dirección completa con https://"));
          }
        }}
      >
        <Entrada value={nuevo} onChange={(e) => setNuevo(e.target.value)} inputMode="url" placeholder="https://setup.otrodominio.com" />
        <Boton type="submit">Agregar</Boton>
      </form>
      <p className="mt-2 text-xs text-tenue">Cada servidor guarda su propia sesión en este dispositivo: cambias con un toque sin volver a escribir tu contraseña.</p>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------- página

type Pestana = "cuenta" | "apariencia" | "terminal" | "voz" | "seguridad" | "apps" | "claves" | "servicios";

export default function Ajustes() {
  const [pestana, setPestana] = useState<Pestana>("cuenta");
  const { data: me } = useMe();
  const esMaestra = me?.usuario.role === "maestra";
  const misClaves = useQuery({
    queryKey: ["mis-claves"],
    queryFn: () => api<RespuestaMisClaves>("/api/mis-claves"),
    staleTime: 60_000,
  });
  const verServicios = esMaestra || Boolean(misClaves.data?.politica.verServicios);
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
          { id: "apps", texto: "Descargar apps" },
          { id: "claves", texto: "Mis claves" },
          ...(verServicios ? [{ id: "servicios" as const, texto: "Servicios y claves" }] : []),
        ]}
      />
      {pestana === "cuenta" ? (
        <>
          <Cuenta />
          <div className="mt-4">
            <ServidoresMiSetup />
          </div>
        </>
      ) : null}
      {pestana === "apariencia" ? <Apariencia /> : null}
      {pestana === "terminal" ? <TerminalAjustes /> : null}
      {pestana === "voz" ? <VozIa /> : null}
      {pestana === "seguridad" ? <Seguridad /> : null}
      {pestana === "apps" ? <DescargasApps /> : null}
      {pestana === "claves" ? <MisClaves /> : null}
      {pestana === "servicios" && verServicios ? <Servicios /> : null}
    </>
  );
}
