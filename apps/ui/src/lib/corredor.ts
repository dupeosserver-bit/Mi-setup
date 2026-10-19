/**
 * Corre el código de los ejercicios dentro de la página aislada /vista-previa
 * (sin acceso a tu cuenta). Arma un documento por lenguaje que califica las
 * pruebas y avisa el resultado a la app con postMessage.
 */
import { igual, type Ejercicio } from "./ejercicios";

export interface Resultado {
  ok: boolean;
  /** Para HTML: nombre de la prueba. Para funciones: la llamada. */
  texto: string;
  obtenido?: unknown;
  esperado?: unknown;
  error?: string;
}
export interface Corrida {
  resultados: Resultado[];
  salida: string[];
  error?: string;
}

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/";

/** JSON seguro para meterlo dentro de un <script>. */
const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

const llamada = (funcion: string, args: unknown[]) => `${funcion}(${args.map((a) => JSON.stringify(a)).join(", ")})`;

export function documentoEjercicio(e: Ejercicio, codigo: string, id: string): string {
  const enviar = `function enviar(m){top.postMessage(Object.assign({tipo:"mi-setup-ejercicio",id:${json(id)}},m),"*");}`;
  const comparar = `var igual=(${igual.toString()});`;
  if (e.lenguaje === "html") {
    const pruebas = json((e.pruebas ?? []).map((p) => ({ texto: p.texto, codigo: p.codigo })));
    return `<!doctype html><html><head><meta charset="utf-8"></head><body>${codigo}<script>${enviar}
window.addEventListener("load",function(){setTimeout(function(){var r=${pruebas}.map(function(p){try{return{ok:!!(0,eval)(p.codigo),texto:p.texto};}catch(err){return{ok:false,texto:p.texto,error:String(err&&err.message||err)};}});enviar({resultados:r,salida:[]});},60);});
</script></body></html>`;
  }
  const casos = json((e.casos ?? []).map((c) => ({ args: c.args, esperado: c.esperado, texto: llamada(e.funcion ?? "", c.args) })));
  if (e.lenguaje === "javascript") {
    return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${enviar}${comparar}
(function(){var salida=[];function log(){salida.push(Array.prototype.map.call(arguments,function(x){return typeof x==="string"?x:JSON.stringify(x);}).join(" "));}
var consola={log:log,info:log,warn:log,error:log};
try{var fn=new Function("console",${json(codigo)}+"\\n;return typeof ${e.funcion}==='function'?${e.funcion}:undefined;")(consola);
if(!fn)throw new Error("No encontré la función ${e.funcion}. ¿Le cambiaste el nombre?");
var r=${casos}.map(function(c){try{var o=fn.apply(null,JSON.parse(JSON.stringify(c.args)));return{ok:igual(o,c.esperado),texto:c.texto,obtenido:o===undefined?"(nada: ¿te faltó return?)":o,esperado:c.esperado};}catch(err){return{ok:false,texto:c.texto,esperado:c.esperado,error:String(err&&err.message||err)};}});
enviar({resultados:r,salida:salida});}catch(err){enviar({resultados:[],salida:salida,error:String(err&&err.message||err)});}})();
</script></body></html>`;
  }
  // Python con Pyodide (se baja la primera vez, unos 10 MB).
  return `<!doctype html><html><head><meta charset="utf-8"><script src="${PYODIDE}pyodide.js"></script></head><body><script>${enviar}${comparar}
(async function(){var salida=[];try{var py=await loadPyodide({indexURL:${json(PYODIDE)}});
py.setStdout({batched:function(t){salida.push(t);}});py.setStderr({batched:function(t){salida.push(t);}});
await py.runPythonAsync(${json(codigo)});
var fn=py.globals.get(${json(e.funcion)});if(!fn)throw new Error("No encontré la función ${e.funcion}. ¿Le cambiaste el nombre?");
var r=${casos}.map(function(c){try{var o=fn.apply(null,c.args.map(function(a){return py.toPy(a);}));if(o&&o.toJs){var x=o.toJs({dict_converter:Object.fromEntries});o.destroy&&o.destroy();o=x;}
return{ok:igual(o,c.esperado),texto:c.texto,obtenido:o===undefined?"None (¿te faltó return?)":o,esperado:c.esperado};}catch(err){return{ok:false,texto:c.texto,esperado:c.esperado,error:String(err&&err.message||err).trim().split("\\n").slice(-2).join(" ")};}});
enviar({resultados:r,salida:salida});}catch(err){enviar({resultados:[],salida:salida,error:String(err&&err.message||err).trim().split("\\n").slice(-4).join("\\n")});}})();
</script></body></html>`;
}
