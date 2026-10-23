/**
 * Ajustes en pestañas: cuenta (perfil, contraseña, avatar), apariencia (tema,
 * fuente, zoom, imágenes, idioma), terminal (tema, fuente, tamaño), voz e IA,
 * seguridad (PIN, huella) y este dispositivo.
 */
import {
  FUENTES_APP,
  FUENTES_TERMINAL,
  MODELOS_IA,
  NOMBRE_TIPO_EQUIPO,
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
import { ChevronLeft, ChevronRight, Download, Fingerprint, Globe2, GraduationCap, ImagePlus, KeyRound, LogOut, Minus, MonitorSmartphone, Palette, Plug, Plus, RefreshCw, RotateCcw, Save, Server, ShieldCheck, SquareTerminal, UserRound, Volume2, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cerrarSesion } from "../components/Layout";
import { Logo, useAparienciaPublica } from "../components/Logo";
import { abrirTutorial } from "../components/Tutorial";
import { DescargasApps } from "../components/DescargasApps";
import { SeccionActualizaciones, useHayVersionNueva } from "../components/Actualizaciones";
import { PUBLICA } from "../edicion";
import { cambiarServidorConservando } from "../lib/actualizaciones";
import { useForma } from "../lib/marco";
import { CodigoQr } from "../components/CodigoQr";
import { InsigniaRol } from "./Cuentas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Selector, Tarjeta, avisar, avisarError, cx } from "../components/ui";
import { confirmar } from "../lib/confirmar";
import { API_BASE, PUEDE_CAMBIAR_SERVIDOR, api, olvidarServidor, origenServidor, servidorResponde, servidoresRecordados } from "../lib/api";
import { useModelosExtra } from "../lib/ia-modelos";
import { biometriaDisponible, biometriaSoportada, inscribirBiometria, quitarBiometria } from "../lib/biometria";
import { queryClient, useApariencia, useMe, usePuede } from "../lib/consultas";
import { dispositivoActual } from "../lib/dispositivo";
import { sistemaDispositivo, tipoDispositivo } from "../lib/plataforma";
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
    <Campo etiqueta="Nombre de la app" ayuda={PUBLICA ? "Se ve arriba del menú, en el inicio de sesión y en el título. Vacío = Mi Setup." : "Se ve arriba del menú, en el inicio de sesión y en el título. Vacío = MexicanLand."}>
      <div className="flex gap-2">
        <Entrada value={actual} maxLength={40} onChange={(e) => setNombre(e.target.value)} placeholder={PUBLICA ? "Mi Setup" : "MexicanLand"} />
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
        <Tarjeta titulo="Letras más legibles">
          <p className="mb-3 text-xs text-tenue">Si algunas explicaciones no se alcanzan a leer (sobre todo encima del fondo de pantalla), súbeles el contraste o cámbiales el color.</p>
          <div className="space-y-4">
            <Campo etiqueta="Contraste de las explicaciones">
              <Selector value={prefs.lectura.contraste} onChange={(e) => guardar((p) => ({ ...p, lectura: { ...p.lectura, contraste: e.target.value as "normal" | "alto" | "maximo" } }))}>
                <option value="normal">Normal</option>
                <option value="alto">Alto (recomendado con fondo de pantalla)</option>
                <option value="maximo">Máximo (igual que los títulos)</option>
              </Selector>
            </Campo>
            <Campo etiqueta="Color de las letras" ayuda="Con fondo oscuro se leen mejor blanco o crema; con tema claro, negro.">
              <Selector value={prefs.lectura.color} onChange={(e) => guardar((p) => ({ ...p, lectura: { ...p.lectura, color: e.target.value as "tema" | "blanco" | "crema" | "celeste" | "negro" } }))}>
                <option value="tema">El del tema</option>
                <option value="blanco">Blanco</option>
                <option value="crema">Crema (cansa menos la vista)</option>
                <option value="celeste">Celeste</option>
                <option value="negro">Negro (para temas claros)</option>
              </Selector>
            </Campo>
            <Interruptor activo={prefs.lectura.sombra} alCambiar={(v) => guardar((p) => ({ ...p, lectura: { ...p.lectura, sombra: v } }))} etiqueta="Sombra suave detrás de las letras (ayuda con fondos de pantalla con mucho detalle)" />
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
          <span style={{ color: tema.green ?? tema.foreground }}>{PUBLICA ? "root@miservidor" : "root@mexicanland"}</span>:<span style={{ color: tema.blue ?? tema.foreground }}>~</span>$ docker ps{"\n"}
          misetup-core Up 2 hours{"\n"}
          misetup-db Up 2 hours (healthy){"\n"}
          <span style={{ color: tema.red ?? tema.foreground }}>error</span>: ejemplo de color{"\n"}
          <span style={{ color: tema.green ?? tema.foreground }}>{PUBLICA ? "root@miservidor" : "root@mexicanland"}</span>
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
          <p className="text-sm">Tipo: {NOMBRE_TIPO_EQUIPO[tipoDispositivo()]} · {sistemaDispositivo()}</p>
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

const SE_QUEDA = ["Tu tema, letra y zoom", "Letras más legibles y fondo", "Idioma", "Apariencia de la terminal", "Tu voz", "Las sesiones de otros servidores en este aparato"];
const CAMBIA = ["Las funciones del menú: las que tenga ese servidor", "Tus datos: notas, recordatorios, finanzas…", "Tu cuenta y permisos en ese servidor", "Servidores, sitios y claves de ese servidor"];

function CajaCambio({ titulo, lista, tono }: { titulo: string; lista: string[]; tono: "ok" | "aviso" }) {
  const color = tono === "ok" ? "var(--ok, #3ddc84)" : "var(--aviso, #f5c451)";
  return (
    <div className="rounded-2xl border p-3" style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}>
      <p className="mb-2 text-sm font-semibold" style={{ color }}>
        {titulo}
      </p>
      <ul className="space-y-1 text-sm">
        {lista.map((t) => (
          <li key={t} className="flex gap-2">
            <span aria-hidden style={{ color }}>
              •
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServidoresMiSetup() {
  const [lista, setLista] = useState(() => servidoresRecordados());
  const [nuevo, setNuevo] = useState("");
  const ir = (url: string | null) =>
    void confirmar({
      titulo: `Cambiar a ${url ? new URL(url).host : "el servidor principal"}`,
      mensaje: "La app se recarga con las funciones de ese servidor. Tu apariencia, idioma y terminal se quedan igual.",
    }).then((ok) => ok && cambiarServidorConservando(url));
  const cajas = (
    <div className="grid gap-3 md:grid-cols-2">
      <CajaCambio titulo="Se queda" lista={SE_QUEDA} tono="ok" />
      <CajaCambio titulo="Cambia" lista={CAMBIA} tono="aviso" />
    </div>
  );
  if (!PUEDE_CAMBIAR_SERVIDOR)
    return (
      <div className="space-y-4">
        <p className="text-sm text-tenue">En el navegador cada servidor tiene su propia dirección: ábrela en otra pestaña. En la app de PC y del celular cambias aquí mismo.</p>
        {cajas}
      </div>
    );
  return (
    <div className="space-y-4">
      <ul className="overflow-hidden rounded-2xl border border-borde">
        {lista.map((s) => (
          <li key={s.url} className="flex flex-wrap items-center gap-2 border-b border-borde bg-tarjeta px-4 py-3 text-sm last:border-b-0">
            <Server className="h-4 w-4 shrink-0 text-acento" />
            <span className="min-w-0 flex-1 truncate">
              {new URL(s.url).host}
              {s.nombre ? <span className="text-xs text-tenue"> · {s.nombre}</span> : null}
            </span>
            {s.actual ? (
              <Insignia tono="ok">En uso</Insignia>
            ) : (
              <>
                <Boton tamano="sm" onClick={() => ir(s.url)}>
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
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const origen = origenServidor(nuevo);
          if (!origen) return avisarError(new Error("Escribe la dirección de tu Mi Setup, p. ej. setup.tudominio.com"));
          // Antes de cambiar se revisa que ese Mi Setup conteste (si no, la app se quedaría sin poder entrar).
          void servidorResponde(origen).then((ok) => (ok ? ir(origen) : avisarError(new Error(`No se pudo conectar con ${new URL(origen).host}. Revisa la dirección y que ese Mi Setup esté encendido.`))));
        }}
      >
        <Entrada value={nuevo} onChange={(e) => setNuevo(e.target.value)} inputMode="url" placeholder="setup.otrodominio.com" />
        <Boton type="submit">Agregar</Boton>
      </form>
      {cajas}
      <p className="text-xs text-tenue">Cada servidor guarda su propia sesión en este aparato: cambias con un toque sin volver a escribir tu contraseña.</p>
    </div>
  );
}

function SitioOficial() {
  const sitios = useQuery({ queryKey: ["sitios"], queryFn: () => api<{ id: string; slug: string }[]>("/api/sitios") });
  const oficial = sitios.data?.find((x) => x.slug === "misetup");
  const actualizar = useMutation({
    mutationFn: () => api<{ publicado: boolean }>(`/api/sitios/${oficial?.id ?? ""}/oficial/actualizar`, { metodo: "POST" }),
    onSuccess: (r) => avisar(r.publicado ? "Sitio oficial actualizado y publicado" : "Sitio oficial actualizado (sin publicar)"),
    onError: avisarError,
  });
  return (
    <div className="space-y-3 text-sm">
      <p className="text-tenue">{`Pone la wiki, las capturas, el logo y las descargas del sitio oficial al día con esta versión (${__VERSION_APP__}). Si ya está publicado, lo nuevo se publica también.`}</p>
      {sitios.isLoading ? <Cargando /> : null}
      {sitios.data && !oficial ? <p className="text-tenue">Todavía no hay sitio oficial en este servidor.</p> : null}
      <Boton
        variante="primario"
        icono={RotateCcw}
        disabled={!oficial}
        cargando={actualizar.isPending}
        onClick={() => void confirmar({ titulo: "Actualizar el sitio oficial", mensaje: "Se reemplazan sus páginas por las de esta versión. Lo que hayas cambiado a mano queda en el historial de versiones." }).then((ok) => ok && actualizar.mutate())}
      >
        Actualizar con esta versión
      </Boton>
    </div>
  );
}

function MiCuenta() {
  const navegar = useNavigate();
  return (
    <div className="space-y-4">
      <Cuenta />
      <button type="button" onClick={() => navegar("/equipos")} className="flex w-full items-center gap-3 rounded-2xl border border-borde bg-tarjeta p-4 text-left transition hover:border-acento">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: "#3a7bd5" }}>
          <MonitorSmartphone className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block">Equipos</b>
          <small className="text-tenue">Dónde tienes la sesión abierta, historial y cerrar las demás</small>
        </span>
        <ChevronRight className="h-4 w-4 text-tenue" />
      </button>
      <Boton variante="peligro" icono={LogOut} className="w-full sm:w-auto" onClick={() => void cerrarSesion().then(() => navegar("/login"))}>
        Cerrar sesión
      </Boton>
    </div>
  );
}

const PESTANAS = ["cuenta", "servidor", "apariencia", "terminal", "voz", "seguridad", "claves", "servicios", "apps", "actualizaciones", "oficial"] as const;
type Pestana = (typeof PESTANAS)[number];

interface FilaAjuste {
  id: Pestana;
  titulo: string;
  icono: LucideIcon;
  color: string;
  valor?: string;
  globo?: boolean;
}

function Fila({ f, activa, alTocar }: { f: FilaAjuste; activa: boolean; alTocar: () => void }) {
  const Icono = f.icono;
  return (
    <button
      type="button"
      onClick={alTocar}
      aria-current={activa ? "page" : undefined}
      className="flex w-full items-center gap-3 border-b border-borde px-3 py-2.5 text-left text-sm transition last:border-b-0 hover:bg-fondo"
      style={activa ? { background: "color-mix(in srgb, var(--acento) 14%, transparent)" } : undefined}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: f.color }}>
        <Icono className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{f.titulo}</span>
      {f.globo ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-peligro" aria-label="Hay algo nuevo" /> : null}
      {f.valor ? <span className="max-w-[40%] truncate text-xs text-tenue">{f.valor}</span> : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-tenue" />
    </button>
  );
}

export default function Ajustes() {
  const forma = useForma();
  const ancho = forma === "pc";
  const [pestana, setPestana] = useState<Pestana | null>(() => {
    const pedida = new URLSearchParams(window.location.search).get("pestana");
    const encontrada = PESTANAS.find((x) => x === pedida);
    return encontrada ?? null;
  });
  const { data: me } = useMe();
  const { data: apariencia } = useApariencia();
  const prefs = usePreferencias();
  const esMaestra = me?.usuario.role === "maestra";
  const hayNueva = useHayVersionNueva();
  const misClaves = useQuery({
    queryKey: ["mis-claves"],
    queryFn: () => api<RespuestaMisClaves>("/api/mis-claves"),
    staleTime: 60_000,
  });
  const verServicios = esMaestra || Boolean(misClaves.data?.politica.verServicios);
  const grupos: FilaAjuste[][] = [
    [
      { id: "cuenta", titulo: "Mi cuenta", icono: UserRound, color: "#7c5cff", valor: "Equipos y sesión" },
      { id: "servidor", titulo: "Servidor", icono: Server, color: "#2e9e6b", valor: new URL(API_BASE || window.location.origin).host },
    ],
    [
      { id: "apariencia", titulo: "Apariencia", icono: Palette, color: "#ec4899", valor: TEMAS_APP[prefs.tema] },
      { id: "terminal", titulo: "Terminal", icono: SquareTerminal, color: "#334155", valor: TEMAS_TERMINAL[prefs.terminal.tema] },
      { id: "voz", titulo: "Voz e IA", icono: Volume2, color: "#a855f7" },
    ],
    [
      { id: "seguridad", titulo: "Seguridad", icono: ShieldCheck, color: "#3a7bd5", valor: "PIN, huella y 2 pasos" },
      { id: "claves", titulo: "Mis claves", icono: KeyRound, color: "#f59e0b" },
      ...(verServicios ? [{ id: "servicios" as const, titulo: "Servicios y claves", icono: Plug, color: "#0ea5e9" }] : []),
    ],
    [
      { id: "apps", titulo: "Descargar apps", icono: Download, color: "#14b8a6", valor: "PC, Android, iPhone" },
      { id: "actualizaciones", titulo: "Actualizaciones", icono: RefreshCw, color: "#6366f1", valor: __VERSION_APP__, globo: hayNueva },
      ...(esMaestra && !PUBLICA ? [{ id: "oficial" as const, titulo: "Sitio oficial", icono: Globe2, color: "#8b5cf6" }] : []),
    ],
  ];
  const filas = grupos.flat();
  const actual = filas.find((f) => f.id === pestana) ?? (ancho ? filas[0] : undefined);
  const elegir = (id: Pestana) => {
    setPestana(id);
    const url = new URL(window.location.href);
    url.searchParams.set("pestana", id);
    window.history.replaceState(window.history.state, "", url);
  };
  const volver = () => {
    setPestana(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("pestana");
    window.history.replaceState(window.history.state, "", url);
  };

  const lista = (
    <div className="space-y-4">
      <button type="button" onClick={() => elegir("cuenta")} className="flex w-full items-center gap-3 rounded-2xl border border-borde bg-tarjeta p-4 text-left transition hover:border-acento">
        {apariencia?.avatar ? (
          <img src={apariencia.avatar} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold text-white" style={{ background: "#7c5cff" }}>
            {me?.usuario.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <b className="block truncate text-base">{me?.usuario.displayName}</b>
          <small className="block truncate text-tenue">{me?.usuario.email}</small>
        </span>
        <ChevronRight className="h-4 w-4 text-tenue" />
      </button>
      {grupos.map((g, i) =>
        g.length ? (
          <div key={i} className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
            {g.map((f) => (
              <Fila key={f.id} f={f} activa={ancho && actual?.id === f.id} alTocar={() => elegir(f.id)} />
            ))}
          </div>
        ) : null,
      )}
      <button
        type="button"
        onClick={() => void cerrarSesion().then(() => window.location.assign("/login"))}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-borde bg-tarjeta p-3 text-sm font-semibold text-peligro transition hover:bg-fondo"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    </div>
  );

  const detalle = actual ? (
    <div className="min-w-0">
      {ancho ? null : (
        <button type="button" onClick={volver} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-acento">
          <ChevronLeft className="h-4 w-4" />
          Ajustes
        </button>
      )}
      <h2 className="mb-4 text-xl font-semibold">{actual.titulo}</h2>
      {actual.id === "cuenta" ? <MiCuenta /> : null}
      {actual.id === "servidor" ? <ServidoresMiSetup /> : null}
      {actual.id === "apariencia" ? <Apariencia /> : null}
      {actual.id === "terminal" ? <TerminalAjustes /> : null}
      {actual.id === "voz" ? <VozIa /> : null}
      {actual.id === "seguridad" ? <Seguridad /> : null}
      {actual.id === "claves" ? <MisClaves /> : null}
      {actual.id === "servicios" && verServicios ? <Servicios /> : null}
      {actual.id === "apps" ? <DescargasApps /> : null}
      {actual.id === "actualizaciones" ? <SeccionActualizaciones /> : null}
      {actual.id === "oficial" ? <SitioOficial /> : null}
    </div>
  ) : null;

  if (!ancho) {
    return (
      <>
        {detalle ? null : <Encabezado titulo="Ajustes" descripcion="Tus cambios se guardan en tu cuenta y se aplican en la PC y el celular." />}
        {detalle ?? lista}
      </>
    );
  }
  return (
    <>
      <Encabezado titulo="Ajustes" descripcion="Tus cambios se guardan en tu cuenta y se aplican en la PC y el celular." />
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "minmax(280px, 340px) minmax(0, 1fr)" }}>
        <div className="sticky top-4">{lista}</div>
        {detalle}
      </div>
    </>
  );
}
