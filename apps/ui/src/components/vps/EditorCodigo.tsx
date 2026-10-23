import "../../lib/monaco";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { ArrowLeft } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useForma, useModoPagina, useTactil } from "../../lib/marco";
import { FilaSimbolos } from "../FilaSimbolos";
import { Boton, Cargando } from "../ui";

export function EditorCodigo({
  valor,
  alCambiar,
  lenguaje,
  soloLectura,
  ruta,
}: {
  valor: string;
  alCambiar?: (v: string) => void;
  lenguaje: string;
  soloLectura?: boolean;
  ruta?: string;
}) {
  const ref = useRef<editor.IStandaloneCodeEditor | null>(null);
  const tactil = useTactil();
  const chico = useForma() === "celular";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <Editor
          theme="vs-dark"
          path={ruta}
          language={lenguaje}
          value={valor}
          loading={<Cargando />}
          onMount={(ed) => {
            ref.current = ed;
          }}
          onChange={(v) => alCambiar?.(v ?? "")}
          options={{
            readOnly: soloLectura,
            fontSize: chico ? 13 : 14,
            minimap: { enabled: !chico },
            wordWrap: "on",
            automaticLayout: true,
            lineNumbersMinChars: chico ? 2 : 4,
            folding: !chico,
            scrollBeyondLastLine: false,
            tabSize: 2,
          }}
        />
      </div>
      {tactil && !soloLectura ? <FilaSimbolos obtener={() => ref.current} /> : null}
    </div>
  );
}

export function PantallaCompleta({
  titulo,
  subtitulo,
  alCerrar,
  acciones,
  pie,
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  alCerrar: () => void;
  acciones?: ReactNode;
  pie?: ReactNode;
  children: ReactNode;
}) {
  useModoPagina("completa");
  return (
    <div className="fixed inset-0 z-[60] flex h-[var(--alto-app,100dvh)] min-h-0 flex-col bg-fondo">
      <header className="flex shrink-0 items-center gap-2 border-b border-borde bg-superficie px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alCerrar} aria-label="Volver" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{titulo}</p>
          {subtitulo ? <p className="truncate text-xs text-tenue">{subtitulo}</p> : null}
        </div>
        {acciones ? <div className="flex shrink-0 items-center gap-1.5">{acciones}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {pie ? (
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-borde bg-superficie px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{pie}</footer>
      ) : null}
    </div>
  );
}
