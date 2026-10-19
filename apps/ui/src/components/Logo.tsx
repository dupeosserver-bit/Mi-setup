/**
 * Logo de la app. Orden: logo subido en Ajustes → logo generado por
 * `pnpm branding` (assets/branding/icon.png) → el nombre "MexicanLand" en texto.
 * Nunca se usa una imagen genérica.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, urlServidor } from "../lib/api";
import { cx } from "./ui";

export interface AparienciaPublica {
  logo: string | null;
  fondo: string | null;
  /** Nombre de la app en esta instalación (null = MexicanLand). */
  nombre?: string | null;
}

export function useAparienciaPublica() {
  return useQuery({
    queryKey: ["apariencia", "publica"],
    queryFn: async (): Promise<AparienciaPublica> => {
      const a = await api<AparienciaPublica>("/api/apariencia/publica");
      return { ...a, logo: urlServidor(a.logo), fondo: urlServidor(a.fondo) };
    },
    staleTime: 5 * 60_000,
  });
}

const TAMANOS = { sm: "h-6", md: "h-8", lg: "h-16" } as const;
const TEXTO = { sm: "text-sm", md: "text-base", lg: "text-3xl" } as const;

export function Logo({ tamano = "md", conTexto = true }: { tamano?: keyof typeof TAMANOS; conTexto?: boolean }) {
  const { data } = useAparienciaPublica();
  const [fallo, setFallo] = useState<string | null>(null);
  const src = data?.logo ?? "/branding/logo.png";
  const mostrarImagen = fallo !== src;
  const nombre = data?.nombre || "MexicanLand";
  useEffect(() => {
    document.title = nombre;
  }, [nombre]);

  return (
    <span className="inline-flex items-center gap-2">
      {mostrarImagen ? (
        <img src={src} alt={nombre} className={cx(TAMANOS[tamano], "w-auto rounded-lg")} onError={() => setFallo(src)} />
      ) : null}
      {conTexto || !mostrarImagen ? (
        <span className={cx("font-titulo font-bold tracking-tight", TEXTO[tamano])}>{nombre}</span>
      ) : null}
    </span>
  );
}
