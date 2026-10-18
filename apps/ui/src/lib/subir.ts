/** Sube un archivo con barra de avance (fetch no informa el avance de subida). */
import { API_BASE, refrescar } from "./api";
import { useSesion } from "./sesion";

export function subirConAvance<T>(ruta: string, archivo: File, alAvance: (pct: number) => void): Promise<T> {
  const intentar = (reintento: boolean): Promise<T> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}${ruta}`);
      const token = useSesion.getState().accessToken;
      if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && alAvance(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        if (xhr.status === 401 && !reintento) {
          void refrescar().then((ok) => (ok ? intentar(true).then(resolve, reject) : reject(new Error("Tu sesión venció"))));
          return;
        }
        let datos: { error?: string } = {};
        try {
          datos = JSON.parse(xhr.responseText) as typeof datos;
        } catch {
          /* respuesta vacía */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(datos as T);
        else reject(new Error(datos.error ?? `No se pudo subir (error ${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Se cortó la conexión al subir"));
      const fd = new FormData();
      fd.append("archivo", archivo);
      xhr.send(fd);
    });
  return intentar(false);
}
