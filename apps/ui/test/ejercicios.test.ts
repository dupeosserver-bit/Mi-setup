import { describe, expect, it } from "vitest";
import { calificarJava, paginaEjercicio, programaJava } from "../src/lib/corredor";
import { EJERCICIOS, LENGUAJES, retoDelDia, videosDe } from "../src/lib/ejercicios";
import { armarPaginaWeb, referenciasWeb } from "../src/lib/paginaWeb";

describe("ejercicios", () => {
  it("cada ejercicio tiene id único y sus pruebas", () => {
    const ids = new Set(EJERCICIOS.map((e) => e.id));
    expect(ids.size).toBe(EJERCICIOS.length);
    for (const e of EJERCICIOS) {
      if (e.lenguaje === "java") expect(e.casosJava?.length).toBeGreaterThan(0);
      else if (e.lenguaje === "html" || e.lenguaje === "css") expect(e.pruebas?.length).toBeGreaterThan(0);
      else expect(e.casos?.length && e.funcion).toBeTruthy();
    }
    for (const l of Object.keys(LENGUAJES)) expect(EJERCICIOS.some((e) => e.lenguaje === l)).toBe(true);
  });

  it("califica Java por lo que imprime", () => {
    const e = EJERCICIOS.find((x) => x.id === "java-suma")!;
    const programa = programaJava(e, "public class Solucion { static int suma(int a, int b) { return a + b; } }");
    expect(programa.startsWith("public class Main")).toBe(true);
    expect(programa).toContain("class Solucion");
    expect(programa).not.toContain("public class Solucion");
    const bien = calificarJava(e, "@@mi-setup@@0:5\r\nhola\n@@mi-setup@@1:0\n@@mi-setup@@2:350\n", null);
    expect(bien.resultados.every((r) => r.ok)).toBe(true);
    expect(bien.salida).toEqual(["hola"]);
    const mal = calificarJava(e, "@@mi-setup@@0:6\n@@mi-setup@@1!java.lang.ArithmeticException\n", null);
    expect(mal.resultados.map((r) => r.ok)).toEqual([false, false, false]);
    expect(calificarJava(e, "", "Main.java:3: error: ';' expected").error).toContain("expected");
  });

  it("el CSS se aplica sobre el HTML fijo del ejercicio", () => {
    const e = EJERCICIOS.find((x) => x.id === "css-color")!;
    const pagina = paginaEjercicio(e, "h1{color:red}");
    expect(pagina.startsWith("<style>h1{color:red}</style>")).toBe(true);
    expect(pagina).toContain("<h1>Mi pastelería</h1>");
  });

  it("reto del día y videos", () => {
    const hoy = new Date(2026, 9, 23);
    const reto = retoDelDia(EJERCICIOS, {}, hoy);
    expect(reto).not.toBeNull();
    expect(retoDelDia(EJERCICIOS, {}, hoy)?.id).toBe(reto?.id);
    const todos = Object.fromEntries(EJERCICIOS.filter((x) => x.id !== "js-suma").map((x) => [x.id, "si"]));
    expect(retoDelDia(EJERCICIOS, todos, hoy)?.id).toBe("js-suma");
    const v = videosDe(EJERCICIOS[0]!);
    expect(v[0]?.url.startsWith("https://www.youtube.com/results?search_query=")).toBe(true);
  });
});

describe("vista en vivo del editor", () => {
  it("mete el CSS y JS del proyecto en la página", () => {
    const html = '<!doctype html><html><head><link rel="stylesheet" href="estilos.css"></head><body><h1>Hola</h1><script src="./app.js"></script></body></html>';
    expect(referenciasWeb(html)).toEqual(["estilos.css", "app.js"]);
    const armado = armarPaginaWeb(html, (n) => ({ "estilos.css": "h1{color:red}", "app.js": "console.log(1)" })[n]);
    expect(armado).toContain("<style>h1{color:red}</style>");
    expect(armado).toContain("<script>console.log(1)</script>");
    expect(armarPaginaWeb("<p>solo</p>", () => undefined)).toContain("<body><p>solo</p>");
  });
});
