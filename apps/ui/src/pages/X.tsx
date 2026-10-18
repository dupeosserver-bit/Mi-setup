/** X (Twitter): publicar y leer menciones con pago por uso; siempre muestra el costo estimado antes. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { AtSign, Send } from "lucide-react";
import { useState } from "react";
import { EstadoCuenta, useCuentas } from "../components/CuentaRed";
import { AreaTexto, Boton, Cargando, Encabezado, ErrorCaja, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";

interface Estimacion {
  publicarUsd: number;
  leerPorMencionUsd: number;
}
interface Mencion {
  id: string;
  texto: string;
  autor: string;
  fecha: string | null;
}

export default function X() {
  const cuentas = useCuentas();
  const cuenta = cuentas.data?.find((c) => c.plataforma === "x");
  const puedeEscribir = usePuede("x", "escritura");
  const estimacion = useQuery({ queryKey: ["redes", "x", "estimacion"], queryFn: () => api<Estimacion>("/api/x/estimacion") });
  const [texto, setTexto] = useState("");
  const [menciones, setMenciones] = useState<Mencion[] | null>(null);

  const publicar = useMutation({
    mutationFn: async () => {
      const ok = await confirmar({
        titulo: "Publicar en X",
        mensaje: `Costo estimado: ${estimacion.data?.publicarUsd ?? "?"} USD (pago por uso).`,
        detalle: texto,
        boton: "Publicar",
      });
      if (!ok) return null;
      return api<{ url: string }>("/api/x/publicar", { metodo: "POST", cuerpo: { texto, costoAceptado: true } });
    },
    onSuccess: (r) => {
      if (!r) return;
      setTexto("");
      avisar("Publicado en X");
      abrirExterno(r.url);
    },
    onError: avisarError,
  });

  const leer = useMutation({
    mutationFn: async () => {
      const cantidad = 10;
      const ok = await confirmar({
        titulo: "Leer menciones",
        mensaje: `Hasta ${cantidad} menciones. Costo estimado: hasta ${((estimacion.data?.leerPorMencionUsd ?? 0) * cantidad).toFixed(3)} USD.`,
        boton: "Leer",
      });
      if (!ok) return null;
      return api<Mencion[]>("/api/x/menciones", { metodo: "POST", cuerpo: { cantidad, costoAceptado: true } });
    },
    onSuccess: (r) => r && setMenciones(r),
    onError: avisarError,
  });

  return (
    <div className="space-y-4">
      <Encabezado titulo="X" descripcion="Pago por uso: antes de cada acción ves el costo estimado. La IA puede redactar; tú apruebas." />
      {cuentas.isLoading ? <Cargando /> : null}
      <ErrorCaja error={cuentas.error} />
      {cuenta ? (
        <Tarjeta titulo="Cuenta">
          <EstadoCuenta c={cuenta} />
        </Tarjeta>
      ) : null}
      {cuenta?.cuenta ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {puedeEscribir ? (
            <Tarjeta titulo="Publicar">
              <AreaTexto rows={4} maxLength={280} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué quieres publicar?" />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-tenue">
                  {texto.length}/280 · ≈{estimacion.data?.publicarUsd ?? "?"} USD
                </span>
                <Boton variante="primario" icono={Send} disabled={!texto.trim()} cargando={publicar.isPending} onClick={() => publicar.mutate()}>
                  Publicar
                </Boton>
              </div>
            </Tarjeta>
          ) : null}
          <Tarjeta
            titulo="Menciones"
            acciones={
              <Boton tamano="sm" icono={AtSign} cargando={leer.isPending} onClick={() => leer.mutate()}>
                Leer
              </Boton>
            }
          >
            {menciones === null ? <p className="text-sm text-tenue">Las menciones solo se piden cuando tocas Leer (cada lectura cuesta).</p> : null}
            {menciones?.length === 0 ? <Vacio texto="Sin menciones recientes." /> : null}
            <div className="space-y-2">
              {menciones?.map((m) => (
                <div key={m.id} className="rounded-xl bg-tarjeta p-3 text-sm">
                  <p className="text-xs text-tenue">
                    @{m.autor}
                    {m.fecha ? ` · ${new Date(m.fecha).toLocaleString("es-MX")}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{m.texto}</p>
                </div>
              ))}
            </div>
          </Tarjeta>
        </div>
      ) : null}
    </div>
  );
}
