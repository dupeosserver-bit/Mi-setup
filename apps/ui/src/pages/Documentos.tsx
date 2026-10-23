/**
 * Documentos y PDF, todo en tu equipo (nada se sube): unir PDFs, sacar o borrar
 * páginas, girar, fotos a PDF (también con la cámara) y firmar (con el dedo, escrita o
 * con imagen) en el lugar que elijas de un PDF o una foto.
 */
import { Camera, Combine, Download, FileText, PenLine, RotateCw, Scissors, Trash2 } from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import { useEffect, useRef, useState } from "react";
import { ElegirFirma, FirmarDocumento } from "../components/FirmarDocumento";
import { guardarBlob } from "../lib/guardar";
import { Boton, Campo, Encabezado, Entrada, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";

function bajar(bytes: Uint8Array, nombre: string) {
  void guardarBlob(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), nombre).catch(avisarError);
}

/** "1-3, 5, 8-9" → [0,1,2,4,7,8] (índices desde 0, sin repetir, dentro del total). */
export function leerPaginas(texto: string, total: number): number[] {
  const salida = new Set<number>();
  for (const parte of texto.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(parte);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y) as [number, number];
      for (let i = a; i <= b; i++) if (i >= 1 && i <= total) salida.add(i - 1);
    } else if (/^\d+$/.test(parte)) {
      const n = Number(parte);
      if (n >= 1 && n <= total) salida.add(n - 1);
    }
  }
  return [...salida].sort((a, b) => a - b);
}

async function abrir(f: File) {
  return PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
}

function ElegirArchivos({ multiple = false, accept = "application/pdf", alElegir, texto }: { multiple?: boolean; accept?: string; alElegir: (f: File[]) => void; texto: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => {
        alElegir(Array.from(e.target.files ?? []));
        e.target.value = "";
      }} />
      <Boton icono={FileText} onClick={() => ref.current?.click()}>
        {texto}
      </Boton>
    </>
  );
}

function Unir() {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const unir = async () => {
    setTrabajando(true);
    try {
      const final = await PDFDocument.create();
      for (const f of archivos) {
        const doc = await abrir(f);
        for (const p of await final.copyPages(doc, doc.getPageIndices())) final.addPage(p);
      }
      bajar(await final.save(), "unido.pdf");
    } catch (err) {
      avisarError(err);
    } finally {
      setTrabajando(false);
    }
  };
  return (
    <Tarjeta titulo="Unir varios PDF" icono={Combine}>
      <div className="space-y-3">
        <ElegirArchivos multiple texto="Agregar PDFs" alElegir={(f) => setArchivos((a) => [...a, ...f])} />
        {archivos.map((f, i) => (
          <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
            <span className="w-6 text-tenue">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar" onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))} />
          </div>
        ))}
        <Boton variante="primario" icono={Download} disabled={archivos.length < 2} cargando={trabajando} onClick={() => void unir()}>
          Unir en el orden de la lista
        </Boton>
      </div>
    </Tarjeta>
  );
}

