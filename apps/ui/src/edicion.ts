/**
 * Edición de esta interfaz, elegida al compilar con VITE_EDICION ("personal" o "publica").
 * Vite cambia la variable por su valor, así que las pantallas de la edición personal
 * quedan fuera del build público (ver modulos.tsx).
 */
import { fijarEdicion } from "@mi-setup/shared";

export const PUBLICA = import.meta.env.VITE_EDICION === "publica";

fijarEdicion(PUBLICA ? "publica" : "personal");
