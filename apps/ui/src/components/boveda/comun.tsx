import { Copy, RefreshCw, Wand2 } from "lucide-react";
import { useState } from "react";
import { MedidorFortaleza } from "../Desbloqueo";
import { Boton, Campo, Entrada, Interruptor, avisarError } from "../ui";
import { api } from "../../lib/api";
import { cifrar, contextoDe } from "../../lib/boveda/cripto";
import { leerColeccion, recargarElementos, useBoveda } from "../../lib/boveda/estado";
import { generarContrasena, OPCIONES_POR_DEFECTO, SIMBOLOS_POR_DEFECTO, type OpcionesGenerador } from "../../lib/boveda/generador";
import { copiarSeguro } from "../../lib/boveda/utilidades";
import { pedirReauth } from "../../lib/reauth";

export const MAX_HISTORIAL = 10;

export interface Generada {
  contrasena: string;
  fecha: string;
  para?: string;
}

const VENTANA_CONFIRMACION = 5 * 60_000;
let confirmadoEn = 0;

export async function confirmarIdentidad(): Promise<void> {
  if (Date.now() - confirmadoEn < VENTANA_CONFIRMACION) return;
  await pedirReauth("fuerte");
  confirmadoEn = Date.now();
}

export async function copiarConfirmando(texto: string, etiqueta: string): Promise<void> {
  await confirmarIdentidad();
  await copiarSeguro(texto, etiqueta);
}

const COLORES = ["#7c5cff", "#2e9e6b", "#e95420", "#3a7bd5", "#e0457b", "#f59e0b", "#0ea5e9", "#14b8a6", "#a855f7", "#ef4444"];

export function colorDe(texto: string): string {
  return COLORES[[...texto].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORES.length]!;
}

export function Iniciales({ texto, tam = 36 }: { texto: string; tam?: number }) {
  const limpio = texto.trim() || "?";
  const partes = limpio.split(/[\s._@-]+/).filter(Boolean);
  const letras = (partes.length > 1 ? `${partes[0]![0]}${partes[1]![0]}` : limpio.slice(0, 2)).toUpperCase();
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl font-semibold text-white"
      style={{ width: tam, height: tam, fontSize: Math.round(tam * 0.36), background: colorDe(limpio) }}
      aria-hidden
    >
      {letras}
    </span>
  );
}

export async function guardarGenerada(clave: Uint8Array, contrasena: string, para?: string): Promise<void> {
  const valor: Generada = { contrasena, fecha: new Date().toISOString(), ...(para ? { para } : {}) };
  await api("/api/boveda/items", { cuerpo: { tipo: "generada", datos: await cifrar(clave, valor, contextoDe("generada")) } });
  const todas = (await leerColeccion<Generada>("boveda", clave)).filter((e) => e.tipo === "generada").sort((a, b) => b.valor.fecha.localeCompare(a.valor.fecha));
  for (const vieja of todas.slice(MAX_HISTORIAL)) await api(`/api/boveda/items/${vieja.id}`, { metodo: "DELETE" }).catch(() => undefined);
  await recargarElementos();
}

export function Generador({ alUsar, botonUsar = "Usar esta contraseña", compacto = false }: { alUsar?: (c: string) => void; botonUsar?: string; compacto?: boolean }) {
  const clave = useBoveda((s) => s.clave);
  const [o, setO] = useState<OpcionesGenerador>(OPCIONES_POR_DEFECTO);
  const [valor, setValor] = useState(() => generarContrasena(OPCIONES_POR_DEFECTO));
  const [para, setPara] = useState("");
  const regenerar = (n: OpcionesGenerador) => {
    setO(n);
    try {
      setValor(generarContrasena(n));
    } catch (err) {
      avisarError(err);
    }
  };
  const recordar = () => {
    if (clave) void guardarGenerada(clave, valor, para.trim() || undefined).catch(() => undefined);
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Entrada value={valor} readOnly className="font-mono" aria-label="Contraseña generada" />
        <Boton tamano="icono" icono={RefreshCw} onClick={() => regenerar(o)} aria-label="Generar otra" />
        <Boton
          tamano="icono"
          icono={Copy}
          aria-label="Copiar"
          onClick={() => {
            void copiarSeguro(valor, "Contraseña copiada").catch(avisarError);
            recordar();
          }}
        />
      </div>
      <MedidorFortaleza clave={valor} />
      <Campo etiqueta={`Longitud: ${o.longitud} caracteres`}>
        <input type="range" min={8} max={128} value={o.longitud} onChange={(e) => regenerar({ ...o, longitud: Number(e.target.value) })} className="w-full" />
      </Campo>
      <div className={compacto ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-2"}>
        {([
          ["mayusculas", "Mayúsculas (A-Z)"],
          ["minusculas", "Minúsculas (a-z)"],
          ["numeros", "Números (0-9)"],
          ["simbolos", "Símbolos"],
          ["sinAmbiguos", "Sin ambiguos (l, 1, O, 0)"],
        ] as const).map(([k, t]) => (
          <Interruptor key={k} activo={o[k]} alCambiar={(v) => regenerar({ ...o, [k]: v })} etiqueta={t} />
        ))}
      </div>
      {o.simbolos && !compacto ? (
        <Campo etiqueta="Símbolos permitidos" ayuda="Quita los que el sitio no acepte.">
          <div className="flex gap-2">
            <Entrada value={o.simbolosTexto} onChange={(e) => regenerar({ ...o, simbolosTexto: e.target.value })} className="font-mono" />
            <Boton tamano="sm" variante="fantasma" onClick={() => regenerar({ ...o, simbolosTexto: SIMBOLOS_POR_DEFECTO })}>
              Todos
            </Boton>
          </div>
        </Campo>
      ) : null}
      {compacto ? null : (
        <Campo etiqueta="¿Para qué es? (opcional, se guarda en el historial)">
          <Entrada value={para} onChange={(e) => setPara(e.target.value)} placeholder="Ej. cuenta de Steam" />
        </Campo>
      )}
      {clave ? (
        <p className="text-xs text-tenue">Cada contraseña que copies o uses se guarda cifrada en el historial (las últimas {MAX_HISTORIAL}).</p>
      ) : (
        <p className="text-xs text-aviso">La bóveda está bloqueada: esta contraseña no se guardará en el historial. Ábrela en "Mis contraseñas" para guardarlas.</p>
      )}
      {alUsar ? (
        <Boton
          variante="primario"
          className="w-full"
          icono={Wand2}
          onClick={() => {
            recordar();
            alUsar(valor);
          }}
        >
          {botonUsar}
        </Boton>
      ) : null}
    </div>
  );
}
