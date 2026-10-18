/**
 * Caja para escribirle a la IA: texto, adjuntar fotos/PDF/archivos de texto,
 * dictar con el micrófono y elegir el modelo. La usan el botón flotante y la
 * página IA.
 */
import { MODELOS_IA, type ModeloIa } from "@mi-setup/shared";
import { FileText, ImageIcon, Mic, Paperclip, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useGuardarPreferencias, usePreferencias } from "../lib/preferencias";
import { escuchar } from "../lib/voz";
import { AreaTexto, Boton, avisar, avisarError, cx } from "./ui";

export interface AdjuntoIa {
  nombre: string;
  tipo: string;
  datos: string;
  /** Vista previa (solo imágenes). */
  vista?: string;
}

const MAX_ARCHIVO = 5 * 1024 * 1024;
const MAX_ADJUNTOS = 5;
const ACEPTA = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.txt,.md,.csv,.json,.log,.yml,.yaml,.xml,.js,.ts,.sh,.py,.sql,.env.example";

/** Tipo MIME: el navegador a veces lo deja vacío en archivos de texto. */
function tipoDe(f: File): string {
  if (f.type) return f.type;
  return /\.(json)$/i.test(f.name) ? "application/json" : "text/plain";
}

function leerBase64(f: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const r = new FileReader();
    r.onload = () => resolver(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rechazar(new Error(`No se pudo leer ${f.name}`));
    r.readAsDataURL(f);
  });
}

export function EntradaIa({
  cargando,
  deshabilitada,
  alEnviar,
  compacta = false,
  textoInicial,
}: {
  cargando: boolean;
  deshabilitada?: boolean;
  alEnviar: (mensaje: string, adjuntos: AdjuntoIa[]) => void;
  compacta?: boolean;
  /** Texto ya escrito (p. ej. al tocar un aviso de alerta); no se envía solo. */
  textoInicial?: string | null;
}) {
  const [texto, setTexto] = useState(textoInicial ?? "");
  useEffect(() => {
    if (textoInicial) setTexto(textoInicial);
  }, [textoInicial]);
  const [adjuntos, setAdjuntos] = useState<AdjuntoIa[]>([]);
  const [escuchando, setEscuchando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const prefs = usePreferencias();
  const guardar = useGuardarPreferencias();

  const agregar = async (lista: FileList | null) => {
    if (!lista) return;
    for (const f of Array.from(lista)) {
      if (adjuntos.length >= MAX_ADJUNTOS) return avisar(`Máximo ${MAX_ADJUNTOS} archivos por mensaje`, "error");
      if (f.size > MAX_ARCHIVO) {
        avisar(`${f.name} pesa más de 5 MB`, "error");
        continue;
      }
      try {
        const tipo = tipoDe(f);
        const datos = await leerBase64(f);
        setAdjuntos((a) => [...a, { nombre: f.name, tipo, datos, ...(tipo.startsWith("image/") ? { vista: `data:${tipo};base64,${datos}` } : {}) }].slice(0, MAX_ADJUNTOS));
      } catch (err) {
        avisarError(err);
      }
    }
  };

  const dictar = async () => {
    setEscuchando(true);
    try {
      const dicho = await escuchar();
      if (dicho) setTexto((t) => (t ? `${t} ${dicho}` : dicho));
      else avisar("No se entendió nada; intenta de nuevo", "info");
    } catch (err) {
      avisarError(err);
    } finally {
      setEscuchando(false);
    }
  };

  const mandar = () => {
    const m = texto.trim() || (adjuntos.length ? "Revisa los archivos adjuntos." : "");
    if (!m || cargando || deshabilitada) return;
    alEnviar(m, adjuntos);
    setTexto("");
    setAdjuntos([]);
  };

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void agregar(e.dataTransfer.files);
      }}
    >
      {adjuntos.length ? (
        <div className="flex flex-wrap gap-2">
          {adjuntos.map((a, i) => (
            <div key={`${a.nombre}-${i}`} className="flex items-center gap-2 rounded-xl border border-borde bg-tarjeta py-1 pl-1 pr-2 text-xs">
              {a.vista ? (
                <img src={a.vista} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fondo">
                  {a.tipo.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
              )}
              <span className="max-w-32 truncate">{a.nombre}</span>
              <button type="button" onClick={() => setAdjuntos((x) => x.filter((_, j) => j !== i))} aria-label={`Quitar ${a.nombre}`} className="text-tenue hover:text-texto">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <AreaTexto
          rows={compacta ? 2 : 2}
          value={texto}
          placeholder={escuchando ? "Escuchando…" : "Escribe, dicta o adjunta fotos y archivos…"}
          onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void agregar(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              mandar();
            }
          }}
          disabled={deshabilitada}
        />
        <div className="flex flex-col gap-1">
          <Boton variante="primario" tamano="icono" icono={Send} aria-label="Enviar" cargando={cargando} disabled={deshabilitada} onClick={mandar} />
          <div className="flex gap-1">
            <Boton tamano="icono" variante="fantasma" icono={Paperclip} aria-label="Adjuntar fotos o archivos" disabled={deshabilitada} onClick={() => archivo.current?.click()} />
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={Mic}
              aria-label="Dictar"
              className={cx(escuchando && "animate-pulse text-peligro")}
              disabled={deshabilitada || escuchando}
              onClick={() => void dictar()}
            />
          </div>
        </div>
      </div>
      <input
        ref={archivo}
        type="file"
        multiple
        accept={ACEPTA}
        className="hidden"
        onChange={(e) => {
          void agregar(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex items-center justify-between gap-2 text-[11px] text-tenue">
        <select
          value={prefs.ia.modelo ?? ""}
          onChange={(e) => guardar((p) => ({ ...p, ia: { modelo: (e.target.value || null) as ModeloIa | null } }))}
          className="rounded-lg border border-borde bg-superficie px-2 py-1 text-[11px] text-texto"
          aria-label="Modelo de IA"
        >
          <option value="">Modelo del servidor</option>
          {(Object.keys(MODELOS_IA) as ModeloIa[]).map((m) => (
            <option key={m} value={m}>
              {MODELOS_IA[m].nombre}
            </option>
          ))}
        </select>
        <span>Fotos, PDF y texto · máx. 5 MB c/u</span>
      </div>
    </div>
  );
}