function Paginas() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState("");
  const [accion, setAccion] = useState<"sacar" | "borrar" | "girar">("sacar");
  useEffect(() => {
    if (archivo) void abrir(archivo).then((d) => setTotal(d.getPageCount()), avisarError);
  }, [archivo]);
  const hacer = async () => {
    if (!archivo) return;
    try {
      const doc = await abrir(archivo);
      const elegidas = leerPaginas(paginas, doc.getPageCount());
      if (!elegidas.length) return avisar("Escribe qué páginas, ej. 1-3, 5", "error");
      if (accion === "sacar") {
        const nuevo = await PDFDocument.create();
        for (const p of await nuevo.copyPages(doc, elegidas)) nuevo.addPage(p);
        bajar(await nuevo.save(), `paginas-${archivo.name}`);
      } else if (accion === "borrar") {
        for (const i of [...elegidas].reverse()) doc.removePage(i);
        bajar(await doc.save(), `sin-paginas-${archivo.name}`);
      } else {
        for (const i of elegidas) {
          const p = doc.getPage(i);
          p.setRotation(degrees((p.getRotation().angle + 90) % 360));
        }
        bajar(await doc.save(), `girado-${archivo.name}`);
      }
    } catch (err) {
      avisarError(err);
    }
  };
  return (
    <Tarjeta titulo="Sacar, borrar o girar páginas" icono={Scissors}>
      <div className="space-y-3">
        <ElegirArchivos texto={archivo ? `Cambiar (${archivo.name})` : "Elegir PDF"} alElegir={(f) => setArchivo(f[0] ?? null)} />
        {archivo ? <p className="text-sm text-tenue">Tiene {total} páginas.</p> : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Selector value={accion} onChange={(e) => setAccion(e.target.value as typeof accion)}>
            <option value="sacar">Sacar esas páginas a un PDF nuevo</option>
            <option value="borrar">Borrar esas páginas</option>
            <option value="girar">Girar esas páginas 90°</option>
          </Selector>
          <Entrada value={paginas} onChange={(e) => setPaginas(e.target.value)} placeholder="Páginas, ej. 1-3, 5" />
        </div>
        <Boton variante="primario" icono={accion === "girar" ? RotateCw : Download} disabled={!archivo} onClick={() => void hacer()}>
          Hacer y descargar
        </Boton>
      </div>
    </Tarjeta>
  );
}

function FotosAPdf() {
  const [fotos, setFotos] = useState<File[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const crear = async () => {
    setTrabajando(true);
    try {
      const doc = await PDFDocument.create();
      for (const f of fotos) {
        // Se pasa por un lienzo para aceptar cualquier formato y bajar el peso.
        const bitmap = await createImageBitmap(f);
        const escala = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.round(bitmap.width * escala);
        lienzo.height = Math.round(bitmap.height * escala);
        lienzo.getContext("2d")!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
        const jpg = await new Promise<Blob>((r, x) => lienzo.toBlob((b) => (b ? r(b) : x(new Error("No se pudo leer la foto"))), "image/jpeg", 0.85));
        const img = await doc.embedJpg(await jpg.arrayBuffer());
        const pagina = doc.addPage([img.width, img.height]);
        pagina.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      bajar(await doc.save(), "fotos.pdf");
    } catch (err) {
      avisarError(err);
    } finally {
      setTrabajando(false);
    }
  };
  return (
    <Tarjeta titulo="Fotos a PDF (escáner)" icono={Camera}>
      <div className="space-y-3">
        <p className="text-sm text-tenue">En el celular puedes tomar la foto de un papel; cada foto es una página.</p>
        <div className="flex flex-wrap gap-2">
          <ElegirArchivos multiple accept="image/*" texto="Elegir fotos" alElegir={(f) => setFotos((a) => [...a, ...f])} />
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-borde px-4 text-sm hover:bg-tarjeta">
            <Camera className="h-4 w-4" /> Tomar foto
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
              setFotos((a) => [...a, ...Array.from(e.target.files ?? [])]);
              e.target.value = "";
            }} />
          </label>
        </div>
        {fotos.length ? <p className="text-sm">{fotos.length} foto(s) lista(s).</p> : null}
        <div className="flex gap-2">
          <Boton variante="primario" icono={Download} disabled={!fotos.length} cargando={trabajando} onClick={() => void crear()}>
            Crear PDF
          </Boton>
          {fotos.length ? <Boton variante="fantasma" onClick={() => setFotos([])}>Vaciar</Boton> : null}
        </div>
      </div>
    </Tarjeta>
  );
}

function Firmar() {
  const [modo, setModo] = useState<"colocar" | "rapida">("colocar");
  return (
    <div className="space-y-3">
      <Pestanas
        valor={modo}
        alCambiar={setModo}
        opciones={[
          { id: "colocar", texto: "Ponerla donde quiera (PDF o foto)" },
          { id: "rapida", texto: "Firma rápida en PDF" },
        ]}
      />
      {modo === "colocar" ? <FirmarDocumento /> : <FirmaRapida />}
    </div>
  );
}

