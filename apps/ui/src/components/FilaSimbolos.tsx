import type { editor } from "monaco-editor";
import { cx } from "./ui";

const SIMBOLOS = ["⇥", "{", "}", "(", ")", "[", "]", "<", ">", "/", "=", ";", ":", "\"", "'", "`", "+", "-", "*", "&", "|", "!", "?", "#", "$", "%", "_", "\\", "~", "^", "@", ",", "."] as const;

const PARES: Partial<Record<string, string>> = { "{": "}", "(": ")", "[": "]", "\"": "\"", "'": "'", "`": "`" };

export function insertarEnEditor(ed: editor.ICodeEditor | null, simbolo: string) {
  if (!ed) return;
  ed.focus();
  if (simbolo === "⇥") {
    ed.trigger("simbolos", "tab", null);
    return;
  }
  const cierre = PARES[simbolo];
  const sel = ed.getSelection();
  const modelo = ed.getModel();
  if (cierre && sel && modelo && !sel.isEmpty()) {
    const texto = modelo.getValueInRange(sel);
    ed.executeEdits("simbolos", [{ range: sel, text: `${simbolo}${texto}${cierre}`, forceMoveMarkers: true }]);
    return;
  }
  ed.trigger("simbolos", "type", { text: simbolo });
}

export function FilaSimbolos({ obtener, className }: { obtener: () => editor.ICodeEditor | null; className?: string }) {
  return (
    <div className={cx("flex shrink-0 gap-1.5 overflow-x-auto border-t border-borde bg-superficie px-2 py-1.5 [scrollbar-width:none]", className)} role="toolbar" aria-label="Símbolos de programación">
      {SIMBOLOS.map((s) => (
        <button
          key={s}
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insertarEnEditor(obtener(), s)}
          className="grid h-9 min-w-9 shrink-0 place-items-center rounded-lg bg-tarjeta px-2 font-mono text-sm shadow-sm active:bg-[color-mix(in_srgb,var(--acento)_25%,transparent)]"
          aria-label={s === "⇥" ? "Tabulador" : s}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
