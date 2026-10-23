import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BookOpen, Check, CheckCircle2, Eye, EyeOff, FlaskConical, Globe, KeyRound, Mail, MonitorSmartphone, NotebookPen, Plus, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CorreosGoogle } from "../components/CiberExtra";
import { Boton, Encabezado, Entrada, ErrorCaja, Modal, Pestanas, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { usePuede } from "../lib/consultas";
import { localeActual } from "../lib/idioma";

type Estado = "ok" | "aviso" | "mal";
interface Revision {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
}

const ICONO = { ok: CheckCircle2, aviso: AlertTriangle, mal: XCircle } as const;
const COLOR = {
  ok: "text-ok",
  aviso: "text-aviso",
  mal: "text-peligro",
} as const;

async function sha1Mayusculas(texto: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Cuántas veces aparece la contraseña en filtraciones. Solo se envían 5 caracteres del hash. */
export async function vecesFiltrada(contrasena: string, consultar: (prefijo: string) => Promise<string>): Promise<number> {
  const hash = await sha1Mayusculas(contrasena);
  const lista = await consultar(hash.slice(0, 5));
  for (const linea of lista.split(/\r?\n/)) {
    const [sufijo, veces] = linea.trim().split(":");
    if (sufijo === hash.slice(5)) return Number(veces) || 0;
  }
  return 0;
}

const suave = (variable: string, pct = 14) => `color-mix(in srgb, var(${variable}) ${pct}%, transparent)`;

function Cuadro({ icono: Icono, titulo, texto, color = "--acento", className, children }: { icono: LucideIcon; titulo: string; texto: string; color?: string; className?: string; children?: ReactNode }) {
  return (
    <section className={cx("flex min-w-0 flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: suave(color, 16), color: `var(${color})` }}>
          <Icono className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <b className="block text-sm">{titulo}</b>
          <small className="text-xs text-tenue">{texto}</small>
        </div>
      </div>
      {children}
    </section>
  );
}

function RevisarSitio({ className }: { className?: string }) {
  const [sitio, setSitio] = useState("");
  const revisar = useMutation({
    mutationFn: () => api<{ sitio: string; calificacion: number; revisiones: Revision[] }>("/api/ciberseguridad/sitio", { cuerpo: { sitio } }),
    onError: avisarError,
  });
  const r = revisar.data;
  const color = r ? (r.calificacion >= 80 ? "--ok" : r.calificacion >= 50 ? "--aviso" : "--error") : "--acento";
  return (
    <Cuadro icono={Globe} titulo="Revisar un sitio" texto="HTTPS, cabeceras de seguridad y protección del correo (SPF/DMARC)." className={className}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (sitio.trim()) revisar.mutate();
        }}
      >
        <Entrada value={sitio} onChange={(e) => setSitio(e.target.value)} placeholder="tusitio.com" />
        <Boton type="submit" variante="primario" cargando={revisar.isPending}>
          Revisar
        </Boton>
      </form>
      <ErrorCaja error={revisar.error} />
      {r ? (
        <div className="grid min-h-0 gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center gap-1 rounded-2xl px-6 py-4" style={{ background: suave(color, 12) }}>
            <b className="text-4xl font-bold tabular-nums" style={{ color: `var(${color})` }}>
              {r.calificacion}
            </b>
            <small className="text-xs text-tenue">de 100</small>
            <small className="max-w-[10rem] truncate text-xs text-tenue">{r.sitio}</small>
          </div>
          <ul className="divide-y divide-borde">
            {r.revisiones.map((x) => {
              const Icono = ICONO[x.estado];
              return (
                <li key={x.id} className="flex items-start gap-2 py-2">
                  <Icono className={cx("mt-0.5 h-4 w-4 shrink-0", COLOR[x.estado])} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{x.titulo}</p>
                    <p className="break-words text-xs text-tenue">{x.detalle}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-tenue">Revisa solo sitios tuyos o públicos.</p>
      )}
    </Cuadro>
  );
}

function ContrasenaFiltrada({ className }: { className?: string }) {
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [resultado, setResultado] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const revisar = async () => {
    setCargando(true);
    setResultado(null);
    try {
      setResultado(await vecesFiltrada(clave, async (p) => (await api<{ lista: string }>(`/api/ciberseguridad/contrasena/${p}`)).lista));
    } catch (err) {
      avisarError(err);
    } finally {
      setCargando(false);
    }
  };
  const filtrada = resultado !== null && resultado > 0;
  return (
    <Cuadro icono={KeyRound} titulo="¿Mi contraseña se filtró?" texto="Tu contraseña no sale de tu equipo." className={className}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (clave) void revisar();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Entrada type={ver ? "text" : "password"} autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Escribe una contraseña" className="pr-10" />
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-tenue" aria-label={ver ? "Ocultar" : "Mostrar"} onClick={() => setVer((v) => !v)}>
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Boton type="submit" variante="primario" cargando={cargando}>
          Revisar
        </Boton>
      </form>
      {resultado !== null ? (
        <p className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: suave(filtrada ? "--error" : "--ok", 12), color: `var(${filtrada ? "--error" : "--ok"})` }}>
          {filtrada ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          {filtrada
            ? `Apareció ${resultado.toLocaleString(localeActual())} veces en filtraciones. No la uses: cámbiala donde la tengas.`
            : "No aparece en filtraciones conocidas. Aun así, usa una distinta en cada sitio."}
        </p>
      ) : null}
      <p className="text-xs text-tenue">Solo se envían los primeros 5 caracteres de su huella (SHA-1) a Have I Been Pwned.</p>
    </Cuadro>
  );
}

const LECCIONES: { titulo: string; texto: string }[] = [
  {
    titulo: "Contraseñas y gestor",
    texto:
      "Una contraseña distinta en cada sitio, larga (4 palabras al azar funcionan). Guárdalas en la Bóveda o en Bitwarden y activa verificación en dos pasos en tu correo primero: quien controla tu correo controla todo lo demás.",
  },
  {
    titulo: "Phishing (engaños)",
    texto:
      "Desconfía de mensajes urgentes ('tu cuenta será suspendida'). Revisa el dominio real del enlace antes de escribir datos. Discord, Steam y bancos nunca te piden tu contraseña por mensaje.",
  },
  {
    titulo: "Tu servidor",
    texto:
      "Firewall encendido, solo los puertos que uses, fail2ban y actualizaciones automáticas. Mejor aún: entra con llave SSH y apaga las contraseñas. Revísalo en VPS → Seguridad del servidor.",
  },
  {
    titulo: "Respaldos 3-2-1",
    texto:
      "3 copias, en 2 lugares distintos, 1 fuera de casa. Un respaldo que nunca probaste restaurar no cuenta. Si te secuestran los archivos (ransomware), el respaldo es lo que te salva.",
  },
  {
    titulo: "Wi-Fi y casa",
    texto: "Cambia la contraseña de fábrica de tu módem, usa WPA2/WPA3, y pon las cámaras y bocinas en una red de invitados para que no vean tu PC.",
  },
  {
    titulo: "Para aprender hacking ético",
    texto:
      "Practica solo en laboratorios legales: TryHackMe, Hack The Box, OverTheWire (Bandit) y PortSwigger Academy. Atacar sistemas ajenos sin permiso es delito. Apunta lo que aprendes en tu cuaderno.",
  },
];

const CLAVE_LEIDAS = "mi-setup.ciber.leidas";

function leidasGuardadas(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LEIDAS) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

function Lecciones({ className }: { className?: string }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [leidas, setLeidas] = useState<number[]>(leidasGuardadas);
  const abrir = (i: number) => {
    setAbierta(i);
    if (leidas.includes(i)) return;
    const nuevas = [...leidas, i];
    setLeidas(nuevas);
    try {
      localStorage.setItem(CLAVE_LEIDAS, JSON.stringify(nuevas));
    } catch {
      return;
    }
  };
  const actual = abierta === null ? null : LECCIONES[abierta];
  return (
    <Cuadro icono={BookOpen} titulo="Lecciones rápidas" texto={`${LECCIONES.length} lecciones cortas · ${leidas.length} leídas`} color="--aviso" className={className}>
      <div className="flex flex-wrap gap-2">
        {LECCIONES.map((l, i) => (
          <button
            key={l.titulo}
            type="button"
            onClick={() => abrir(i)}
            className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs", leidas.includes(i) ? "border-transparent text-ok" : "border-borde text-tenue hover:text-texto")}
            style={leidas.includes(i) ? { background: suave("--ok", 12) } : undefined}
          >
            {leidas.includes(i) ? <Check className="h-3.5 w-3.5" /> : null}
            {l.titulo}
          </button>
        ))}
      </div>
      <Modal abierto={actual !== null} titulo={actual?.titulo ?? ""} alCerrar={() => setAbierta(null)}>
        <p className="text-sm leading-relaxed text-tenue">{actual?.texto}</p>
      </Modal>
    </Cuadro>
  );
}

function CorreosCuadro({ alVer, className }: { alVer: () => void; className?: string }) {
  const cuentas = useQuery({
    queryKey: ["correo-google", "cuentas"],
    queryFn: () => api<{ configurado: boolean; limite?: number; cuentas: { id: string; email: string }[] }>("/api/google/correo/cuentas"),
  });
  const lista = cuentas.data?.cuentas ?? [];
  const limite = cuentas.data?.limite ?? 10;
  return (
    <Cuadro icono={Mail} titulo="Correos de Google" texto={`${lista.length} de ${limite} cuentas · revisa correos peligrosos`} color="--error" className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {lista.slice(0, 6).map((c) => (
          <span key={c.id} title={c.email} className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold" style={{ background: suave("--acento", 18) }}>
            {c.email[0]?.toUpperCase()}
          </span>
        ))}
        {lista.length < limite ? (
          <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-borde text-tenue">
            <Plus className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <Boton tamano="sm" className="mt-auto self-start" onClick={alVer}>
        Ver correos
        <ArrowRight className="h-3.5 w-3.5" />
      </Boton>
    </Cuadro>
  );
}

export default function Ciberseguridad() {
  const navegar = useNavigate();
  const puedeVps = usePuede("vps_seguridad", "lectura");
  const [pestana, setPestana] = useState<"general" | "correos">("general");
  return (
    <div className="space-y-4">
      <Encabezado titulo="Ciberseguridad" descripcion="Elige una herramienta y revisa en un momento." />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "general", texto: "Herramientas" },
          { id: "correos", texto: "Correos de Google" },
        ]}
      />
      {pestana === "correos" ? <CorreosGoogle /> : null}
      {pestana === "general" ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <RevisarSitio className="md:col-span-2 xl:row-span-2" />
            <ContrasenaFiltrada />
            <Cuadro icono={ShieldCheck} titulo="Mis contraseñas" texto="Busca las filtradas, repetidas o débiles en tu gestor y te ayuda a cambiarlas." color="--ok">
              <Boton tamano="sm" className="mt-auto self-start" variante="primario" onClick={() => navegar("/seguridad/boveda?pestana=revisar")}>
                Revisar ahora
                <ArrowRight className="h-3.5 w-3.5" />
              </Boton>
            </Cuadro>
            <CorreosCuadro alVer={() => setPestana("correos")} />
            <Lecciones className="md:col-span-2 xl:col-span-1" />
            <Cuadro icono={FlaskConical} titulo="Cuaderno de laboratorio" texto="Apunta tus prácticas (comandos, banderas de CTF, lo que aprendiste) en una página de tus notas." color="--texto-2">
              <Boton tamano="sm" className="mt-auto self-start" icono={NotebookPen} onClick={() => navegar("/notas")}>
                Abrir mis notas
              </Boton>
            </Cuadro>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/equipos" className="inline-flex max-w-full items-center gap-2 rounded-full border border-borde px-3 py-1.5 text-xs text-tenue hover:text-texto">
              <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">
                Dónde tienes la sesión abierta → <b className="text-texto">ahora está en Equipos</b>
              </span>
            </Link>
            {puedeVps ? (
              <Link to="/vps/seguridad" className="inline-flex max-w-full items-center gap-2 rounded-full border border-borde px-3 py-1.5 text-xs text-tenue hover:text-texto">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">
                  Entradas recientes y alertas → <b className="text-texto">ahora está en VPS → Seguridad del servidor</b>
                </span>
              </Link>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
