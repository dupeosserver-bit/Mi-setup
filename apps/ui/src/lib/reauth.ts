/** Diálogo global de reautenticación (5 min). Lo abre api.ts cuando el servidor lo pide. */
import type { ReauthRequirement } from "@mi-setup/shared";
import { create } from "zustand";

interface ReauthState {
  abierto: boolean;
  metodo: ReauthRequirement;
  resolver: (() => void) | null;
  rechazar: ((e: Error) => void) | null;
  terminar(ok: boolean): void;
}

export const useReauth = create<ReauthState>()((set, get) => ({
  abierto: false,
  metodo: "fuerte",
  resolver: null,
  rechazar: null,
  terminar(ok) {
    const { resolver, rechazar } = get();
    set({ abierto: false, resolver: null, rechazar: null });
    if (ok) resolver?.();
    else rechazar?.(new Error("Reautenticación cancelada"));
  },
}));

let pendiente: Promise<void> | null = null;

export function pedirReauth(metodo: ReauthRequirement): Promise<void> {
  pendiente ??= new Promise<void>((resolve, reject) => {
    useReauth.setState({ abierto: true, metodo, resolver: resolve, rechazar: reject });
  }).finally(() => {
    pendiente = null;
  });
  return pendiente;
}
