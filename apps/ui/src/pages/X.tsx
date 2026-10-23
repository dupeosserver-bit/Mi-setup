import { useMutation, useQuery } from "@tanstack/react-query";
import { AtSign, ExternalLink, Send } from "lucide-react";
import { useState } from "react";
import { EstadoCuenta, EtiquetaInvitados, useCuentas } from "../components/CuentaRed";
import { AreaTexto, Boton, Cargando, Encabezado, ErrorCaja, Pestanas, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";
import { localeActual } from "../lib/idioma";
import { useForma } from "../lib/marco";

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
interface Publicado {
  url: string;
  texto: string;
  fecha: string;
}

const LIMITE = 280;

function Contador({ usados }: { usados: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, usados / LIMITE);
  const color = usados > LIMITE - 20 ? "var(--error)" : usados > LIMITE - 60 ? "var(--aviso)" : "var(--acento)";
  return (
    <span className="relative grid h-8 w-8 place-items-center" title={`${usados}/${LIMITE}`}>
      <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90">
        <circle cx="14" cy="14" r={r} fill="none" stroke="var(--borde)" strokeWidth="3" />
        <circle cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - p)} strokeLinecap="round" />
      </svg>
      {usados > LIMITE - 20 ? <span className="text-[10px] font-semibold">{LIMITE - usados}</span> : null}
    </span>
  );
}

function Dato({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-fondo p-2.5 text-center">
      <p className="truncate text-base font-bold">{valor}</p>
      <p className="truncate text-[11px] text-tenue">{texto}</p>
    </div>
  );
}

export default function X() {
  const cuentas = useCuentas();
  const forma = useForma();
  const cuenta = cuentas.data?.find((c) => c.plataforma === "x");
  const puedeEscribir = usePuede("x", "escritura");
  const estimacion = useQuery({ queryKey: ["redes", "x", "estimacion"], queryFn: () => api<Estimacion>("/api/x/estimacion") });
  const [texto, setTexto] = useState("");
  const [menciones, setMenciones] = useState<Mencion[] | null>(null);
  const [publicados, setPublicados] = useState<Publicado[]>([]);
  const [gasto, setGasto] = useState(0);
  const [pestana, setPestana] = useState<"publicar" | "menciones">("publicar");

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
      setPublicados((p) => [{ url: r.url, texto, fecha: new Date().toISOString() }, ...p]);
      setGasto((g) => g + (estimacion.data?.publicarUsd ?? 0));
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
    onSuccess: (r) => {
      if (!r) return;
      setMenciones(r);
      setGasto((g) => g + (estimacion.data?.leerPorMencionUsd ?? 0) * r.length);
    },
    onError: avisarError,
  });

  const perfil = cuenta ? (
    <section className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="h-24 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--acento)_70%,#1d1a2b),#14121c)]" />
      <div className="-mt-9 space-y-3 p-4">
        <span className="grid h-16 w-16 place-items-center rounded-full border-4 border-superficie bg-tarjeta text-xl font-bold">
          <AtSign className="h-7 w-7 text-acento" />
        </span>
        <div>
          <p className="truncate text-lg font-bold">{cuenta.cuenta ?? "Sin conectar"}</p>
          <p className="text-xs text-tenue">X (Twitter) · pago por uso</p>
        </div>
        <EstadoCuenta c={cuenta} />
        <div className="grid grid-cols-3 gap-2">
          <Dato valor={String(publicados.length)} texto="Publicados" />
          <Dato valor={menciones ? String(menciones.length) : "—"} texto="Menciones" />
          <Dato valor={`$${gasto.toFixed(3)}`} texto="Gasto aquí" />
        </div>
        <div className="space-y-1 rounded-xl bg-fondo p-3 text-xs text-tenue">
          <p>{`Publicar cuesta ≈ ${estimacion.data?.publicarUsd ?? "?"} USD`}</p>
          <p>{`Leer cuesta ≈ ${estimacion.data?.leerPorMencionUsd ?? "?"} USD por mención`}</p>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-tenue">Quién puede entrar</p>
          <EtiquetaInvitados />
        </div>
      </div>
    </section>
  ) : null;

  const caja = puedeEscribir ? (
    <Tarjeta titulo="Publicar">
      <AreaTexto rows={5} maxLength={LIMITE} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué quieres publicar?" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-tenue">{`≈ ${estimacion.data?.publicarUsd ?? "?"} USD · la IA puede redactar y tú apruebas`}</span>
        <div className="flex items-center gap-2">
          <Contador usados={texto.length} />
          <Boton variante="primario" icono={Send} disabled={!texto.trim()} cargando={publicar.isPending} onClick={() => publicar.mutate()}>
            Publicar
          </Boton>
        </div>
      </div>
    </Tarjeta>
  ) : null;

  const listaPublicados = (
    <Tarjeta titulo="Lo que publicaste">
      {publicados.length === 0 ? <p className="text-sm text-tenue">Lo que publiques desde aquí aparece en esta lista.</p> : null}
      <div className="space-y-2">
        {publicados.map((p) => (
          <div key={p.url} className="rounded-xl bg-fondo p-3 text-sm">
            <p className="whitespace-pre-wrap break-words">{p.texto}</p>
            <div className="mt-1.5 flex items-center justify-between text-xs text-tenue">
              <span>{new Date(p.fecha).toLocaleTimeString(localeActual(), { hour: "2-digit", minute: "2-digit" })}</span>
              <button type="button" className="inline-flex items-center gap-1 text-acento" onClick={() => abrirExterno(p.url)}>
                Ver en X <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Tarjeta>
  );

  const listaMenciones = (
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
          <div key={m.id} className="rounded-xl bg-fondo p-3 text-sm">
            <p className="text-xs text-tenue">
              @{m.autor}
              {m.fecha ? ` · ${new Date(m.fecha).toLocaleString(localeActual())}` : ""}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">{m.texto}</p>
          </div>
        ))}
      </div>
    </Tarjeta>
  );

  return (
    <div className="space-y-4">
      <Encabezado titulo="X" descripcion="Pago por uso: antes de cada acción ves el costo estimado." />
      {cuentas.isLoading ? <Cargando /> : null}
      <ErrorCaja error={cuentas.error} />
      {cuenta ? (
        <div className={cx("grid gap-4", forma === "pc" ? "grid-cols-[300px_minmax(0,1fr)_minmax(0,0.9fr)]" : forma === "tablet" ? "grid-cols-[260px_minmax(0,1fr)]" : "grid-cols-1")}>
          {perfil}
          {cuenta.cuenta ? (
            forma === "pc" ? (
              <>
                <div className="min-w-0 space-y-4">
                  {caja}
                  {listaPublicados}
                </div>
                <div className="min-w-0">{listaMenciones}</div>
              </>
            ) : (
              <div className="min-w-0 space-y-3">
                <Pestanas
                  valor={pestana}
                  alCambiar={setPestana}
                  opciones={[
                    { id: "publicar", texto: "Publicar" },
                    { id: "menciones", texto: "Menciones" },
                  ]}
                />
                {pestana === "publicar" ? (
                  <div className="space-y-4">
                    {caja}
                    {listaPublicados}
                  </div>
                ) : (
                  listaMenciones
                )}
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
