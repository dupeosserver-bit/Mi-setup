/**
 * Ejercicios para aprender a programar: 10 fáciles, 10 medios y 10 difíciles
 * en JavaScript, Python y HTML/CSS. Cada uno se califica solo con pruebas.
 */

export type Nivel = "facil" | "medio" | "dificil";
export type Lenguaje = "javascript" | "python" | "html";

export interface Caso {
  args: unknown[];
  esperado: unknown;
}
export interface PruebaDom {
  texto: string;
  /** Expresión de JavaScript que debe dar true dentro de tu página. */
  codigo: string;
}
export interface Ejercicio {
  id: string;
  nivel: Nivel;
  lenguaje: Lenguaje;
  titulo: string;
  enunciado: string;
  plantilla: string;
  pistas: string[];
  /** Función que se prueba (JavaScript y Python). */
  funcion?: string;
  casos?: Caso[];
  /** Pruebas de la página (HTML/CSS). */
  pruebas?: PruebaDom[];
}

export const NIVELES: Record<Nivel, string> = { facil: "Fácil", medio: "Medio", dificil: "Difícil" };
export const LENGUAJES: Record<Lenguaje, string> = { javascript: "JavaScript", python: "Python", html: "HTML/CSS" };

/** Compara resultados sin importar el orden de las llaves de los objetos y con margen en decimales. */
export function igual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => igual(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return igual(ka, kb) && ka.every((k) => igual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

export const EJERCICIOS: Ejercicio[] = [
  // ------------------------------------------------------------------ fácil
  {
    id: "js-suma",
    nivel: "facil",
    lenguaje: "javascript",
    titulo: "Sumar dos números",
    enunciado: "Completa la función `suma(a, b)` para que regrese la suma de los dos números.",
    plantilla: "function suma(a, b) {\n  // tu código aquí\n}\n",
    pistas: ["Usa el operador +.", "Recuerda escribir `return` antes del resultado."],
    funcion: "suma",
    casos: [
      { args: [2, 3], esperado: 5 },
      { args: [-1, 1], esperado: 0 },
      { args: [10, 20], esperado: 30 },
    ],
  },
  {
    id: "js-par",
    nivel: "facil",
    lenguaje: "javascript",
    titulo: "¿Es par?",
    enunciado: "`esPar(n)` debe regresar `true` si el número es par y `false` si es impar.",
    plantilla: "function esPar(n) {\n  \n}\n",
    pistas: ["El operador % da el residuo de una división.", "Un número es par si `n % 2 === 0`."],
    funcion: "esPar",
    casos: [
      { args: [4], esperado: true },
      { args: [7], esperado: false },
      { args: [0], esperado: true },
    ],
  },
  {
    id: "py-saludar",
    nivel: "facil",
    lenguaje: "python",
    titulo: "Saludar",
    enunciado: "Haz que `saludar(nombre)` regrese el texto `Hola, NOMBRE!` (por ejemplo `Hola, Ana!`).",
    plantilla: "def saludar(nombre):\n    # tu código aquí\n    pass\n",
    pistas: ["Puedes unir textos con +.", "O usa f-strings: f\"Hola, {nombre}!\""],
    funcion: "saludar",
    casos: [
      { args: ["Ana"], esperado: "Hola, Ana!" },
      { args: ["MexicanLand"], esperado: "Hola, MexicanLand!" },
    ],
  },
  {
    id: "js-mayor",
    nivel: "facil",
    lenguaje: "javascript",
    titulo: "El mayor de dos",
    enunciado: "`mayor(a, b)` regresa el número más grande. Si son iguales, regresa cualquiera.",
    plantilla: "function mayor(a, b) {\n  \n}\n",
    pistas: ["Usa un `if (a > b)`.", "También existe `Math.max`."],
    funcion: "mayor",
    casos: [
      { args: [3, 9], esperado: 9 },
      { args: [10, 2], esperado: 10 },
      { args: [5, 5], esperado: 5 },
    ],
  },
  {
    id: "py-area",
    nivel: "facil",
    lenguaje: "python",
    titulo: "Área de un rectángulo",
    enunciado: "`area_rectangulo(base, altura)` regresa base por altura.",
    plantilla: "def area_rectangulo(base, altura):\n    pass\n",
    pistas: ["Multiplica con *.", "No olvides `return`."],
    funcion: "area_rectangulo",
    casos: [
      { args: [3, 4], esperado: 12 },
      { args: [10, 2], esperado: 20 },
      { args: [0, 5], esperado: 0 },
    ],
  },
  {
    id: "js-letras",
    nivel: "facil",
    lenguaje: "javascript",
    titulo: "Contar letras",
    enunciado: "`contarLetras(texto)` regresa cuántos caracteres tiene el texto SIN contar los espacios.",
    plantilla: "function contarLetras(texto) {\n  \n}\n",
    pistas: ["`texto.replaceAll(\" \", \"\")` quita los espacios.", "`.length` te dice cuántos caracteres hay."],
    funcion: "contarLetras",
    casos: [
      { args: ["hola"], esperado: 4 },
      { args: ["hola mundo"], esperado: 9 },
      { args: [""], esperado: 0 },
    ],
  },
  {
    id: "html-titulo",
    nivel: "facil",
    lenguaje: "html",
    titulo: "Tu primera página",
    enunciado: "Crea un título `<h1>` que diga exactamente **Mi pastelería** y abajo un párrafo `<p>` con lo que quieras.",
    plantilla: "<!-- Escribe tu HTML aquí -->\n",
    pistas: ["Un título se escribe así: `<h1>Texto</h1>`.", "Un párrafo: `<p>Texto</p>`."],
    pruebas: [
      { texto: "Hay un <h1>", codigo: "!!document.querySelector('h1')" },
      { texto: "El <h1> dice «Mi pastelería»", codigo: "document.querySelector('h1')?.textContent.trim() === 'Mi pastelería'" },
      { texto: "Hay un párrafo con texto", codigo: "(document.querySelector('p')?.textContent.trim().length ?? 0) > 0" },
    ],
  },
  {
    id: "py-edad",
    nivel: "facil",
    lenguaje: "python",
    titulo: "¿Mayor de edad?",
    enunciado: "`es_mayor_de_edad(edad)` regresa `True` si la edad es 18 o más, y `False` si no.",
    plantilla: "def es_mayor_de_edad(edad):\n    pass\n",
    pistas: ["Compara con `>=`.", "La comparación misma ya da True o False: `return edad >= 18`."],
    funcion: "es_mayor_de_edad",
    casos: [
      { args: [18], esperado: true },
      { args: [17], esperado: false },
      { args: [30], esperado: true },
    ],
  },
  {
    id: "js-ultimo",
    nivel: "facil",
    lenguaje: "javascript",
    titulo: "El último de la lista",
    enunciado: "`ultimoElemento(lista)` regresa el último elemento del arreglo.",
    plantilla: "function ultimoElemento(lista) {\n  \n}\n",
    pistas: ["Las posiciones empiezan en 0.", "El último está en `lista.length - 1` (o usa `lista.at(-1)`)."],
    funcion: "ultimoElemento",
    casos: [
      { args: [[1, 2, 3]], esperado: 3 },
      { args: [["a", "b"]], esperado: "b" },
    ],
  },
  {
    id: "html-boton",
    nivel: "facil",
    lenguaje: "html",
    titulo: "Botón e imagen",
    enunciado: "Pon un botón con `id=\"comprar\"` que diga **Comprar**, y una imagen `<img>` con texto alternativo (`alt`) que no esté vacío.",
    plantilla: "<!-- Escribe tu HTML aquí -->\n",
    pistas: ["`<button id=\"comprar\">Comprar</button>`", "`<img src=\"https://picsum.photos/200\" alt=\"Pastel\">`"],
    pruebas: [
      { texto: "Existe el botón #comprar", codigo: "!!document.getElementById('comprar')" },
      { texto: "El botón dice «Comprar»", codigo: "document.getElementById('comprar')?.textContent.trim() === 'Comprar'" },
      { texto: "La imagen tiene alt", codigo: "(document.querySelector('img')?.getAttribute('alt') ?? '').trim().length > 0" },
    ],
  },
  // ------------------------------------------------------------------ medio
  {
    id: "js-invertir",
    nivel: "medio",
    lenguaje: "javascript",
    titulo: "Invertir un texto",
    enunciado: "`invertir(texto)` regresa el texto al revés: `hola` → `aloh`.",
    plantilla: "function invertir(texto) {\n  \n}\n",
    pistas: ["`texto.split(\"\")` lo convierte en lista de letras.", "Las listas tienen `.reverse()` y `.join(\"\")`."],
    funcion: "invertir",
    casos: [
      { args: ["hola"], esperado: "aloh" },
      { args: ["MexicanLand"], esperado: "dnaLnacixeM" },
      { args: [""], esperado: "" },
    ],
  },
  {
    id: "py-sumar-lista",
    nivel: "medio",
    lenguaje: "python",
    titulo: "Sumar una lista",
    enunciado: "`sumar_lista(numeros)` regresa la suma de todos los números (sin usar `sum`).",
    plantilla: "def sumar_lista(numeros):\n    total = 0\n    # recorre la lista\n    return total\n",
    pistas: ["Usa `for n in numeros:`.", "Dentro del for: `total += n`."],
    funcion: "sumar_lista",
    casos: [
      { args: [[1, 2, 3]], esperado: 6 },
      { args: [[]], esperado: 0 },
      { args: [[-5, 5, 10]], esperado: 10 },
    ],
  },
  {
    id: "js-fizzbuzz",
    nivel: "medio",
    lenguaje: "javascript",
    titulo: "FizzBuzz",
    enunciado: "`fizzbuzz(n)`: si n es múltiplo de 3 y de 5 regresa `\"FizzBuzz\"`; si solo de 3, `\"Fizz\"`; si solo de 5, `\"Buzz\"`; si no, el número como texto.",
    plantilla: "function fizzbuzz(n) {\n  \n}\n",
    pistas: ["Revisa primero el caso de 3 y 5 juntos (o múltiplo de 15).", "`String(n)` convierte el número a texto."],
    funcion: "fizzbuzz",
    casos: [
      { args: [3], esperado: "Fizz" },
      { args: [5], esperado: "Buzz" },
      { args: [15], esperado: "FizzBuzz" },
      { args: [7], esperado: "7" },
    ],
  },
  {
    id: "py-vocales",
    nivel: "medio",
    lenguaje: "python",
    titulo: "Contar vocales",
    enunciado: "`contar_vocales(texto)` regresa cuántas vocales (a, e, i, o, u) tiene, sin importar mayúsculas.",
    plantilla: "def contar_vocales(texto):\n    pass\n",
    pistas: ["`texto.lower()` lo pasa a minúsculas.", "Revisa cada letra con `if letra in \"aeiou\":`."],
    funcion: "contar_vocales",
    casos: [
      { args: ["hola"], esperado: 2 },
      { args: ["MURCIELAGO"], esperado: 5 },
      { args: ["xyz"], esperado: 0 },
    ],
  },
  {
    id: "js-palindromo",
    nivel: "medio",
    lenguaje: "javascript",
    titulo: "¿Palíndromo?",
    enunciado: "`esPalindromo(texto)` regresa `true` si se lee igual al derecho y al revés, ignorando espacios y mayúsculas. Ej. «Anita lava la tina».",
    plantilla: "function esPalindromo(texto) {\n  \n}\n",
    pistas: ["Primero limpia: minúsculas y sin espacios.", "Compara el texto limpio con su versión invertida."],
    funcion: "esPalindromo",
    casos: [
      { args: ["Anita lava la tina"], esperado: true },
      { args: ["hola"], esperado: false },
      { args: ["Oso"], esperado: true },
    ],
  },
  {
    id: "html-menu",
    nivel: "medio",
    lenguaje: "html",
    titulo: "Menú horizontal",
    enunciado: "Haz un `<nav>` con 3 enlaces `<a>` y con CSS ponlos en fila usando `display: flex` en el `nav`.",
    plantilla: "<nav>\n  <!-- tus 3 enlaces -->\n</nav>\n\n<style>\n  /* tu CSS aquí */\n</style>\n",
    pistas: ["Un enlace: `<a href=\"#\">Inicio</a>`.", "En el CSS: `nav { display: flex; gap: 16px; }`."],
    pruebas: [
      { texto: "Hay un <nav>", codigo: "!!document.querySelector('nav')" },
      { texto: "El nav tiene 3 enlaces", codigo: "document.querySelectorAll('nav a').length === 3" },
      { texto: "El nav usa display: flex", codigo: "getComputedStyle(document.querySelector('nav')).display === 'flex'" },
    ],
  },
  {
    id: "py-maximo",
    nivel: "medio",
    lenguaje: "python",
    titulo: "El mayor de una lista",
    enunciado: "`maximo(numeros)` regresa el número más grande de la lista SIN usar `max`. La lista nunca viene vacía.",
    plantilla: "def maximo(numeros):\n    pass\n",
    pistas: ["Empieza suponiendo que el mayor es el primero.", "Recorre la lista y cámbialo si encuentras uno más grande."],
    funcion: "maximo",
    casos: [
      { args: [[3, 9, 2]], esperado: 9 },
      { args: [[-1, -5]], esperado: -1 },
      { args: [[7]], esperado: 7 },
    ],
  },
  {
    id: "js-pares",
    nivel: "medio",
    lenguaje: "javascript",
    titulo: "Solo los pares",
    enunciado: "`filtrarPares(lista)` regresa una lista nueva solo con los números pares, en el mismo orden.",
    plantilla: "function filtrarPares(lista) {\n  \n}\n",
    pistas: ["Las listas tienen `.filter(...)`.", "`lista.filter((n) => n % 2 === 0)`"],
    funcion: "filtrarPares",
    casos: [
      { args: [[1, 2, 3, 4]], esperado: [2, 4] },
      { args: [[]], esperado: [] },
      { args: [[5, 7]], esperado: [] },
    ],
  },
  {
    id: "py-tabla",
    nivel: "medio",
    lenguaje: "python",
    titulo: "Tabla de multiplicar",
    enunciado: "`tabla_multiplicar(n)` regresa una lista con n×1 hasta n×10.",
    plantilla: "def tabla_multiplicar(n):\n    pass\n",
    pistas: ["`range(1, 11)` da los números del 1 al 10.", "Puedes usar una lista por comprensión: `[n * i for i in range(1, 11)]`."],
    funcion: "tabla_multiplicar",
    casos: [
      { args: [2], esperado: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] },
      { args: [5], esperado: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] },
    ],
  },
  {
    id: "js-promedio",
    nivel: "medio",
    lenguaje: "javascript",
    titulo: "Promedio",
    enunciado: "`promedio(lista)` regresa el promedio (suma entre cantidad). La lista nunca viene vacía.",
    plantilla: "function promedio(lista) {\n  \n}\n",
    pistas: ["Suma todo con un for o con `.reduce`.", "Divide entre `lista.length`."],
    funcion: "promedio",
    casos: [
      { args: [[1, 2, 3]], esperado: 2 },
      { args: [[10, 15]], esperado: 12.5 },
      { args: [[1, 2]], esperado: 1.5 },
    ],
  },
  // ------------------------------------------------------------------ difícil
  {
    id: "js-palabras",
    nivel: "dificil",
    lenguaje: "javascript",
    titulo: "Contar palabras",
    enunciado: "`contarPalabras(texto)` regresa un objeto con cuántas veces aparece cada palabra (en minúsculas). Ej. `\"Hola hola mundo\"` → `{ hola: 2, mundo: 1 }`. Texto vacío → `{}`.",
    plantilla: "function contarPalabras(texto) {\n  const cuenta = {};\n  \n  return cuenta;\n}\n",
    pistas: ["`texto.toLowerCase().split(\" \")` separa las palabras.", "Ignora las palabras vacías (`if (!palabra) continue;`).", "`cuenta[palabra] = (cuenta[palabra] ?? 0) + 1`"],
    funcion: "contarPalabras",
    casos: [
      { args: ["Hola hola mundo"], esperado: { hola: 2, mundo: 1 } },
      { args: [""], esperado: {} },
      { args: ["el gato y el perro"], esperado: { el: 2, gato: 1, y: 1, perro: 1 } },
    ],
  },
  {
    id: "py-fibonacci",
    nivel: "dificil",
    lenguaje: "python",
    titulo: "Fibonacci",
    enunciado: "`fibonacci(n)` regresa una lista con los primeros n números de Fibonacci: 0, 1, 1, 2, 3, 5…",
    plantilla: "def fibonacci(n):\n    pass\n",
    pistas: ["Cada número es la suma de los dos anteriores.", "Empieza con `a, b = 0, 1` y en cada vuelta `a, b = b, a + b`."],
    funcion: "fibonacci",
    casos: [
      { args: [1], esperado: [0] },
      { args: [5], esperado: [0, 1, 1, 2, 3] },
      { args: [0], esperado: [] },
    ],
  },
  {
    id: "js-primo",
    nivel: "dificil",
    lenguaje: "javascript",
    titulo: "¿Número primo?",
    enunciado: "`esPrimo(n)` regresa `true` si n es primo (solo divisible entre 1 y sí mismo). 0 y 1 no son primos.",
    plantilla: "function esPrimo(n) {\n  \n}\n",
    pistas: ["Si n < 2, no es primo.", "Prueba dividir entre 2, 3, 4… hasta la raíz de n (`Math.sqrt(n)`)."],
    funcion: "esPrimo",
    casos: [
      { args: [2], esperado: true },
      { args: [15], esperado: false },
      { args: [17], esperado: true },
      { args: [1], esperado: false },
    ],
  },
  {
    id: "py-burbuja",
    nivel: "dificil",
    lenguaje: "python",
    titulo: "Ordenar a mano",
    enunciado: "`ordenar_burbuja(lista)` regresa la lista ordenada de menor a mayor SIN usar `sorted` ni `.sort()`.",
    plantilla: "def ordenar_burbuja(lista):\n    numeros = list(lista)\n    # ordena aquí\n    return numeros\n",
    pistas: ["Compara cada par de vecinos y cámbialos si están al revés.", "Repite eso tantas veces como elementos haya."],
    funcion: "ordenar_burbuja",
    casos: [
      { args: [[3, 1, 2]], esperado: [1, 2, 3] },
      { args: [[]], esperado: [] },
      { args: [[5, -1, 5, 0]], esperado: [-1, 0, 5, 5] },
    ],
  },
  {
    id: "js-anagramas",
    nivel: "dificil",
    lenguaje: "javascript",
    titulo: "Anagramas",
    enunciado: "`anagramas(a, b)` regresa `true` si las dos palabras tienen exactamente las mismas letras (en otro orden). Ej. «roma» y «amor».",
    plantilla: "function anagramas(a, b) {\n  \n}\n",
    pistas: ["Si ordenas las letras de las dos palabras, deben quedar iguales.", "`palabra.split(\"\").sort().join(\"\")`"],
    funcion: "anagramas",
    casos: [
      { args: ["roma", "amor"], esperado: true },
      { args: ["hola", "halo"], esperado: true },
      { args: ["abc", "abd"], esperado: false },
    ],
  },
  {
    id: "py-caracteres",
    nivel: "dificil",
    lenguaje: "python",
    titulo: "Diccionario de letras",
    enunciado: "`contar_caracteres(texto)` regresa un diccionario con cuántas veces sale cada carácter. Ej. `\"aab\"` → `{\"a\": 2, \"b\": 1}`.",
    plantilla: "def contar_caracteres(texto):\n    cuenta = {}\n    \n    return cuenta\n",
    pistas: ["Recorre cada letra del texto.", "`cuenta[letra] = cuenta.get(letra, 0) + 1`"],
    funcion: "contar_caracteres",
    casos: [
      { args: ["aab"], esperado: { a: 2, b: 1 } },
      { args: [""], esperado: {} },
      { args: ["mexicanland"], esperado: { m: 1, e: 1, x: 1, i: 1, c: 1, a: 2, n: 2, l: 1, d: 1 } },
    ],
  },
  {
    id: "js-aplanar",
    nivel: "dificil",
    lenguaje: "javascript",
    titulo: "Aplanar listas",
    enunciado: "`aplanar(lista)` convierte listas dentro de listas en una sola lista: `[1, [2, [3, 4]], 5]` → `[1, 2, 3, 4, 5]`. Hazlo con recursión (sin `.flat`).",
    plantilla: "function aplanar(lista) {\n  const resultado = [];\n  \n  return resultado;\n}\n",
    pistas: ["`Array.isArray(x)` te dice si algo es una lista.", "Si es lista, llama a `aplanar(x)` y agrega lo que regrese."],
    funcion: "aplanar",
    casos: [
      { args: [[1, [2, [3, 4]], 5]], esperado: [1, 2, 3, 4, 5] },
      { args: [[]], esperado: [] },
      { args: [[[["a"]], "b"]], esperado: ["a", "b"] },
    ],
  },
  {
    id: "html-contador",
    nivel: "dificil",
    lenguaje: "html",
    titulo: "Contador con JavaScript",
    enunciado: "Haz un `<span id=\"cuenta\">` que empiece en **0** y un botón `id=\"mas\"` que al tocarlo sume 1. Escribe el JavaScript en una etiqueta `<script>`.",
    plantilla: "<span id=\"cuenta\">0</span>\n<button id=\"mas\">+1</button>\n\n<script>\n  // tu código aquí\n</script>\n",
    pistas: ["`document.getElementById(\"mas\").onclick = () => { ... }`", "Lee el número con `Number(cuenta.textContent)` y guarda el nuevo con `cuenta.textContent = ...`."],
    pruebas: [
      { texto: "Empieza en 0", codigo: "document.getElementById('cuenta')?.textContent.trim() === '0'" },
      { texto: "Un clic lo deja en 1", codigo: "(document.getElementById('mas').click(), document.getElementById('cuenta').textContent.trim() === '1')" },
      { texto: "Otro clic lo deja en 2", codigo: "(document.getElementById('mas').click(), document.getElementById('cuenta').textContent.trim() === '2')" },
    ],
  },
  {
    id: "py-romano",
    nivel: "dificil",
    lenguaje: "python",
    titulo: "Números romanos",
    enunciado: "`romano(n)` convierte un número (1 a 3999) a número romano. Ej. 4 → `IV`, 1994 → `MCMXCIV`.",
    plantilla: "def romano(n):\n    pass\n",
    pistas: [
      "Haz una lista de pares de mayor a menor: (1000, \"M\"), (900, \"CM\"), (500, \"D\"), (400, \"CD\")…",
      "Mientras n sea mayor o igual al valor, agrega la letra y réstale el valor.",
    ],
    funcion: "romano",
    casos: [
      { args: [4], esperado: "IV" },
      { args: [9], esperado: "IX" },
      { args: [1994], esperado: "MCMXCIV" },
      { args: [2026], esperado: "MMXXVI" },
    ],
  },
  {
    id: "js-comprimir",
    nivel: "dificil",
    lenguaje: "javascript",
    titulo: "Comprimir texto",
    enunciado: "`comprimir(texto)` junta letras repetidas seguidas con su número: `\"aaabcc\"` → `\"a3b1c2\"`. Texto vacío → `\"\"`.",
    plantilla: "function comprimir(texto) {\n  \n}\n",
    pistas: ["Recorre el texto y cuenta cuántas veces se repite la letra actual.", "Cuando cambie la letra, agrega la letra anterior y su cuenta al resultado."],
    funcion: "comprimir",
    casos: [
      { args: ["aaabcc"], esperado: "a3b1c2" },
      { args: [""], esperado: "" },
      { args: ["x"], esperado: "x1" },
    ],
  },
];
