/**
 * Páginas 1, 2, 3… para las listas largas (mismo estilo que la lista de mods).
 * - `Paginas`: los botones. Con `total` muestra los números; con `hayMas`
 *   (cuando el servidor no dice cuántas hay) muestra hasta la siguiente.
 * - `usePaginado`: parte una lista que ya llegó completa.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Boton } from "./ui";

/** Números a mostrar: 1 … 4 5 [6] 7 8 … 20 */
export function numerosDePagina(pagina: number, total: number, vecinos = 1): (number | "…")[] {
  if (total <= 5 + vecinos * 2) return Array.from({ length: total }, (_, i) => i + 1);
  const lista: (number | "…")[] = [1];
  const desde = Math.max(2, pagina - vecinos);
  const hasta = Math.min(total - 1, pagina + vecinos);
  if (desde > 2) lista.push("…");
  for (let n = desde; n <= hasta; n++) lista.push(n);
  if (hasta < total - 1) lista.push("…");
  lista.push(total);
  return lista;
}

export function Paginas({ pagina, total, hayMas, alCambiar }: { pagina: number; total?: number | undefined; hayMas?: boolean; alCambiar: (p: number) => void }) {
  const caja = useRef<HTMLElement>(null);
  const angosta = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches;
  const ultima = total ?? (hayMas ? pagina + 1 : pagina);
  if (ultima <= 1 && pagina <= 1) return null;
  const ir = (p: number) => {
    // La pantalla se queda donde estaba: los botones siguen bajo tu dedo aunque la lista cambie de alto.
    const antes = caja.current?.getBoundingClientRect().top;
    alCambiar(p);
    if (antes === undefined || typeof window === "undefined") return;
    requestAnimationFrame(() => {
      const despues = caja.current?.getBoundingClientRect().top;
      if (despues === undefined || despues === antes) return;
      const main = document.querySelector("main");
      if (main && main.scrollHeight > main.clientHeight) main.scrollBy({ top: despues - antes });
      else window.scrollBy({ top: despues - antes });
    });
  };
  return (
    <nav ref={caja} className="mt-3 flex items-center justify-center gap-1" aria-label="Páginas">
      <Boton tamano="sm" variante="secundario" icono={ChevronLeft} disabled={pagina <= 1} onClick={() => ir(pagina - 1)} aria-label="Página anterior">
        <span className="hidden sm:inline">Anterior</span>
      </Boton>
      {numerosDePagina(pagina, ultima, angosta ? 0 : 1).map((n, i) =>
        n === "…" ? (
          <span key={`p${i}`} className="px-1 text-tenue">
            …
          </span>
        ) : (
          <Boton key={n} tamano="sm" variante={n === pagina ? "primario" : "fantasma"} onClick={() => ir(n)} aria-current={n === pagina ? "page" : undefined}>
            {n}
          </Boton>
        ),
      )}
      <Boton tamano="sm" variante="secundario" disabled={pagina >= ultima} onClick={() => ir(pagina + 1)} aria-label="Página siguiente">
        <span className="hidden sm:inline">Siguiente</span>
        <ChevronRight className="h-4 w-4" />
      </Boton>
    </nav>
  );
}

/** Parte una lista en páginas; vuelve a la 1 cuando la lista cambia de tamaño (otro filtro). */
export function usePaginado<T>(lista: readonly T[] | undefined, porPagina = 12) {
  const [pagina, setPagina] = useState(1);
  const total = Math.max(1, Math.ceil((lista?.length ?? 0) / porPagina));
  useEffect(() => setPagina(1), [lista?.length]);
  const visibles = useMemo(() => (lista ?? []).slice((Math.min(pagina, total) - 1) * porPagina, Math.min(pagina, total) * porPagina), [lista, pagina, total, porPagina]);
  return { pagina: Math.min(pagina, total), setPagina, visibles, total, paginas: <Paginas pagina={Math.min(pagina, total)} total={total} alCambiar={setPagina} /> };
}
