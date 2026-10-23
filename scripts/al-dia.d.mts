// Tipos de scripts/al-dia.mjs para las pruebas de core.
export function partirVersion(texto: string): { version: string; etapa: string };
export function versionAndroid(gradle: string, completa: string): string;
export function readmeAlDia(readme: string, version: string, etapa: string): string;
