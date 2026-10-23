import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Download, Link, MousePointerClick, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CodigoQr, type CodigoQrRef } from "../components/CodigoQr";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Interruptor, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtFecha } from "../lib/formato";
import { useForma } from "../lib/marco";

interface Enlace {
  id: string;
  codigo: string;
  destino: string;
  clics: number;
  activo: boolean;
  creado: string;
}

const corto = (codigo: string) => `${API_BASE || window.location.origin}/l/${codigo}`;
const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["enlaces"] });
const copiar = (codigo: string) => void navigator.clipboard.writeText(corto(codigo)).then(() => avisar("Copiado"));

function Nuevo() {
  const [destino, setDestino] = useState("");
  const [codigo, setCodigo] = useState("");
  const crear = useMutation({
    mutationFn: () => api<{ codigo: string }>("/api/enlaces", { cuerpo: { destino: destino.trim(), codigo: codigo.trim() } }),
    onSuccess: (r) => {
      setDestino("");
      setCodigo("");
      refrescar();
      void navigator.clipboard.writeText(corto(r.codigo)).then(
        () => avisar("Enlace creado y copiado"),
        () => avisar("Enlace creado"),
      );
    },
    onError: avisarError,
  });
  return (
    <Tarjeta titulo="Nuevo enlace" icono={Plus}>
      <form
        className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <Campo etiqueta="Enlace largo">
          <Entrada value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="https://www.instagram.com/…" inputMode="url" required />
        </Campo>
        <Campo etiqueta="Nombre corto (opcional)">
          <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} placeholder="pasteles" maxLength={40} />
        </Campo>
        <Boton type="submit" variante="primario" icono={Link} cargando={crear.isPending}>
          Acortar y copiar
        </Boton>
      </form>
      <p className="mt-2 truncate text-xs text-tenue">{`Quedará así: ${corto(codigo || "abc123")}`}</p>
    </Tarjeta>
  );
}

