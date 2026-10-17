/** Contratos de autenticación compartidos entre core y ui. */
import { z } from "zod";
import type { ModuleId } from "./modules.js";
import type { PermissionLevel, Role } from "./permissions.js";

/** Ventana de validez de una reautenticación. */
export const REAUTH_WINDOW_MS = 5 * 60 * 1000;

export const REAUTH_METHODS = ["password", "pin", "biometria"] as const;
export type ReauthMethod = (typeof REAUTH_METHODS)[number];

/**
 * Exigencia de una acción: "pin" acepta cualquier método; "fuerte" exige
 * contraseña o biometría (bóveda, root, control remoto, cuentas).
 */
export const REAUTH_REQUIREMENTS = ["pin", "fuerte"] as const;
export type ReauthRequirement = (typeof REAUTH_REQUIREMENTS)[number];

export function isStrongReauthMethod(method: ReauthMethod): boolean {
  return method === "password" || method === "biometria";
}

export interface ReauthState {
  readonly reauthAt: Date | null;
  readonly reauthMethod: ReauthMethod | null;
}

export function reauthSatisfies(state: ReauthState, requirement: ReauthRequirement, now: Date): boolean {
  if (!state.reauthAt || !state.reauthMethod) return false;
  const elapsed = now.getTime() - state.reauthAt.getTime();
  if (elapsed < 0 || elapsed > REAUTH_WINDOW_MS) return false;
  return requirement === "pin" || isStrongReauthMethod(state.reauthMethod);
}

export const pinSchema = z.string().regex(/^\d{6,12}$/, "El PIN debe tener de 6 a 12 dígitos");
export const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .max(256, "La contraseña es demasiado larga");

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido").max(254),
  password: z.string().min(1).max(256),
  /** Código TOTP de la app. Obligatorio para la cuenta maestra. */
  totp: z.preprocess(emptyToUndefined, z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos").optional()),
  /** Nombre del dispositivo, p. ej. "PC de casa". */
  dispositivo: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(10).max(512),
});

export const reauthRequestSchema = z.discriminatedUnion("metodo", [
  z.object({ metodo: z.literal("password"), password: z.string().min(1).max(256) }),
  z.object({ metodo: z.literal("pin"), pin: pinSchema }),
]);
export type ReauthRequest = z.infer<typeof reauthRequestSchema>;

export const setPinRequestSchema = z.object({ pin: pinSchema });

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Segundos de vida del accessToken. */
  readonly expiresIn: number;
}

export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
}

export interface LoginResponse extends AuthTokens {
  readonly usuario: PublicUser;
}

export interface MeResponse {
  readonly usuario: PublicUser;
  readonly permisos: Record<ModuleId, PermissionLevel>;
  readonly tienePin: boolean;
  readonly reauth: { readonly metodo: ReauthMethod | null; readonly hasta: string | null };
}
