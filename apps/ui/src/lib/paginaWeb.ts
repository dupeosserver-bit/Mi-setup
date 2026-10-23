import { documentoDe } from "../components/MarcoVista";

export function armarPaginaWeb(html: string, leer: (nombre: string) => string | undefined): string {
  if (!/<html[\s>]/i.test(html)) return documentoDe({ html, css: "", js: "" });
  const limpio = (ref: string) => ref.replace(/^\.\//, "").split(/[?#]/)[0] ?? ref;
  return html
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, (etiqueta) => {
      const href = /href=["']([^"']+)["']/i.exec(etiqueta)?.[1];
      const texto = href ? leer(limpio(href)) : undefined;
      return texto === undefined ? etiqueta : `<style>${texto.replace(/<\/style/gi, "<\\/style")}</style>`;
    })
    .replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (etiqueta, _a: string, src: string) => {
      const texto = leer(limpio(src));
      return texto === undefined ? etiqueta : `<script>${texto.replace(/<\/script/gi, "<\\/script")}</script>`;
    });
}

export function referenciasWeb(html: string): string[] {
  const refs = [...html.matchAll(/(?:href|src)=["']([^"':]+\.(?:css|js))["']/gi)].map((m) => (m[1] ?? "").replace(/^\.\//, ""));
  return [...new Set(refs.filter(Boolean))];
}
