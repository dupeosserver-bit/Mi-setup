/** Enlaces cortos de tu dominio (/l/<codigo>) con contador de clics. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Link, Plus, QrCode, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Interruptor, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtFecha } from "../lib/formato";

interface Enlace {
  id: string;
  codigo: string;
  destino: string;
  clics: number;
  activo: boolean;
  creado: string;
}

const corto = (codigo: string) => `${API_BASE || window.location.origin}/l/${codigo}`;

export default function Enlaces() {
  const puede = usePuede("enlaces", "escritura");
  const navegar = useNavigate();
  const lista = useQuery({ queryKey: ["enlaces"], queryFn: () => api<Enlace[]>("/api/enlaces") });
  const [destino, setDestino] = useState("");
  const [codigo, setCodigo] = useState("");
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["enlaces"] });
  const crear = useMutation({
    mutationFn: () => api<{ codigo: string }>("/api/enlaces", { cuerpo: { destino: destino.trim(), codigo: codigo.trim() } }),
    onSuccess: (r) => {
      setDestino("");
      setCodigo("");
      refrescar();
      void navigator.clipboard.writeText(corto(r.codigo)).then(() => avisar("Enlace creado y copiado"), () => avisar("Enlace creado"));
    },
    onError: avisarError,
  });
  const cambiar = useMutation({ mutationFn: ({ id, activo }: { id: string; activo: boolean }) => api(`/api/enlaces/${id}`, { metodo: "PATCH", cuerpo: { activo } }), onSuccess: refrescar, onError: avisarError });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/enlaces/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });

  return (
    <div className="space-y-4">
      <Encabezado titulo="Enlaces cortos" descripcion="Convierte un enlace largo en uno corto de tu dominio y mira cuántas veces lo abren." />
      {puede ? (
        <Tarjeta titulo="Nuevo enlace" icono={Plus}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              crear.mutate();
            }}
          >
            <Campo etiqueta="Enlace largo">
              <Entrada value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="https://www.instagram.com/…" inputMode="url" required />
            </Campo>
            <Campo etiqueta="Nombre corto (opcional)" ayuda={`Quedará así: ${corto(codigo || "abc123")}`}>
              <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} placeholder="pasteles" maxLength={40} />
            </Campo>
            <Boton type="submit" variante="primario" icono={Link} cargando={crear.isPending}>
              Acortar
            </Boton>
          </form>
        </Tarjeta>
      ) : null}
      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      {lista.data?.length === 0 ? <Vacio icono={Link} texto="Todavía no tienes enlaces cortos." /> : null}
      <div className="space-y-2">
        {lista.data?.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-medium">{corto(l.codigo)}</p>
              <p className="truncate text-xs text-tenue">→ {l.destino}</p>
              <p className="text-xs text-tenue">
                {l.clics} clic{l.clics === 1 ? "" : "s"} · {fmtFecha(l.creado)}
              </p>
            </div>
            <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Copiar" onClick={() => void navigator.clipboard.writeText(corto(l.codigo)).then(() => avisar("Copiado"))} />
            <Boton tamano="icono" variante="fantasma" icono={QrCode} aria-label="Hacer QR" title="Hacer un QR con este enlace" onClick={() => navegar("/herramientas")} />
            {puede ? (
              <>
                <Interruptor activo={l.activo} alCambiar={(v) => cambiar.mutate({ id: l.id, activo: v })} etiqueta={l.activo ? "Activo" : "Apagado"} />
                <Boton
                  tamano="icono"
                  variante="fantasma"
                  icono={Trash2}
                  aria-label="Borrar"
                  onClick={async () => {
                    if (await confirmar({ titulo: "Borrar enlace", mensaje: `${corto(l.codigo)} dejará de funcionar.`, boton: "Borrar" })) borrar.mutate(l.id);
                  }}
                />
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
