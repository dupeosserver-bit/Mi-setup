/** Portapapeles con borrado a los 20 s, exportar/importar cifrado y cambio de clave maestra. */
import { avisar } from "../../components/ui";
import { api } from "../api";
import { guardarBlob } from "../guardar";
import { queryClient } from "../consultas";
import { cifrar, claveCorrecta, contextoDe, crearVerificador, derivarClave, descifrar, KDF_POR_DEFECTO, nuevaSal, type ParametrosKdf } from "./cripto";
import { useBoveda, type Coleccion, type ConfigBoveda } from "./estado";

export const BORRAR_PORTAPAPELES_MS = 20_000;
let temporizador: ReturnType<typeof setTimeout> | null = null;

export async function copiarSeguro(texto: string, etiqueta = "Copiado"): Promise<void> {
  await navigator.clipboard.writeText(texto);
  avisar(`${etiqueta}. Se borrará del portapapeles en 20 s.`, "info");
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    void (async () => {
      // Solo se borra si el portapapeles aún tiene lo que se copió.
      const actual = await navigator.clipboard.readText().catch(() => texto);
      if (actual === texto) await navigator.clipboard.writeText("").catch(() => undefined);
    })();
  }, BORRAR_PORTAPAPELES_MS);
}

interface Crudo {
  id: string;
  tipo: string;
  datos: string;
}

interface ArchivoBoveda {
  formato: "mi-setup-boveda";
  version: 1;
  coleccion: Coleccion;
  exportado: string;
  sal: string;
  kdf: ParametrosKdf;
  verificador: string;
  items: { tipo: string; datos: string }[];
}

/** Descarga la colección tal como está en el servidor: todo sigue cifrado. */
export async function exportar(coleccion: Coleccion, config: ConfigBoveda): Promise<void> {
  if (!config.sal || !config.kdf || !config.verificador) throw new Error("La bóveda no está configurada");
  const items = await api<Crudo[]>(`/api/${coleccion}/items`);
  const archivo: ArchivoBoveda = {
    formato: "mi-setup-boveda",
    version: 1,
    coleccion,
    exportado: new Date().toISOString(),
    sal: config.sal,
    kdf: config.kdf,
    verificador: config.verificador,
    items: items.map((i) => ({ tipo: i.tipo, datos: i.datos })),
  };
  await guardarBlob(new Blob([JSON.stringify(archivo, null, 2)], { type: "application/json" }), `mi-setup-${coleccion}-${archivo.exportado.slice(0, 10)}.json`);
}

/** Importa un archivo exportado: lo descifra con su clave maestra y lo vuelve a cifrar con la actual. */
export async function importar(coleccion: Coleccion, texto: string, claveMaestraArchivo: string): Promise<number> {
  const clave = useBoveda.getState().clave;
  if (!clave) throw new Error("Abre la bóveda primero");
  let archivo: ArchivoBoveda;
  try {
    archivo = JSON.parse(texto) as ArchivoBoveda;
  } catch {
    throw new Error("El archivo no es un respaldo de Mi Setup");
  }
  if (archivo.formato !== "mi-setup-boveda" || archivo.version !== 1 || !Array.isArray(archivo.items)) {
    throw new Error("El archivo no es un respaldo de Mi Setup");
  }
  const claveArchivo = await derivarClave(claveMaestraArchivo, archivo.sal, archivo.kdf);
  if (!(await claveCorrecta(claveArchivo, archivo.verificador))) throw new Error("La clave maestra del archivo no es correcta");
  const items = await Promise.all(
    archivo.items.map(async (i) => ({
      tipo: i.tipo,
      datos: await cifrar(clave, await descifrar<unknown>(claveArchivo, i.datos, contextoDe(i.tipo)), contextoDe(i.tipo)),
    })),
  );
  if (items.length === 0) return 0;
  await api(`/api/${coleccion}/importar`, { cuerpo: { items } });
  await queryClient.invalidateQueries({ queryKey: ["boveda", "items"] });
  return items.length;
}

/** Re-cifra toda la bóveda (contraseñas y 2FA) con una clave maestra nueva. */
export async function cambiarClaveMaestra(nueva: string): Promise<void> {
  const actual = useBoveda.getState().clave;
  if (!actual) throw new Error("Abre la bóveda primero");
  const todos = [...(await api<Crudo[]>("/api/boveda/items")), ...(await api<Crudo[]>("/api/2fa/items"))];
  const sal = await nuevaSal();
  const clave = await derivarClave(nueva, sal, KDF_POR_DEFECTO);
  const items = await Promise.all(
    todos.map(async (i) => ({ id: i.id, datos: await cifrar(clave, await descifrar<unknown>(actual, i.datos, contextoDe(i.tipo)), contextoDe(i.tipo)) })),
  );
  await api("/api/boveda/cambiar-clave", { cuerpo: { sal, kdf: KDF_POR_DEFECTO, verificador: await crearVerificador(clave), items } });
  await queryClient.invalidateQueries({ queryKey: ["boveda"] });
  useBoveda.getState().desbloquear(clave);
}
