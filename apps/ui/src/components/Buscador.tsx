/** Buscador de apartados (Ctrl+K o la lupa). */
import { MODULES } from "@mi-setup/shared";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MODULOS_UI } from "../modulos";
import { Entrada, Modal, cx } from "./ui";

export function Buscador({ abierto, alCerrar, visibles }: { abierto: boolean; alCerrar: () => void; visibles: Set<string> }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const navegar = useNavigate();

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.values(MODULOS_UI)
      .filter((m) => visibles.has(m.id))
      .filter((m) => !t || MODULES[m.id].label.toLowerCase().includes(t) || m.ruta.includes(t))
      .slice(0, 12);
  }, [q, visibles]);

  const ir = (ruta: string) => {
    navegar(ruta);
    setQ("");
    alCerrar();
  };

  return (
    <Modal abierto={abierto} titulo="Buscar apartado" alCerrar={alCerrar} ancho="max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-tenue" />
        <Entrada
          autoFocus
          className="pl-9"
          placeholder="Escribe un apartado…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, resultados.length - 1));
            if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            if (e.key === "Enter" && resultados[sel]) ir(resultados[sel].ruta);
          }}
        />
      </div>
      <ul className="mt-3 space-y-1">
        {resultados.map((m, i) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => ir(m.ruta)}
              className={cx(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm",
                i === sel ? "bg-tarjeta" : "hover:bg-tarjeta",
              )}
            >
              <m.icono className="h-4 w-4 text-tenue" />
              {MODULES[m.id].label}
            </button>
          </li>
        ))}
        {resultados.length === 0 ? <li className="py-6 text-center text-sm text-tenue">Sin resultados.</li> : null}
      </ul>
    </Modal>
  );
}