function FirmaRapida() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pagina, setPagina] = useState("1");
  const [posicion, setPosicion] = useState<"abajo-derecha" | "abajo-izquierda" | "abajo-centro">("abajo-derecha");
  const [firma, setFirma] = useState<string | null>(null);
  const firmar = async () => {
    if (!archivo || !firma) return;
    try {
      const doc = await abrir(archivo);
      const imagen = firma.startsWith("data:image/png") ? await doc.embedPng(firma) : await doc.embedJpg(firma);
      const i = Math.min(Math.max(Number(pagina) || 1, 1), doc.getPageCount()) - 1;
      const p = doc.getPage(i);
      const ancho = p.getWidth() * 0.3;
      const alto = (imagen.height / imagen.width) * ancho;
      const x = posicion === "abajo-izquierda" ? 40 : posicion === "abajo-centro" ? (p.getWidth() - ancho) / 2 : p.getWidth() - ancho - 40;
      p.drawImage(imagen, { x, y: 50, width: ancho, height: alto });
      bajar(await doc.save(), `firmado-${archivo.name}`);
    } catch (err) {
      avisarError(err);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Tarjeta titulo="1. Tu firma" icono={PenLine}>
        <ElegirFirma alCambiar={setFirma} />
      </Tarjeta>
      <Tarjeta titulo="2. Dónde va" icono={FileText}>
        <div className="space-y-3">
          <ElegirArchivos texto={archivo ? `Cambiar (${archivo.name})` : "Elegir PDF"} alElegir={(f) => setArchivo(f[0] ?? null)} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Campo etiqueta="Página">
              <Entrada type="number" min={1} value={pagina} onChange={(e) => setPagina(e.target.value)} />
            </Campo>
            <Campo etiqueta="Dónde">
              <Selector value={posicion} onChange={(e) => setPosicion(e.target.value as typeof posicion)}>
                <option value="abajo-derecha">Abajo a la derecha</option>
                <option value="abajo-centro">Abajo al centro</option>
                <option value="abajo-izquierda">Abajo a la izquierda</option>
              </Selector>
            </Campo>
          </div>
          <Boton variante="primario" icono={Download} disabled={!archivo || !firma} onClick={() => void firmar()}>
            Firmar y descargar
          </Boton>
        </div>
      </Tarjeta>
    </div>
  );
}

const ACCIONES = [
  { id: "unir", titulo: "Unir PDF", texto: "Junta varios PDF en uno, en el orden que elijas.", icono: Combine, color: "#58a6ff" },
  { id: "paginas", titulo: "Páginas", texto: "Saca, borra o gira páginas de un PDF.", icono: Scissors, color: "#d29922" },
  { id: "fotos", titulo: "Fotos a PDF", texto: "Convierte fotos o la cámara en un PDF.", icono: Camera, color: "#3fb950" },
  { id: "firmar", titulo: "Firmar", texto: "Escrita, dibujada o con imagen, donde quieras.", icono: PenLine, color: "#bc8cff" },
] as const;

export default function Documentos() {
  const [pestana, setPestana] = useState<(typeof ACCIONES)[number]["id"]>("unir");
  return (
    <div className="space-y-4">
      <Encabezado titulo="Documentos y PDF" descripcion="Todo se hace en tu equipo: tus documentos no se suben a ningún lado." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {ACCIONES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setPestana(a.id)}
            aria-pressed={pestana === a.id}
            className={cx(
              "flex flex-col gap-3 rounded-tarjeta border p-4 text-left transition-colors sm:flex-row sm:items-center",
              pestana === a.id ? "border-acento bg-[color-mix(in_srgb,var(--acento)_10%,var(--superficie))]" : "border-borde bg-superficie hover:bg-tarjeta",
            )}
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: `color-mix(in srgb, ${a.color} 18%, transparent)`, color: a.color }}>
              <a.icono className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{a.titulo}</span>
              <span className="block text-xs text-tenue">{a.texto}</span>
            </span>
          </button>
        ))}
      </div>
      {pestana === "unir" ? <Unir /> : pestana === "paginas" ? <Paginas /> : pestana === "fotos" ? <FotosAPdf /> : <Firmar />}
      {pestana === "unir" ? <Vacio icono={FileText} texto="Elige dos o más PDF; se unen en el orden de la lista." /> : null}
    </div>
  );
}
