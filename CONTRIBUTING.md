# Cómo contribuir a Mi Setup

¡Gracias por querer mejorar Mi Setup! Algunas reglas para que todo siga siendo seguro y fácil de usar:

## Reglas del proyecto

1. **Todo en español** para quien usa la app: textos, errores y ayuda, con palabras sencillas.
2. **Nunca subas secretos**: ni claves de API, ni tokens, ni contraseñas, ni tu `.env`. Todo secreto se lee de variables de entorno o de Ajustes → Servicios y claves.
3. **La IA solo propone**: cualquier acción que cambie algo en un servidor se ejecuta únicamente cuando la persona toca «Aprobar».
4. **Permisos**: cada ruta nueva de la API declara su acceso (`config: { acceso: … }`); si falta, el servidor no arranca.
5. **Acciones peligrosas** (borrar, restaurar, tocar el sistema) piden confirmación y reautenticación.
6. **Pruebas**: agrega pruebas para lo nuevo (`apps/core/test`, `packages/shared/test`, `apps/ui/src/**/*.test.ts`).

## Antes de mandar tu cambio

```bash
pnpm -r test
pnpm lint
pnpm -r exec tsc --noEmit
```

Explica en tu PR qué cambia y cómo lo probaste. Si agregas una decisión importante, anótala en `docs/SUPUESTOS.md`; si cambia cómo se usa algo, en `docs/USO.md` y en la ayuda de la app (`apps/ui/src/lib/ayuda.ts`).
