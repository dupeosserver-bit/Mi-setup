/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de la API cuando la UI no se sirve desde el mismo dominio (app de Android). */
  readonly VITE_API_URL?: string;
  /** "publica" compila la edición de la comunidad (sin los apartados personales). */
  readonly VITE_EDICION?: string;
  /** "1" compila la demo pública (sin servidor, datos de ejemplo). */
  readonly VITE_DEMO?: string;
  /** "1" en la versión web de la página oficial (/app): se elige el servidor al entrar. */
  readonly VITE_WEB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Versión de la app (package.json), puesta por Vite al compilar. */
declare const __VERSION_APP__: string;

/** Motor de semillas (Cubiomes en WebAssembly): no trae tipos; los usa lib/semillas.ts. */
declare module "seedmaps-engine-wasm" {
  const crear: () => Promise<unknown>;
  export default crear;
}
