import { MODULES } from "@mi-setup/shared";
import { Hourglass } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Encabezado, Vacio } from "../components/ui";
import { moduloPorRuta } from "../modulos";

/** Apartado que todavía no se activó en esta versión. */
export default function Pendiente() {
  const mod = moduloPorRuta(useLocation().pathname);
  return (
    <>
      <Encabezado titulo={mod ? MODULES[mod.id].label : "Apartado"} />
      <Vacio icono={Hourglass} texto="Este apartado todavía no está disponible en esta versión." />
    </>
  );
}
