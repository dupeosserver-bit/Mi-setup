/**
 * Documentos y PDF, todo en tu equipo (nada se sube): unir PDFs, sacar o borrar
 * páginas, girar, fotos a PDF (también con la cámara) y firmar con el dedo.
 */
import { Camera, Combine, Download, FileText, PenLine, RotateCw, Scissors, Trash2 } from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import { useEffect, useRef, useState } from "react";
import { Boton, Campo, Encabezado, Entrada, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";

function bajar(bytes: Uint8Array, nombre: string) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
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
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pagina, setPagina] = useState("1");
  const [posicion, setPosicion] = useState<"abajo-derecha" | "abajo-izquierda" | "abajo-centro">("abajo-derecha");
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [hayFirma, setHayFirma] = useState(false);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height] as const;
  };
  const limpiar = () => {
    const c = lienzo.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHayFirma(false);
  };
  const firmar = async () => {
    if (!archivo || !lienzo.current) return;
    try {
      const doc = await abrir(archivo);
      const png = await doc.embedPng(lienzo.current.toDataURL("image/png"));
      const i = Math.min(Math.max(Number(pagina) || 1, 1), doc.getPageCount()) - 1;
      const p = doc.getPage(i);
      const ancho = p.getWidth() * 0.3;
      const alto = (png.height / png.width) * ancho;
      const x = posicion === "abajo-izquierda" ? 40 : posicion === "abajo-centro" ? (p.getWidth() - ancho) / 2 : p.getWidth() - ancho - 40;
      p.drawImage(png, { x, y: 50, width: ancho, height: alto });
      bajar(await doc.save(), `firmado-${archivo.name}`);
    } catch (err) {
      avisarError(err);
    }
  };
  return (
    <Tarjeta titulo="Firmar un PDF" icono={PenLine}>
      <div className="space-y-3">
        <ElegirArchivos texto={archivo ? `Cambiar (${archivo.name})` : "Elegir PDF"} alElegir={(f) => setArchivo(f[0] ?? null)} />
        <p className="text-sm text-tenue">Dibuja tu firma con el dedo o el mouse:</p>
        <canvas
          ref={lienzo}
          width={600}
          height={200}
          className="w-full max-w-md touch-none rounded-xl border border-borde bg-white"
          onPointerDown={(e) => {
            dibujando.current = true;
            const ctx = e.currentTarget.getContext("2d")!;
            const [x, y] = punto(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
          }}
          onPointerMove={(e) => {
            if (!dibujando.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.strokeStyle = "#0b1f5c";
            const [x, y] = punto(e);
            ctx.lineTo(x, y);
            ctx.stroke();
            setHayFirma(true);
          }}
          onPointerUp={() => (dibujando.current = false)}
          onPointerLeave={() => (dibujando.current = false)}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
        <div className="flex gap-2">
          <Boton variante="primario" icono={Download} disabled={!archivo || !hayFirma} onClick={() => void firmar()}>
            Firmar y descargar
          </Boton>
          <Boton variante="fantasma" onClick={limpiar}>
            Borrar firma
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}

export default function Documentos() {
  const [pestana, setPestana] = useState<"unir" | "paginas" | "fotos" | "firmar">("unir");
  return (
    <div className="space-y-4">
      <Encabezado titulo="Documentos y PDF" descripcion="Todo se hace en tu equipo: tus documentos no se suben a ningún lado." />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "unir", texto: "Unir" },
          { id: "paginas", texto: "Páginas" },
          { id: "fotos", texto: "Fotos a PDF" },
          { id: "firmar", texto: "Firmar" },
        ]}
      />
      {pestana === "unir" ? <Unir /> : pestana === "paginas" ? <Paginas /> : pestana === "fotos" ? <FotosAPdf /> : <Firmar />}
      {pestana === "unir" ? <Vacio icono={FileText} texto="Elige dos o más PDF; se unen en el orden de la lista." /> : null}
    </div>
  );
}
