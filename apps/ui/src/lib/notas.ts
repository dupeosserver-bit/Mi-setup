/** Utilidades de las notas tipo Notion (texto Markdown). */

/** Marca o desmarca la casilla número n ("- [ ] …"), en el orden en que aparecen. */
export function alternarCasilla(contenido: string, n: number): string {
  let i = -1;
  return contenido.replace(/^(\s*[-*+]\s+\[)([ xX])(\])/gm, (m, a: string, marca: string, c: string) => {
    i++;
    return i === n ? `${a}${marca === " " ? "x" : " "}${c}` : m;
  });
}
