import { useEffect, useState } from "react";
import { create } from "zustand";

export type ModoPagina = "normal" | "fijo" | "pleno" | "completa";
export type Forma = "pc" | "tablet" | "celular";

interface EstadoMarco {
  modo: ModoPagina;
  poner(modo: ModoPagina): void;
}

export const useMarco = create<EstadoMarco>()((set) => ({
  modo: "normal",
  poner: (modo) => set({ modo }),
}));

export function useModoPagina(modo: ModoPagina, activo = true) {
  const poner = useMarco((s) => s.poner);
  useEffect(() => {
    if (!activo) return;
    poner(modo);
    return () => poner("normal");
  }, [modo, activo, poner]);
}

export const CONSULTA_CELULAR = "(max-width: 640px)";
export const CONSULTA_TABLET = "(max-width: 999px), (max-width: 1199px) and (pointer: coarse)";
export const CONSULTA_ACOSTADO = "(max-height: 500px) and (pointer: coarse)";

function coincide(consulta: string): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(consulta).matches);
}

export function leerForma(): Forma {
  if (coincide(CONSULTA_CELULAR)) return "celular";
  if (coincide(CONSULTA_TABLET)) return "tablet";
  return "pc";
}

export function useForma(): Forma {
  const [forma, setForma] = useState<Forma>(leerForma);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const listas = [CONSULTA_CELULAR, CONSULTA_TABLET].map((c) => window.matchMedia(c));
    const alCambiar = () => setForma(leerForma());
    listas.forEach((l) => l.addEventListener?.("change", alCambiar));
    window.addEventListener("resize", alCambiar);
    return () => {
      listas.forEach((l) => l.removeEventListener?.("change", alCambiar));
      window.removeEventListener("resize", alCambiar);
    };
  }, []);
  return forma;
}

export function useAcostado(): boolean {
  const [acostado, setAcostado] = useState(() => coincide(CONSULTA_ACOSTADO));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const l = window.matchMedia(CONSULTA_ACOSTADO);
    const alCambiar = () => setAcostado(l.matches);
    l.addEventListener?.("change", alCambiar);
    return () => l.removeEventListener?.("change", alCambiar);
  }, []);
  return acostado;
}

export function useAltoVisible() {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const raiz = document.documentElement;
    const poner = () => raiz.style.setProperty("--alto-app", `${Math.round(vv.height)}px`);
    poner();
    vv.addEventListener("resize", poner);
    return () => {
      vv.removeEventListener("resize", poner);
      raiz.style.removeProperty("--alto-app");
    };
  }, []);
}

export function useTactil(): boolean {
  const [tactil, setTactil] = useState(() => coincide("(pointer: coarse)"));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const l = window.matchMedia("(pointer: coarse)");
    const alCambiar = () => setTactil(l.matches);
    l.addEventListener?.("change", alCambiar);
    return () => l.removeEventListener?.("change", alCambiar);
  }, []);
  return tactil;
}
