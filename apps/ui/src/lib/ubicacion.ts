/**
 * Ubicación actual para el clima: GPS del celular (Capacitor), ubicación del
 * sistema en la PC o el navegador y, si nada de eso está disponible, una
 * ubicación aproximada por la IP pública.
 */
import { Geolocation } from "@capacitor/geolocation";
import { api } from "./api";
import { esMovil } from "./plataforma";

export interface Lugar {
  nombre: string;
  lat: number;
  lon: number;
}

async function coordenadas(): Promise<{ lat: number; lon: number } | null> {
  try {
    if (esMovil()) {
      const permiso = await Geolocation.requestPermissions();
      if (permiso.location !== "granted" && permiso.coarseLocation !== "granted") return null;
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 });
      return { lat: p.coords.latitude, lon: p.coords.longitude };
    }
    if (!("geolocation" in navigator)) return null;
    return await new Promise((resolver) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolver({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => resolver(null),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
      ),
    );
  } catch {
    return null;
  }
}

/** Devuelve el lugar actual con nombre (ciudad, estado, país). */
export async function ubicacionActual(): Promise<Lugar & { metodo: "gps" | "ip" }> {
  const c = await coordenadas();
  if (c) {
    const lugar = await api<Lugar>(`/api/novedades/lugar?lat=${c.lat}&lon=${c.lon}`);
    return { ...lugar, metodo: "gps" };
  }
  return { ...(await api<Lugar>("/api/novedades/ip-ubicacion")), metodo: "ip" };
}
