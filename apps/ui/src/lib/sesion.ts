/** Sesión del usuario. Solo el refresh token y el usuario se guardan en el dispositivo. */
import type { LoginResponse, PublicUser } from "@mi-setup/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SesionState {
  accessToken: string | null;
  refreshToken: string | null;
  usuario: PublicUser | null;
  guardar(r: LoginResponse): void;
  salir(): void;
}

/**
 * La demo y la versión web viven en la misma dirección (misetup.…/demo y /app):
 * cada una guarda su sesión aparte para que /app no abra con la sesión de mentira de la demo.
 */
export const CLAVE_SESION = import.meta.env.VITE_DEMO === "1" ? "mi-setup.demo.sesion" : import.meta.env.VITE_WEB === "1" ? "mi-setup.web.sesion" : "mi-setup.sesion";

export const useSesion = create<SesionState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      usuario: null,
      guardar: (r) => set({ accessToken: r.accessToken, refreshToken: r.refreshToken, usuario: r.usuario }),
      salir: () => set({ accessToken: null, refreshToken: null, usuario: null }),
    }),
    {
      name: CLAVE_SESION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ refreshToken: s.refreshToken, usuario: s.usuario }),
    },
  ),
);
