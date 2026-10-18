/**
 * Convertidor: imágenes (en tu equipo), audio y video (en tu VPS con ffmpeg)
 * y datos CSV / JSON / Excel (en tu equipo).
 */
import { Download, FileAudio, Image as ImageIcon, Repeat, Table } from "lucide-react";
import { useRef, useState } from "react";
import { AreaTexto, Boton, Campo, Encabezado, Entrada, Pestanas, Selector, Tarjeta, avisar, avisarError } from "../components/ui";
import { API_BASE, refrescar } from "../lib/api";
import { fmtBytes } from "../lib/formato";
import { useSesion } from "../lib/sesion";

function bajarBlob(b: Blob, nombre: string) {
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const sinExtension = (n: string) => n.replace(/\.[^.]+$/, "") || "archivo";

// ---------------------------------------------------------------- imágenes

function Imagenes() {
  const ref = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [formato, setFormato] = useState<"image/jpeg" | "image/png" | "image/webp">("image/webp");
  const [anchoMax, setAnchoMax] = useState("1920");
  const [calidad, setCalidad] = useState("80");
  const [trabajando, setTrabajando] = useState(false);
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[formato];

  const convertir = async () => {
    setTrabajando(true);
    try {
      let antes = 0;
      let despues = 0;
      for (const f of archivos) {
        const bitmap = await createImageBitmap(f).catch(() => {
          throw new Error(`No pude abrir ${f.name}. Las fotos HEIC de iPhone: ábrelas y compártelas como JPG primero.`);
        });
        const max = Number(anchoMax) || bitmap.width;
        const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bitmap.width * escala);
        c.height = Math.round(bitmap.height * escala);
        const ctx = c.getContext("2d")!;
        if (formato === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.drawImage(bitmap, 0, 0, c.width, c.height);
        const b = await new Promise<Blob>((r, x) => c.toBlob((bl) => (bl ? r(bl) : x(new Error("No se pudo convertir"))), formato, Number(calidad) / 100));
        antes += f.size;
        despues += b.size;
        bajarBlob(b, `${sinExtension(f.name)}.${ext}`);
      }
      avisar(`Listo: de ${fmtBytes(antes)} a ${fmtBytes(despues)}`);
    } catch (err) {
      avisarError(err);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Tarjeta titulo="Imágenes" icono={ImageIcon}>
      <div className="space-y-3">
        <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
          setArchivos(Array.from(e.target.files ?? []));
          e.target.value = "";
        }} />
        <Boton icono={ImageIcon} onClick={() => ref.current?.click()}>
          {archivos.length ? `${archivos.length} imagen(es) elegidas` : "Elegir imágenes"}
        </Boton>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Campo etiqueta="Convertir a">
            <Selector value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)}>
              <option value="image/webp">WebP (la más ligera)</option>
              <option value="image/jpeg">JPG</option>
              <option value="image/png">PNG (sin pérdida)</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Tamaño máximo (px)">
            <Entrada type="number" min={100} value={anchoMax} onChange={(e) => setAnchoMax(e.target.value)} />
          </Campo>
          <Campo etiqueta={`Calidad: ${calidad}%`}>
            <input type="range" min={30} max={100} value={calidad} onChange={(e) => setCalidad(e.target.value)} className="w-full" />
          </Campo>
        </div>
        <Boton variante="primario" icono={Download} disabled={!archivos.length} cargando={trabajando} onClick={() => void convertir()}>
          Convertir y descargar
        </Boton>
      </div>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------- audio y video

const FORMATOS_MEDIA = [
  { id: "mp3", texto: "MP3 (sacar el audio)" },
  { id: "m4a", texto: "M4A (audio de buena calidad)" },
  { id: "wav", texto: "WAV (audio sin compresión)" },
  { id: "mp4", texto: "MP4 comprimido (para WhatsApp)" },
  { id: "webm", texto: "WebM (video para web)" },
  { id: "gif", texto: "GIF animado (máx. 20 s)" },
] as const;

