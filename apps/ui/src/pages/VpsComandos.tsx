/** Comandos guardados con confirmación (doble si son peligrosos). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ListChecks, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Selector, Tarjeta, Vacio, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { SelectorServidor, useServidores } from "../lib/vps";

interface Comando {
  id: string;
  nombre: string;
  comando: string;
  descripcion: string;
  servidorId: string | null;
  peligroso: boolean;
  motivos: string[];
}

interface Resultado {
  codigo: number | null;
  salida: string;
  error: string;
  truncado: boolean;
  duracionMs: number;
}

function Formulario({ inicial, alTerminar }: { inicial: Comando | null; alTerminar: () => void }) {
  const servidores = useServidores();
  const [d, setD] = useState({ nombre: inicial?.nombre ?? "", comando: inicial?.comando ?? "", descripcion: inicial?.descripcion ?? "", servidorId: inicial?.servidorId ?? "" });
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { ...d, servidorId: d.servidorId || null };
      return inicial ? api(`/api/vps/comandos/${inicial.id}`, { metodo: "PATCH", cuerpo }) : api("/api/vps/comandos", { cuerpo });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vps", "comandos"] });
      alTerminar();
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <Campo etiqueta="Nombre del botón">
        <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required placeholder="Respaldo con vps-manager" />
      </Campo>
      <Campo etiqueta="Comando">
        <AreaTexto value={d.comando} onChange={(e) => setD({ ...d, comando: e.target.value })} required className="font-mono text-xs" placeholder="bash /root/vps-manager.sh backup" />
      </Campo>
      <Campo etiqueta="Descripción (opcional)">
        <Entrada value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} />
      </Campo>
      <Campo etiqueta="Servidor por defecto">
        <Selector value={d.servidorId} onChange={(e) => setD({ ...d, servidorId: e.target.value })}>
          <option value="">Elegir al ejecutar</option>
          {servidores.data?.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </Selector>
      </Campo>
      <ErrorCaja error={guardar.error} />
      <Boton type="submit" variante="primario" className="w-full" cargando={guardar.isPending}>Guardar</Boton>
    </form>
  );
}

export default function VpsComandos() {
  const esAdmin = usePuede("vps_comandos", "administrar");
  const puedeEjecutar = usePuede("vps_comandos", "escritura");
  const servidores = useServidores();
  const [servidor, setServidor] = useState<string | null>(null);
  const [editando, setEditando] = useState<Comando | null | "nuevo">(null);
  const [resultado, setResultado] = useState<{ comando: Comando; r: Resultado } | null>(null);
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["vps", "comandos"], queryFn: () => api<Comando[]>("/api/vps/comandos") });

  const ejecutar = async (c: Comando) => {
    const destino = c.servidorId ?? servidor;
    if (!destino) return;
    const nombreServidor = servidores.data?.find((s) => s.id === destino)?.nombre ?? "el servidor";
    const ok = await confirmar({
      titulo: `Ejecutar "${c.nombre}"`,
      mensaje: `Se ejecutará en ${nombreServidor}:`,
      detalle: c.peligroso ? `${c.comando}\n\nRiesgo: ${c.motivos.join(", ")}` : c.comando,
      peligroso: c.peligroso,
      textoExacto: c.nombre,
      boton: "Ejecutar",
    });
    if (!ok) return;
    setCorriendo(c.id);
    try {
      const r = await api<Resultado>(`/api/vps/comandos/${c.id}/ejecutar`, { cuerpo: { servidorId: destino, ...(c.peligroso ? { confirmacion: c.nombre } : {}) } });
      setResultado({ comando: c, r });
    } catch (err) {
      avisarError(err);
    } finally {
      setCorriendo(null);
    }
  };

  return (
    <>
      <Encabezado
        titulo="Comandos guardados"
        descripcion="Los peligrosos (rm -rf, dd, mkfs, reboot, iptables -F…) piden escribir el nombre del botón y tu contraseña o huella."
        acciones={
          <>
            <SelectorServidor valor={servidor} alCambiar={setServidor} />
            {esAdmin ? <Boton variante="primario" icono={Plus} onClick={() => setEditando("nuevo")}>Comando</Boton> : null}
          </>
        }
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      {data?.length === 0 ? <Vacio icono={ListChecks} texto="Crea botones para tus scripts, por ejemplo vps-manager.sh." /> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((c) => (
          <Tarjeta
            key={c.id}
            titulo={c.nombre}
            acciones={
              esAdmin ? (
                <>
                  <Boton tamano="icono" variante="fantasma" icono={Pencil} onClick={() => setEditando(c)} aria-label="Editar" />
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Borrar"
                    onClick={async () => {
                      if (await confirmar({ titulo: "Borrar comando", mensaje: `¿Borrar "${c.nombre}"?` })) {
                        await api(`/api/vps/comandos/${c.id}`, { metodo: "DELETE" }).catch(avisarError);
                        await queryClient.invalidateQueries({ queryKey: ["vps", "comandos"] });
                      }
                    }}
                  />
                </>
              ) : null
            }
          >
            {c.descripcion ? <p className="mb-2 text-xs text-tenue">{c.descripcion}</p> : null}
            <pre className="mb-3 overflow-x-auto rounded-lg bg-fondo p-2 font-mono text-xs">{c.comando}</pre>
            <div className="flex items-center justify-between gap-2">
              {c.peligroso ? (
                <Insignia tono="peligro">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Peligroso
                </Insignia>
              ) : (
                <span />
              )}
              {puedeEjecutar ? (
                <Boton tamano="sm" variante={c.peligroso ? "peligro" : "primario"} icono={Play} cargando={corriendo === c.id} onClick={() => void ejecutar(c)}>
                  Ejecutar
                </Boton>
              ) : null}
            </div>
          </Tarjeta>
        ))}
      </div>
      <Modal abierto={editando !== null} titulo={editando === "nuevo" ? "Nuevo comando" : "Editar comando"} alCerrar={() => setEditando(null)}>
        {editando !== null ? <Formulario inicial={editando === "nuevo" ? null : editando} alTerminar={() => setEditando(null)} /> : null}
      </Modal>
      <Modal abierto={resultado !== null} titulo={resultado ? `Resultado: ${resultado.comando.nombre}` : ""} alCerrar={() => setResultado(null)} ancho="max-w-3xl">
        {resultado ? (
          <div className="space-y-3 text-sm">
            <p className="text-tenue">
              Código de salida: <Insignia tono={resultado.r.codigo === 0 ? "ok" : "peligro"}>{String(resultado.r.codigo)}</Insignia> · {(resultado.r.duracionMs / 1000).toFixed(1)} s
              {resultado.r.truncado ? " · salida recortada" : ""}
            </p>
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-fondo p-3 font-mono text-xs">{resultado.r.salida || "(sin salida)"}</pre>
            {resultado.r.error ? <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-peligro/10 p-3 font-mono text-xs text-peligro">{resultado.r.error}</pre> : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
