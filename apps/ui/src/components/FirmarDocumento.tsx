/**
 * Firmar un documento viendo dónde queda: abre un PDF (todas sus páginas) o
 * una foto, arrastra la firma al lugar que quieras y cámbiale el tamaño.
 * Todo se hace en tu equipo con pdf.js y pdf-lib: el documento no se sube.
 */
import { Download, FileText, ImagePlus, Move, PenLine, Save, Upload } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { useEffect, useMemo, useRef, useState } from "react";
import { LETRAS_FIRMA, TINTAS, cargarLetra, guardarFirma, leerFirmaGuardada, primerNombre, type LetraFirma } from "../lib/firmas";
import { guardarBlob } from "../lib/guardar";
import { useSesion } from "../lib/sesion";
import { Boton, Campo, Cargando, Entrada, Pestanas, Selector, Tarjeta, avisar, avisarError, cx } from "./ui";

type PdfJs = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJs> | null = null;
async function cargarPdfJs(): Promise<PdfJs> {
  pdfjs ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([m, w]) => {
    m.GlobalWorkerOptions.workerSrc = (w as { default: string }).default;
    return m;
  });
  return pdfjs;
}

interface Colocacion {
  /** Posición y tamaño en proporción de la página (0 a 1), desde arriba a la izquierda. */
  x: number;
  y: number;
  ancho: number;
}

/** De la posición en pantalla (arriba-izquierda, proporciones) a puntos del PDF (abajo-izquierda). */
export function aCoordenadasPdf(c: Colocacion, anchoPagina: number, altoPagina: number, proporcionFirma: number) {
  const ancho = c.ancho * anchoPagina;
  const alto = ancho / proporcionFirma;
  return { x: c.x * anchoPagina, y: altoPagina - c.y * altoPagina - alto, width: ancho, height: alto };
}

type ModoFirma = "escrita" | "dibujar" | "imagen" | "nombre";