function Media() {
  const ref = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [formato, setFormato] = useState<(typeof FORMATOS_MEDIA)[number]["id"]>("mp3");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<string | null>(null);

  const convertir = async () => {
    if (!archivo) return;
    const q = new URLSearchParams({ formato });
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    const enviar = (reintento: boolean): Promise<Blob> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/api/convertidor/media?${q}`);
        xhr.responseType = "blob";
        const token = useSesion.getState().accessToken;
        if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (e) => e.lengthComputable && setEstado(`Subiendo… ${Math.round((e.loaded / e.total) * 100)}%`);
        xhr.upload.onload = () => setEstado("Convirtiendo en tu VPS… (puede tardar)");
        xhr.onload = async () => {
          if (xhr.status === 401 && !reintento) {
            if (await refrescar()) return enviar(true).then(resolve, reject);
            return reject(new Error("Tu sesión venció"));
          }
          if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response as Blob);
          const texto = await (xhr.response as Blob).text().catch(() => "");
          let msg = `No se pudo convertir (error ${xhr.status})`;
          try {
            msg = (JSON.parse(texto) as { error?: string }).error ?? msg;
          } catch {
            /* sin JSON */
          }
          reject(new Error(msg));
        };
        xhr.onerror = () => reject(new Error("Se cortó la conexión"));
        const fd = new FormData();
        fd.append("archivo", archivo);
        xhr.send(fd);
      });
    try {
      setEstado("Subiendo… 0%");
      const b = await enviar(false);
      const ext = formato;
      bajarBlob(b, `${sinExtension(archivo.name)}.${ext}`);
      avisar(`Listo (${fmtBytes(b.size)})`);
    } catch (err) {
      avisarError(err);
    } finally {
      setEstado(null);
    }
  };

  return (
    <Tarjeta titulo="Audio y video" icono={FileAudio}>
      <div className="space-y-3">
        <p className="text-sm text-tenue">Se convierte en tu VPS (hasta 500 MB). Ej.: sacarle el MP3 a un video o comprimir un video para mandarlo por WhatsApp.</p>
        <input ref={ref} type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => {
          setArchivo(e.target.files?.[0] ?? null);
          e.target.value = "";
        }} />
        <Boton icono={FileAudio} onClick={() => ref.current?.click()}>
          {archivo ? `${archivo.name} (${fmtBytes(archivo.size)})` : "Elegir audio o video"}
        </Boton>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Campo etiqueta="Convertir a">
            <Selector value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)}>
              {FORMATOS_MEDIA.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.texto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Recortar desde (segundos)">
            <Entrada type="number" min={0} value={desde} onChange={(e) => setDesde(e.target.value)} placeholder="Desde el inicio" />
          </Campo>
          <Campo etiqueta="Hasta (segundos)">
            <Entrada type="number" min={0} value={hasta} onChange={(e) => setHasta(e.target.value)} placeholder="Hasta el final" />
          </Campo>
        </div>
        <Boton variante="primario" icono={Repeat} disabled={!archivo || estado !== null} onClick={() => void convertir()}>
          {estado ?? "Convertir y descargar"}
        </Boton>
      </div>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------- datos

function Datos() {
  const ref = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState<"xlsx" | "csv" | "json">("xlsx");

  const leerTabla = async (): Promise<Record<string, unknown>[]> => {
    const XLSX = await import("xlsx");
    const t = texto.trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      const datos = JSON.parse(t) as unknown;
      return Array.isArray(datos) ? (datos as Record<string, unknown>[]) : [datos as Record<string, unknown>];
    }
    const libro = XLSX.read(t, { type: "string" });
    return XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]!]!, { defval: "" });
  };

  const abrirArchivo = async (f: File | undefined) => {
    if (!f) return;
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const XLSX = await import("xlsx");
        const libro = XLSX.read(await f.arrayBuffer());
        setTexto(XLSX.utils.sheet_to_csv(libro.Sheets[libro.SheetNames[0]!]!));
      } else setTexto(await f.text());
    } catch (err) {
      avisarError(err);
    }
  };

  const convertir = async () => {
    try {
      const filas = await leerTabla();
      if (!filas.length) return avisar("No hay datos", "error");
      const XLSX = await import("xlsx");
      if (destino === "json") bajarBlob(new Blob([JSON.stringify(filas, null, 2)], { type: "application/json" }), "datos.json");
      else if (destino === "csv") bajarBlob(new Blob([XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(filas))], { type: "text/csv" }), "datos.csv");
      else {
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Datos");
        XLSX.writeFile(libro, "datos.xlsx");
      }
      avisar(`${filas.length} filas convertidas`);
    } catch (err) {
      avisar(err instanceof Error ? `No pude leer los datos: ${err.message}` : "No pude leer los datos", "error");
    }
  };

  return (
    <Tarjeta titulo="Datos: CSV, JSON y Excel" icono={Table}>
      <div className="space-y-3">
        <input ref={ref} type="file" accept=".csv,.json,.xlsx,.xls,.txt" className="hidden" onChange={(e) => {
          void abrirArchivo(e.target.files?.[0]);
          e.target.value = "";
        }} />
        <Boton icono={Table} onClick={() => ref.current?.click()}>
          Abrir archivo
        </Boton>
        <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} placeholder="…o pega aquí un CSV o un JSON" className="font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <Selector className="max-w-[12rem]" value={destino} onChange={(e) => setDestino(e.target.value as typeof destino)}>
            <option value="xlsx">A Excel (.xlsx)</option>
            <option value="csv">A CSV</option>
            <option value="json">A JSON</option>
          </Selector>
          <Boton variante="primario" icono={Download} disabled={!texto.trim()} onClick={() => void convertir()}>
            Convertir
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}

export default function Convertidor() {
  const [pestana, setPestana] = useState<"imagenes" | "media" | "datos">("imagenes");
  return (
    <div className="space-y-4">
      <Encabezado titulo="Convertidor" descripcion="Cambia el formato o el peso de imágenes, audio, video y datos." />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "imagenes", texto: "Imágenes" },
          { id: "media", texto: "Audio y video" },
          { id: "datos", texto: "Datos" },
        ]}
      />
      {pestana === "imagenes" ? <Imagenes /> : pestana === "media" ? <Media /> : <Datos />}
    </div>
  );
}
