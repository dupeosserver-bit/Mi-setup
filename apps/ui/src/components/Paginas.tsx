/**
 * Páginas 1, 2, 3… para las listas largas (mismo estilo que la lista de mods).
 * - `Paginas`: los botones. Con `total` muestra los números; con `hayMas`
 *   (cuando el servidor no dice cuántas hay) muestra hasta la siguiente.
 * - `usePaginado`: parte una lista que ya llegó completa.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Boton } from "./ui";

/** Números a mostrar: siempre de 5 en 5 alrededor de la actual (6 7 [8] 9 10). */
export function numerosDePagina(pagina: number, total: number, cuantos = 5): number[] {
  const n = Math.min(cuantos, total);
  const desde = Math.min(Math.max(1, pagina - Math.floor(n / 2)), total - n + 1);
  return Array.from({ length: n }, (_, i) => desde + i);
}

export function Paginas({ pagina, total, hayMas, alCambiar }: { pagina: number; total?: number | undefined; hayMas?: boolean; alCambiar: (p: number) => void }) {
  const caja = useRef<HTMLElement>(null);
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
    <nav ref={caja} className="mt-3 flex min-w-0 max-w-full flex-wrap items-center justify-center gap-1" aria-label="Páginas">
      {/* Solo flechas y 5 números: cabe en tarjetas angostas (Música, celular). */}
      <Boton tamano="icono" variante="secundario" icono={ChevronLeft} disabled={pagina <= 1} onClick={() => ir(pagina - 1)} aria-label="Página anterior" title="Anterior" />
      {numerosDePagina(pagina, ultima).map((n) => (
        <Boton key={n} tamano="sm" className="min-w-[2.25rem] px-2" variante={n === pagina ? "primario" : "fantasma"} onClick={() => ir(n)} aria-current={n === pagina ? "page" : undefined}>
          {n}
        </Boton>
      ))}
      <Boton tamano="icono" variante="secundario" icono={ChevronRight} disabled={pagina >= ultima} onClick={() => ir(pagina + 1)} aria-label="Página siguiente" title="Siguiente" />
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
