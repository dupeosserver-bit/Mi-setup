/**
 * Ciberseguridad: revisar tu sitio, saber si una contraseña se filtró (sin
 * enviarla), lecciones cortas y un cuaderno de laboratorio en tus notas.
 */
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, CheckCircle2, Eye, EyeOff, FlaskConical, Globe, KeyRound, MoveRight, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CorreosGoogle, SeMudo } from "../components/CiberExtra";
import { Boton, Encabezado, Entrada, ErrorCaja, Pestanas, Tarjeta, avisarError, cx } from "../components/ui";
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

function RevisarSitio() {
  const [sitio, setSitio] = useState("");
  const revisar = useMutation({
    mutationFn: () => api<{ sitio: string; calificacion: number; revisiones: Revision[] }>("/api/ciberseguridad/sitio", { cuerpo: { sitio } }),
    onError: avisarError,
  });
  const r = revisar.data;
  return (
    <Tarjeta titulo="Revisar un sitio" icono={Globe}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (sitio.trim()) revisar.mutate();
        }}
      >
        <Entrada value={sitio} onChange={(e) => setSitio(e.target.value)} placeholder="mexicanland.net" />
        <Boton type="submit" variante="primario" cargando={revisar.isPending}>
          Revisar
        </Boton>
      </form>
      <p className="mt-2 text-xs text-tenue">Certificado HTTPS, cabeceras de seguridad y protección del correo (SPF/DMARC). Revisa solo sitios tuyos o públicos.</p>
      <ErrorCaja error={revisar.error} />
      {r ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            <span className={cx("text-xl font-bold", r.calificacion >= 80 ? "text-ok" : r.calificacion >= 50 ? "text-aviso" : "text-peligro")}>{r.calificacion}</span>
            <span className="text-tenue"> / 100 · {r.sitio}</span>
          </p>
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
      ) : null}
    </Tarjeta>
  );
}

function ContrasenaFiltrada() {
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
  return (
    <Tarjeta titulo="¿Mi contraseña se filtró?" icono={KeyRound}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (clave) void revisar();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Entrada
            type={ver ? "text" : "password"}
            autoComplete="off"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Escribe una contraseña"
            className="pr-10"
          />
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-tenue" aria-label={ver ? "Ocultar" : "Mostrar"} onClick={() => setVer((v) => !v)}>
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Boton type="submit" variante="primario" cargando={cargando}>
          Revisar
        </Boton>
      </form>
      {resultado !== null ? (
        resultado > 0 ? (
          <p className="mt-3 rounded-xl bg-peligro/10 p-3 text-sm text-peligro">
            Apareció {resultado.toLocaleString(localeActual())} veces en filtraciones. No la uses: cámbiala donde la tengas.
          </p>
        ) : (
          <p className="mt-3 rounded-xl bg-ok/10 p-3 text-sm text-ok">No aparece en filtraciones conocidas. Aun así, usa una distinta en cada sitio.</p>
        )
      ) : null}
      <p className="mt-2 text-xs text-tenue">Tu contraseña no sale de tu equipo: solo se envían los primeros 5 caracteres de su huella (SHA-1) a Have I Been Pwned.</p>
    </Tarjeta>
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

export default function Ciberseguridad() {
  const navegar = useNavigate();
  const puedeVps = usePuede("vps_seguridad", "lectura");
  const [abierta, setAbierta] = useState<number | null>(0);
  const [pestana, setPestana] = useState<"general" | "correos">("general");
  return (
    <div className="space-y-4">
      <Encabezado titulo="Ciberseguridad" descripcion="Tus correos, tus contraseñas y tus sitios: revisa y protégete." />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "general", texto: "Sitios y contraseñas" },
          { id: "correos", texto: "Correos de Google" },
        ]}
      />
      {pestana === "correos" ? <CorreosGoogle /> : null}
      {pestana === "general" ? (
        <>
          <Tarjeta titulo="Revisar todas mis contraseñas" icono={KeyRound}>
            <p className="text-sm text-tenue">
              Busca en tu gestor las contraseñas filtradas, repetidas o débiles, y los sitios que tuvieron filtraciones con tu correo. Te ayuda a cambiarlas con una nueva y segura.
            </p>
            <Boton className="mt-3" variante="primario" icono={KeyRound} onClick={() => navegar("/seguridad/boveda?pestana=revisar")}>
              Revisar mis contraseñas
            </Boton>
          </Tarjeta>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RevisarSitio />
            <ContrasenaFiltrada />
          </div>
          <Tarjeta titulo="Lecciones rápidas" icono={BookOpen}>
            <ul className="divide-y divide-borde">
              {LECCIONES.map((l, i) => (
                <li key={l.titulo}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between py-3 text-left text-sm font-medium"
                    onClick={() => setAbierta(abierta === i ? null : i)}
                  >
                    {l.titulo}
                    <span className="text-tenue">{abierta === i ? "−" : "+"}</span>
                  </button>
                  {abierta === i ? <p className="pb-3 text-sm text-tenue">{l.texto}</p> : null}
                </li>
              ))}
            </ul>
          </Tarjeta>
          <Tarjeta titulo="Se cambió de lugar" icono={MoveRight}>
            <div className="grid gap-2 sm:grid-cols-2">
              <SeMudo texto="Dónde tienes la sesión abierta · ahora está en Equipos" ruta="/equipos" />
              {puedeVps ? <SeMudo texto="Entradas recientes y alertas · ahora está en VPS → Seguridad del servidor" ruta="/vps/seguridad" /> : null}
            </div>
          </Tarjeta>
          <Tarjeta titulo="Cuaderno de laboratorio" icono={FlaskConical}>
            <p className="text-sm text-tenue">Apunta tus prácticas (comandos, banderas de CTF, lo que aprendiste) en una página de tus notas, con casillas y tablero de tareas.</p>
            <Boton className="mt-3" icono={FlaskConical} onClick={() => navegar("/notas")}>
              Abrir mis notas
            </Boton>
          </Tarjeta>
        </>
      ) : null}
    </div>
  );
}
