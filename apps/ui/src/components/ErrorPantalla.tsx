/**
 * Si una pantalla falla, muestra un aviso en vez de dejar todo en negro: el
 * menú sigue funcionando y se puede volver a Inicio o reintentar.
 */
import { Component, type ReactNode } from "react";

interface Estado {
  error: Error | null;
}

export class ErrorPantalla extends Component<{ children: ReactNode }, Estado> {
  override state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h2 className="text-lg font-semibold">Esta pantalla tuvo un problema</h2>
        <p className="mt-2 text-sm text-tenue">
          Puede pasar si la app es más nueva que el servidor: actualiza el VPS con la última versión. También puedes volver a Inicio o reintentar.
        </p>
        <p className="mt-2 break-words rounded-xl bg-superficie p-2 font-mono text-xs text-tenue">{this.state.error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <a href="/" className="rounded-xl bg-acento px-4 py-2 text-sm font-medium text-black">
            Ir a Inicio
          </a>
          <button type="button" className="rounded-xl border border-borde px-4 py-2 text-sm" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}
