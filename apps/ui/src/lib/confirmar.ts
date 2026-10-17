/**
 * Confirmaciones. Las acciones peligrosas usan doble confirmación: primero
 * "Continuar" y después escribir el texto exacto que se muestra.
 */
import { create } from "zustand";

export interface PedidoConfirmacion {
  titulo: string;
  mensaje: string;
  /** Detalle exacto de lo que se hará (p. ej. el comando). */
  detalle?: string;
  peligroso?: boolean;
  /** Texto que hay que escribir en la segunda confirmación (solo si peligroso). */
  textoExacto?: string;
  boton?: string;
}

interface ConfirmarState {
  pedido: PedidoConfirmacion | null;
  resolver: ((ok: boolean) => void) | null;
  terminar(ok: boolean): void;
}

export const useConfirmar = create<ConfirmarState>()((set, get) => ({
  pedido: null,
  resolver: null,
  terminar(ok) {
    get().resolver?.(ok);
    set({ pedido: null, resolver: null });
  },
}));

export function confirmar(pedido: PedidoConfirmacion): Promise<boolean> {
  return new Promise((resolve) => useConfirmar.setState({ pedido, resolver: resolve }));
}
