/** Estado y conexión (OAuth) de una cuenta de red: Twitch, YouTube, Kick o X. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2, Unlink } from "lucide-react";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";
import { Boton, FaltaConfigurar, Insignia, avisar, avisarError } from "./ui";

export interface CuentaRed {
  plataforma: "twitch" | "youtube" | "kick" | "x" | "tiktok";
  nombre: string;
  configurada: boolean;
  faltan: string[];
  cuenta: string | null;
  urlRetorno: string;
}

export function useCuentas() {
  return useQuery({ queryKey: ["redes", "cuentas"], queryFn: () => api<CuentaRed[]>("/api/redes/cuentas") });
}

export function EstadoCuenta({ c }: { c: CuentaRed }) {
  const conectar = useMutation({
    mutationFn: () => api<{ url: string }>(`/api/redes/oauth/${c.plataforma}/iniciar`, { metodo: "POST" }),
    onSuccess: ({ url }) => {
      abrirExterno(url);
      avisar(`Autoriza en ${c.nombre} y vuelve a la app`, "info");
    },
    onError: avisarError,
  });
  const desconectar = useMutation({
    mutationFn: () => api(`/api/redes/cuentas/${c.plataforma}`, { metodo: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["redes"] }),
    onError: avisarError,
  });

  if (!c.configurada) {
    return (
      <FaltaConfigurar
        variable={c.faltan.join(" y ")}
        detalle={`Crea una app en el portal de desarrolladores de ${c.nombre} con la URL de retorno ${c.urlRetorno} y pon sus datos en el .env del servidor.`}
      />
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm">
        {c.cuenta ? <Insignia tono="ok">Conectada</Insignia> : <Insignia>Sin conectar</Insignia>}
        {c.cuenta ? <span className="font-medium">{c.cuenta}</span> : null}
      </div>
      {c.cuenta ? (
        <Boton
          tamano="sm"
          variante="fantasma"
          icono={Unlink}
          onClick={async () => {
            if (await confirmar({ titulo: `Desconectar ${c.nombre}`, mensaje: "Se borran los tokens guardados." })) desconectar.mutate();
          }}
        >
          Desconectar
        </Boton>
      ) : (
        <Boton tamano="sm" variante="primario" icono={Link2} cargando={conectar.isPending} onClick={() => conectar.mutate()}>
          Conectar
        </Boton>
      )}
    </div>
  );
}
