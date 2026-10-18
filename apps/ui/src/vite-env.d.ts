/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de la API cuando la UI no se sirve desde el mismo dominio (app de Android). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Versión de la app (package.json), puesta por Vite al compilar. */
declare const __VERSION_APP__: string;
