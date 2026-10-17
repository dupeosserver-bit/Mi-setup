import { can, type MeResponse, type ModuleId, type PermissionLevel } from "@mi-setup/shared";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { useSesion } from "./sesion";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (n, error) => !(error instanceof ApiError && error.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
});

export function useMe() {
  const hay = useSesion((s) => Boolean(s.refreshToken));
  return useQuery({ queryKey: ["me"], queryFn: () => api<MeResponse>("/api/auth/me"), enabled: hay, staleTime: 60_000 });
}

/** ¿El usuario actual tiene al menos ese nivel en el módulo? */
export function usePuede(modulo: ModuleId, nivel: Exclude<PermissionLevel, "ninguno"> = "lectura"): boolean {
  const { data } = useMe();
  if (!data) return false;
  return can(
    { role: data.usuario.role, isActive: true, permissions: data.permisos },
    modulo,
    nivel,
  );
}

export interface Apariencia {
  logo: string | null;
  fondo: string | null;
  avatar: string | null;
}

export function useApariencia() {
  const hay = useSesion((s) => Boolean(s.refreshToken));
  return useQuery({ queryKey: ["apariencia"], queryFn: () => api<Apariencia>("/api/apariencia"), enabled: hay });
}