export function ElegirFirma({ alCambiar }: { alCambiar: (png: string | null) => void }) {
  const guardada = useMemo(() => leerFirmaGuardada(), []);
  const nombreCuenta = useSesion((s) => primerNombre(s.usuario?.displayName));
  const [modo, setModo] = useState<ModoFirma>(guardada ? "dibujar" : "escrita");
  const [nombre, setNombre] = useState(nombreCuenta);
  const [letra, setLetra] = useState<LetraFirma>("elegante");
  const [color, setColor] = useState<string>(TINTAS[0].color);
  const [hayTrazo, setHayTrazo] = useState(false);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const archivo = useRef<HTMLInputElement>(null);

  const recortar = () => {
    const c = lienzo.current;
    if (!c) return null;
    const g = c.getContext("2d")!;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width;
    let y0 = c.height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3]! > 10) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
    if (x1 < 0) return null;
    const m = 6;
    const r = document.createElement("canvas");
    r.width = x1 - x0 + 2 * m;
    r.height = y1 - y0 + 2 * m;
    r.getContext("2d")!.drawImage(c, x0 - m, y0 - m, r.width, r.height, 0, 0, r.width, r.height);
    return r.toDataURL("image/png");
  };
  const vaciar = () => {
    const c = lienzo.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  };

  useEffect(() => {
    if (modo !== "dibujar" || !guardada) return;
    const c = lienzo.current;
    if (!c) return;
    const i = new Image();
    i.onload = () => {
      vaciar();
      const escala = Math.min((c.width - 40) / i.width, (c.height - 40) / i.height, 1);
      c.getContext("2d")!.drawImage(i, (c.width - i.width * escala) / 2, (c.height - i.height * escala) / 2, i.width * escala, i.height * escala);
      setHayTrazo(true);
      alCambiar(guardada);
    };
    i.src = guardada;
  }, [modo, guardada]);

  useEffect(() => {
    if (modo !== "escrita" && modo !== "nombre") return;
    let vivo = true;
    void (async () => {
      if (modo === "escrita") await cargarLetra(letra).catch(() => undefined);
      const c = lienzo.current;
      if (!vivo || !c) return;
      vaciar();
      const texto = nombre.trim();
      if (!texto) return alCambiar(null);
      const g = c.getContext("2d")!;
      g.fillStyle = color;
      g.textBaseline = "middle";
      g.font = modo === "escrita" ? `${LETRAS_FIRMA[letra].tamano}px "${LETRAS_FIRMA[letra].familia}", cursive` : `600 72px Inter, system-ui, sans-serif`;
      g.fillText(texto, 24, c.height / 2, c.width - 48);
      alCambiar(recortar());
    })();
    return () => {
      vivo = false;
    };
  }, [modo, nombre, letra, color]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height] as const;
  };
  const cambiarModo = (m: ModoFirma) => {
    setModo(m);
    vaciar();
    setHayTrazo(false);
    alCambiar(null);
  };
  return (
    <div className="space-y-3">
      <Pestanas
        valor={modo}
        alCambiar={cambiarModo}
        opciones={[
          { id: "escrita", texto: "Escrita" },
          { id: "dibujar", texto: "Dibujar" },
          { id: "imagen", texto: "Imagen" },
          { id: "nombre", texto: "Solo mi nombre" },
        ]}
      />
      {modo === "escrita" || modo === "nombre" ? (
        <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre, ej. Yahir" maxLength={40} />
      ) : null}
      {modo === "escrita" ? (
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(LETRAS_FIRMA) as LetraFirma[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLetra(l)}
              className={cx("rounded-xl border px-2 py-2 text-xs", letra === l ? "border-acento bg-[color-mix(in_srgb,var(--acento)_12%,transparent)]" : "border-borde text-tenue hover:bg-tarjeta")}
            >
              {LETRAS_FIRMA[l].nombre}
            </button>
          ))}
        </div>
      ) : null}
      {modo === "imagen" ? (
        <>
          <input
            ref={archivo}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const lector = new FileReader();
              lector.onload = () => alCambiar(String(lector.result));
              lector.readAsDataURL(f);
            }}
          />
          <Boton icono={Upload} onClick={() => archivo.current?.click()}>
            Elegir imagen de tu firma (PNG transparente es lo mejor)
          </Boton>
        </>
      ) : (
        <canvas
          ref={lienzo}
          width={900}
          height={300}
          className={cx("w-full touch-none rounded-xl border border-borde bg-white", modo !== "dibujar" && "pointer-events-none")}
          onPointerDown={(e) => {
            dibujando.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const g = e.currentTarget.getContext("2d")!;
            const [x, y] = punto(e);
            g.beginPath();
            g.moveTo(x, y);
          }}
          onPointerMove={(e) => {
            if (!dibujando.current) return;
            const g = e.currentTarget.getContext("2d")!;
            g.lineWidth = 5;
            g.lineCap = "round";
            g.lineJoin = "round";
            g.strokeStyle = color;
            const [x, y] = punto(e);
            g.lineTo(x, y);
            g.stroke();
          }}
          onPointerUp={() => {
            if (dibujando.current) {
              setHayTrazo(true);
              alCambiar(recortar());
            }
            dibujando.current = false;
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {modo !== "imagen" ? (
          <div className="flex items-center gap-1.5" role="group" aria-label="Tinta">
            {TINTAS.map((t) => (
              <button
                key={t.color}
                type="button"
                title={t.nombre}
                aria-label={t.nombre}
                onClick={() => setColor(t.color)}
                className={cx("h-7 w-7 rounded-full border-2", color === t.color ? "border-acento" : "border-transparent")}
                style={{ background: t.color }}
              />
            ))}
          </div>
        ) : null}
        {modo === "dibujar" ? (
          <>
            <Boton tamano="sm" variante="fantasma" onClick={() => (vaciar(), setHayTrazo(false), alCambiar(null))}>
              Vaciar
            </Boton>
            <Boton
              tamano="sm"
              icono={Save}
              disabled={!hayTrazo}
              onClick={() => {
                guardarFirma(recortar());
                avisar("Firma guardada en este equipo");
              }}
            >
              Guardar mi firma
            </Boton>
          </>
        ) : null}
      </div>
      {modo === "escrita" && !guardada ? <p className="text-xs text-tenue">Como aún no tienes firma dibujada, se usa tu nombre con letra de firma.</p> : null}
      {modo === "nombre" ? <p className="text-xs text-tenue">Sin firma: solo se escribe tu nombre en letra normal.</p> : null}
    </div>
  );
}

export function FirmarDocumento() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState<"pdf" | "imagen" | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [firma, setFirma] = useState<string | null>(null);
  const [proporcion, setProporcion] = useState(3);
  const [colocadas, setColocadas] = useState<Map<number, Colocacion>>(new Map());
  const [cargando, setCargando] = useState(false);
  const [medidas, setMedidas] = useState({ ancho: 1, alto: 1 });
  const vista = useRef<HTMLCanvasElement>(null);
  const cajaVista = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const doc = useRef<{ getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number }; render(o: unknown): { promise: Promise<void> } }> } | null>(null);
  const arrastre = useRef<{ modo: "mover" | "tamano"; px: number; py: number; inicial: Colocacion } | null>(null);

  useEffect(() => {
    if (!firma) return;
    const i = new Image();
    i.onload = () => setProporcion(i.naturalWidth / Math.max(1, i.naturalHeight));
    i.src = firma;
  }, [firma]);

  const abrir = async (f: File) => {
    setArchivo(f);
    setColocadas(new Map());
    setPagina(1);
    setCargando(true);
    try {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        const m = await cargarPdfJs();
        const d = await m.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
        doc.current = d as unknown as typeof doc.current;
        setPaginas(d.numPages);
        setTipo("pdf");
      } else if (f.type.startsWith("image/")) {
        doc.current = null;
        setPaginas(1);
        setTipo("imagen");
      } else {
        throw new Error("Abre un PDF o una foto. Para Word u otros documentos, conviértelos primero a PDF en Herramientas → Convertidor.");
      }
    } catch (err) {
      setArchivo(null);
      setTipo(null);
      avisarError(err);
    } finally {
      setCargando(false);
    }
  };

  // Dibuja la página o la foto en la vista.
  useEffect(() => {
    const c = vista.current;
    if (!c || !archivo || !tipo) return;
    let vivo = true;
    void (async () => {
      const anchoCaja = Math.max(280, (cajaVista.current?.clientWidth ?? 600) - 4);
      if (tipo === "pdf" && doc.current) {
        const p = await doc.current.getPage(pagina);
        const base = p.getViewport({ scale: 1 });
        const escala = Math.min(2.5, (anchoCaja / base.width) * (window.devicePixelRatio || 1));
        const v = p.getViewport({ scale: escala });
        c.width = v.width;
        c.height = v.height;
        if (!vivo) return;
        await p.render({ canvasContext: c.getContext("2d")!, viewport: v, canvas: c }).promise;
        setMedidas({ ancho: base.width, alto: base.height });
      } else {
        const url = URL.createObjectURL(archivo);
        const i = new Image();
        await new Promise((ok) => ((i.onload = ok), (i.src = url)));
        c.width = i.naturalWidth;
        c.height = i.naturalHeight;
        c.getContext("2d")!.drawImage(i, 0, 0);
        URL.revokeObjectURL(url);
        setMedidas({ ancho: i.naturalWidth, alto: i.naturalHeight });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [archivo, tipo, pagina]);

  const actual = colocadas.get(pagina);
  const poner = () => setColocadas(new Map(colocadas).set(pagina, actual ?? { x: 0.6, y: 0.8, ancho: 0.3 }));
  const mover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    const caja = vista.current?.getBoundingClientRect();
    if (!a || !caja) return;
    const dx = (e.clientX - a.px) / caja.width;
    const dy = (e.clientY - a.py) / caja.height;
    const c =
      a.modo === "mover"
        ? { ...a.inicial, x: Math.min(1 - a.inicial.ancho, Math.max(0, a.inicial.x + dx)), y: Math.min(0.98, Math.max(0, a.inicial.y + dy)) }
        : { ...a.inicial, ancho: Math.min(1 - a.inicial.x, Math.max(0.05, a.inicial.ancho + dx)) };
    setColocadas(new Map(colocadas).set(pagina, c));
  };

  const descargar = async () => {
    if (!archivo || !firma || !colocadas.size) return;
    try {
      if (tipo === "pdf") {
        const pdf = await PDFDocument.load(await archivo.arrayBuffer(), { ignoreEncryption: true });
        const png = firma.startsWith("data:image/png") ? await pdf.embedPng(firma) : await pdf.embedJpg(firma);
        for (const [n, c] of colocadas) {
          const p = pdf.getPage(n - 1);
          const { width, height } = p.getSize();
          p.drawImage(png, aCoordenadasPdf(c, width, height, proporcion));
        }
        await guardarBlob(new Blob([(await pdf.save()) as unknown as BlobPart], { type: "application/pdf" }), `firmado-${archivo.name}`);
      } else {
        const c = document.createElement("canvas");
        const base = vista.current!;
        c.width = base.width;
        c.height = base.height;
        const g = c.getContext("2d")!;
        g.drawImage(base, 0, 0);
        const img = new Image();
        await new Promise((ok) => ((img.onload = ok), (img.src = firma)));
        const col = colocadas.get(1)!;
        const ancho = col.ancho * c.width;
        g.drawImage(img, col.x * c.width, col.y * c.height, ancho, ancho / proporcion);
        const tipoSalida = archivo.type === "image/png" ? "image/png" : "image/jpeg";
        const blob = await new Promise<Blob>((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo crear la imagen"))), tipoSalida, 0.95));
        await guardarBlob(blob, `firmado-${archivo.name.replace(/\.[^.]+$/, "")}.${tipoSalida === "image/png" ? "png" : "jpg"}`);
      }
      avisar("Documento firmado");
    } catch (err) {
      avisarError(err);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
      <Tarjeta titulo="1. Tu firma" icono={PenLine}>
        <ElegirFirma alCambiar={setFirma} />
      </Tarjeta>
      <Tarjeta
        titulo="2. Documento"
        icono={FileText}
        acciones={
          <div className="flex flex-wrap gap-1">
            <input ref={entrada} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => (e.target.files?.[0] ? void abrir(e.target.files[0]) : undefined, (e.target.value = ""))} />
            <Boton tamano="sm" icono={ImagePlus} onClick={() => entrada.current?.click()}>
              {archivo ? "Cambiar" : "Abrir PDF o foto"}
            </Boton>
          </div>
        }
      >
        {cargando ? <Cargando /> : null}
        {!archivo ? <p className="text-sm text-tenue">Abre un PDF o una foto del documento. Luego toca «Poner firma aquí» y arrástrala a su lugar.</p> : null}
        {archivo ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {paginas > 1 ? (
                <Campo etiqueta="Página" className="w-36">
                  <Selector value={String(pagina)} onChange={(e) => setPagina(Number(e.target.value))}>
                    {Array.from({ length: paginas }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Página {i + 1}
                        {colocadas.has(i + 1) ? " ✔" : ""}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              ) : null}
              <Boton tamano="sm" icono={Move} disabled={!firma} onClick={poner}>
                {actual ? "Firma en esta página" : "Poner firma aquí"}
              </Boton>
              {actual ? (
                <Boton tamano="sm" variante="fantasma" onClick={() => setColocadas(new Map([...colocadas].filter(([n]) => n !== pagina)))}>
                  Quitar de esta página
                </Boton>
              ) : null}
              <Boton tamano="sm" variante="primario" icono={Download} disabled={!firma || !colocadas.size} onClick={() => void descargar()}>
                Firmar y descargar
              </Boton>
            </div>
            <div ref={cajaVista} className="relative w-full overflow-hidden rounded-xl border border-borde bg-white">
              <canvas ref={vista} className="block h-auto w-full" />
              {actual && firma ? (
                <div
                  className="absolute cursor-move touch-none border-2 border-dashed border-acento"
                  style={{ left: `${actual.x * 100}%`, top: `${actual.y * 100}%`, width: `${actual.ancho * 100}%`, aspectRatio: String(proporcion) }}
                  onPointerDown={(e) => {
                    arrastre.current = { modo: "mover", px: e.clientX, py: e.clientY, inicial: actual };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={mover}
                  onPointerUp={() => (arrastre.current = null)}
                >
                  <img src={firma} alt="Firma" className="pointer-events-none h-full w-full object-contain" />
                  <span
                    className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-acento"
                    aria-label="Cambiar tamaño"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      arrastre.current = { modo: "tamano", px: e.clientX, py: e.clientY, inicial: actual };
                      e.currentTarget.parentElement?.setPointerCapture(e.pointerId);
                    }}
                  />
                </div>
              ) : null}
            </div>
            <p className="text-xs text-tenue">
              Arrastra la firma; el punto de la esquina cambia su tamaño. {tipo === "pdf" ? `Página de ${Math.round(medidas.ancho)}×${Math.round(medidas.alto)} pt.` : ""} Todo se hace en tu equipo.
            </p>
          </div>
        ) : null}
      </Tarjeta>
    </div>
  );
}
