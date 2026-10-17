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
      name: "mi-setup.sesion",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ refreshToken: s.refreshToken, usuario: s.usuario }),
    },
  ),
);
