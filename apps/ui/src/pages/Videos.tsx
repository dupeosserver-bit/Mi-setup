/** Mis videos: tu propio "YouTube" privado en el VPS. */
import { Biblioteca } from "../components/Biblioteca";
import { Encabezado } from "../components/ui";

export default function Videos() {
  return (
    <div className="space-y-4">
      <Encabezado titulo="Mis videos" descripcion="Sube tus videos al servidor y míralos desde cualquier equipo. Recuerda dónde te quedaste." />
      <Biblioteca tipo="videos" />
      <p className="text-xs text-tenue">
        Si el video no se reproduce en el celular, conviértelo a MP4 en Convertidor. ¿Tienes muchas películas? Jellyfin las organiza con portadas (ver USO.md).
      </p>
    </div>
  );
}