function Detalle({ l, puede, alVolver }: { l: Enlace; puede: boolean; alVolver?: () => void }) {
  const qr = useRef<CodigoQrRef>(null);
  const [editando, setEditando] = useState(false);
  const [destino, setDestino] = useState(l.destino);
  useEffect(() => {
    setDestino(l.destino);
    setEditando(false);
  }, [l.id, l.destino]);
  const cambiar = useMutation({ mutationFn: (cuerpo: { activo?: boolean; destino?: string }) => api(`/api/enlaces/${l.id}`, { metodo: "PATCH", cuerpo }), onSuccess: refrescar, onError: avisarError });
  const borrar = useMutation({ mutationFn: () => api(`/api/enlaces/${l.id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  const dias = Math.max(1, Math.ceil((Date.now() - new Date(l.creado).getTime()) / 86_400_000));
  return (
    <div className="space-y-4">
      <Tarjeta
        titulo={
          <span className="flex min-w-0 items-center gap-2">
            {alVolver ? <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Volver" onClick={alVolver} /> : null}
            <span className="truncate font-mono">/{l.codigo}</span>
          </span>
        }
        acciones={puede ? <Interruptor activo={l.activo} alCambiar={(v) => cambiar.mutate({ activo: v })} etiqueta={l.activo ? "Activo" : "Apagado"} /> : null}
      >
        <p className="break-all font-mono text-sm">{corto(l.codigo)}</p>
        <p className="mt-1 break-all text-xs text-tenue">→ {l.destino}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-fondo p-3">
            <MousePointerClick className="h-4 w-4 text-acento" />
            <p className="mt-1 text-2xl font-bold tabular-nums">{l.clics}</p>
            <p className="text-[11px] text-tenue">Clics en total</p>
          </div>
          <div className="rounded-xl bg-fondo p-3">
            <p className="text-2xl font-bold tabular-nums">{(l.clics / dias).toFixed(1)}</p>
            <p className="text-[11px] text-tenue">Clics por día</p>
          </div>
          <div className="rounded-xl bg-fondo p-3">
            <p className="text-sm font-bold">{fmtFecha(l.creado)}</p>
            <p className="text-[11px] text-tenue">{dias === 1 ? "Creado hoy" : `Creado hace ${dias} días`}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Boton icono={Copy} onClick={() => copiar(l.codigo)}>
            Copiar
          </Boton>
          {puede ? (
            <Boton icono={Pencil} onClick={() => setEditando((v) => !v)}>
              Cambiar a dónde lleva
            </Boton>
          ) : null}
          {puede ? (
            <Boton
              variante="fantasma"
              icono={Trash2}
              onClick={async () => {
                if (await confirmar({ titulo: "Borrar enlace", mensaje: `${corto(l.codigo)} dejará de funcionar.`, boton: "Borrar" })) {
                  borrar.mutate();
                  alVolver?.();
                }
              }}
            >
              Borrar
            </Boton>
          ) : null}
        </div>
        {editando ? (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              cambiar.mutate({ destino: destino.trim() }, { onSuccess: () => setEditando(false) });
            }}
          >
            <Entrada value={destino} onChange={(e) => setDestino(e.target.value)} inputMode="url" required />
            <Boton type="submit" variante="primario" cargando={cambiar.isPending} disabled={!destino.trim() || destino.trim() === l.destino}>
              Guardar
            </Boton>
          </form>
        ) : null}
      </Tarjeta>
      <Tarjeta
        titulo="Su QR"
        acciones={
          <Boton tamano="sm" icono={Download} onClick={() => void qr.current?.descargar(`qr-${l.codigo}`).catch(avisarError)}>
            Descargar
          </Boton>
        }
      >
        <div className="mx-auto w-fit rounded-xl bg-white p-4">
          <CodigoQr ref={qr} datos={corto(l.codigo)} tamano={180} />
        </div>
        <p className="mt-2 text-xs text-tenue">El QR lleva al enlace corto: si cambias a dónde lleva, el QR sigue sirviendo.</p>
      </Tarjeta>
    </div>
  );
}

export default function Enlaces() {
  const puede = usePuede("enlaces", "escritura");
  const forma = useForma();
  const lista = useQuery({ queryKey: ["enlaces"], queryFn: () => api<Enlace[]>("/api/enlaces") });
  const [buscar, setBuscar] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const filtrados = (lista.data ?? []).filter((l) => !buscar || `${l.codigo} ${l.destino}`.toLowerCase().includes(buscar.toLowerCase()));
  const pg = usePaginado(filtrados, 12);
  const actual = lista.data?.find((l) => l.id === elegido) ?? (forma === "pc" ? filtrados[0] : undefined);
  const angosto = forma !== "pc";

  if (angosto && actual) return <Detalle l={actual} puede={puede} alVolver={() => setElegido(null)} />;

  return (
    <div className="space-y-4">
      <Encabezado titulo="Enlaces cortos" descripcion="Convierte un enlace largo en uno corto de tu dominio y mira cuántas veces lo abren." />
      {puede ? <Nuevo /> : null}
      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      {lista.data?.length === 0 ? <Vacio icono={Link} texto="Todavía no tienes enlaces cortos." /> : null}
      {lista.data?.length ? (
        <div className={cx("grid gap-4", angosto ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]")}>
          <div className="min-w-0 space-y-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-borde bg-superficie px-3">
              <Search className="h-4 w-4 text-tenue" />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar enlace" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            {pg.visibles.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setElegido(l.id)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                  actual?.id === l.id ? "border-acento bg-[color-mix(in_srgb,var(--acento)_8%,var(--superficie))]" : "border-borde bg-superficie hover:bg-tarjeta",
                )}
              >
                <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", l.activo ? "bg-ok" : "bg-borde")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-medium">/{l.codigo}</span>
                  <span className="block truncate text-xs text-tenue">{l.destino}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums">{l.clics}</span>
                  <span className="block text-[11px] text-tenue">clics</span>
                </span>
              </button>
            ))}
            {pg.paginas}
          </div>
          {!angosto && actual ? <Detalle l={actual} puede={puede} /> : null}
        </div>
      ) : null}
    </div>
  );
}
