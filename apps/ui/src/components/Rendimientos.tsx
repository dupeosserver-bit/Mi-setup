/**
 * Mis finanzas → Rendimientos: cuánto meter para ganar cierta cantidad por
 * semana, mes o año (o cuánto ganas con lo que tienes), con la tasa de hoy de
 * cada opción de México y cuál conviene más.
 */
import { gananciaProducto, montoParaMeta, type Periodo, type ProductoRendimiento, type TasaVigente } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Pencil, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";
import { Boton, Campo, Cargando, Entrada, ErrorCaja, FaltaConfigurar, Insignia, Interruptor, Modal, Pestanas, Tarjeta, avisar, avisarError, cx } from "./ui";
import { localeActual } from "../lib/idioma";

interface Respuesta {
  actualizado: string | null;
  banxico: boolean;
  tasaObjetivo: { tasa: number; fecha: string } | null;
  productos: ProductoRendimiento[];
  tasas: TasaVigente[];
}

const dinero = (n: number) => `$${n.toLocaleString(localeActual(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: "semana", texto: "Por semana" },
  { id: "mes", texto: "Por mes" },
  { id: "anio", texto: "Por año" },
];
const TEXTO_PERIODO: Record<Periodo, string> = { semana: "a la semana", mes: "al mes", anio: "al año" };
const ESTADO: Record<TasaVigente["estado"], { texto: string; tono: "ok" | "neutro" | "aviso" | "peligro" }> = {
  actualizada: { texto: "Actualizada", tono: "ok" },
  referencia: { texto: "Último dato", tono: "aviso" },
  manual: { texto: "Tuya", tono: "neutro" },
  "sin-dato": { texto: "Sin dato", tono: "peligro" },
};
const fecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString(localeActual(), { day: "numeric", month: "short", year: "numeric" });

export function Rendimientos() {
  const puede = usePuede("finanzas_personales", "escritura");
  const q = useQuery({ queryKey: ["finanzas-personales", "rendimientos"], queryFn: () => api<Respuesta>("/api/rendimientos") });
  const [modo, setModo] = useState<"meta" | "tengo">("meta");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [cantidad, setCantidad] = useState("1000");
  const [sinCondiciones, setSinCondiciones] = useState(false);
  const [corregir, setCorregir] = useState<{ p: ProductoRendimiento; tasa: string } | null>(null);
  const actualizar = useMutation({
    mutationFn: () => api<{ omitido: boolean }>("/api/rendimientos/actualizar", { metodo: "POST" }),
    onSuccess: (r) => {
      avisar(r.omitido ? "Se actualizó hace poco; espera unos minutos" : "Tasas revisadas");
      void queryClient.invalidateQueries({ queryKey: ["finanzas-personales", "rendimientos"] });
    },
    onError: avisarError,
  });
  const guardarManual = useMutation({
    mutationFn: ({ id, tasa }: { id: string; tasa: number | null }) => api(`/api/rendimientos/manual/${id}`, { metodo: "PUT", cuerpo: { tasa } }),
    onSuccess: () => {
      setCorregir(null);
      void queryClient.invalidateQueries({ queryKey: ["finanzas-personales", "rendimientos"] });
    },
    onError: avisarError,
  });

  const valor = Number(cantidad) || 0;
  const filas = useMemo(() => {
    if (!q.data) return [];
    const tasas = new Map(q.data.tasas.map((t) => [t.id, t]));
    return q.data.productos
      .filter((p) => !sinCondiciones || /sin condiciones/i.test(p.condiciones) || p.tipo === "gobierno")
      .map((p) => {
        const t = tasas.get(p.id)!;
        const tasa = t.tasa ?? 0;
        const necesario = modo === "meta" && t.tasa ? montoParaMeta(p, tasa, valor, periodo) : null;
        const ganas = modo === "tengo" && t.tasa ? gananciaProducto(p, tasa, valor, periodo) : null;
        return { p, t, necesario, ganas };
      })
      .sort((a, b) =>
        modo === "meta" ? (a.necesario ?? Number.POSITIVE_INFINITY) - (b.necesario ?? Number.POSITIVE_INFINITY) : (b.ganas ?? -1) - (a.ganas ?? -1),
      );
  }, [q.data, modo, periodo, valor, sinCondiciones]);

  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCaja error={q.error} />;
  const d = q.data!;
  const mejor = filas.find((f) => (modo === "meta" ? f.necesario !== null : (f.ganas ?? 0) > 0));

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Calculadora" icono={TrendingUp}>
        <div className="space-y-3">
          <Pestanas
            valor={modo}
            alCambiar={setModo}
            opciones={[
              { id: "meta", texto: "Quiero ganar…" },
              { id: "tengo", texto: "Tengo para invertir…" },
            ]}
          />
          <div className="flex flex-wrap items-end gap-2">
            <Campo etiqueta={modo === "meta" ? "¿Cuánto quieres ganar?" : "¿Cuánto tienes?"} className="w-44">
              <Entrada type="number" inputMode="decimal" min={0} step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </Campo>
            <Pestanas valor={periodo} alCambiar={setPeriodo} opciones={PERIODOS} />
          </div>
          <Interruptor activo={sinCondiciones} alCambiar={setSinCondiciones} etiqueta="Solo opciones sin condiciones (sin compras mínimas ni segmentos)" />
          {mejor ? (
            <div className="flex items-start gap-2 rounded-xl border border-acento/40 bg-acento/10 p-3 text-sm">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-acento" />
              <p>
                {modo === "meta" ? (
                  <>
                    Conviene más <b>{mejor.p.institucion} · {mejor.p.producto}</b>: con <b>{dinero(mejor.necesario!)}</b> ganas unos {dinero(valor)} {TEXTO_PERIODO[periodo]} ({mejor.t.tasa} % anual).
                  </>
                ) : (
                  <>
                    Conviene más <b>{mejor.p.institucion} · {mejor.p.producto}</b>: ganas unos <b>{dinero(mejor.ganas!)}</b> {TEXTO_PERIODO[periodo]} ({mejor.t.tasa} % anual).
                  </>
                )}{" "}
                {!/sin condiciones/i.test(mejor.p.condiciones) ? <span className="text-tenue">Ojo: {mejor.p.condiciones}</span> : null}
              </p>
            </div>
          ) : null}
        </div>
      </Tarjeta>

      {!d.banxico ? <FaltaConfigurar variable="BANXICO_TOKEN" detalle="Para la tasa de CETES de cada día (token gratis de Banxico)." /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tenue">
        <span>
          {d.actualizado ? `Revisadas el ${new Date(d.actualizado).toLocaleString(localeActual(), { dateStyle: "medium", timeStyle: "short" })} (se revisan solas cada día).` : "Todavía no se revisan."}
          {d.tasaObjetivo ? ` Tasa objetivo de Banxico: ${d.tasaObjetivo.tasa} %.` : ""}
        </span>
        {puede ? (
          <Boton tamano="sm" icono={RefreshCw} cargando={actualizar.isPending} onClick={() => actualizar.mutate()}>
            Revisar ahora
          </Boton>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {filas.map(({ p, t, necesario, ganas }, i) => (
          <div key={p.id} className={cx("rounded-tarjeta border bg-superficie p-4", mejor?.p.id === p.id ? "border-acento" : "border-borde")}>
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fondo text-sm font-semibold text-tenue">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.institucion}</p>
                <p className="text-sm text-tenue">{p.producto}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{t.tasa !== null ? `${t.tasa} %` : "—"}</p>
                <p className="text-[11px] text-tenue">anual{p.tope ? ` hasta ${dinero(p.tope)}` : ""}</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-fondo p-3 text-sm">
              {modo === "meta" ? (
                necesario !== null ? (
                  <p>
                    Necesitas meter <b>{dinero(necesario)}</b> para ganar {dinero(valor)} {TEXTO_PERIODO[periodo]}.
                  </p>
                ) : (
                  <p className="text-tenue">{t.tasa ? "Con su tope no alcanza para esa meta." : "Sin tasa para calcular."}</p>
                )
              ) : ganas !== null ? (
                <p>
                  Ganas unos <b>{dinero(ganas)}</b> {TEXTO_PERIODO[periodo]}.
                </p>
              ) : (
                <p className="text-tenue">Sin tasa para calcular.</p>
              )}
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-tenue">
              <li>Liquidez: {p.liquidez}</li>
              <li>Condiciones: {p.condiciones}</li>
              <li>Protección: {p.proteccion}</li>
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Insignia tono={ESTADO[t.estado].tono}>{ESTADO[t.estado].texto}</Insignia>
              <span className="text-tenue">
                {t.fecha ? fecha(t.fecha) : ""}
                {t.fuente ? ` · ${t.fuente}` : ""}
              </span>
            </div>
            {t.aviso ? (
              <p className="mt-2 flex items-start gap-1 text-xs text-aviso">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t.aviso}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Boton tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(p.url)}>
                Sitio oficial
              </Boton>
              {puede ? (
                <Boton tamano="sm" variante="fantasma" icono={Pencil} onClick={() => setCorregir({ p, tasa: t.estado === "manual" && t.tasa !== null ? String(t.tasa) : "" })}>
                  Corregir tasa
                </Boton>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-tenue">
        Tasas brutas antes de impuestos (en CETES y bancos se retiene ISR). Las cuentas con tasas altas suelen pedir condiciones o tener tope. Esto es una calculadora, no asesoría financiera: confirma la tasa en la app de cada uno antes de invertir.
      </p>

      <Modal abierto={Boolean(corregir)} titulo={corregir ? `Tasa de ${corregir.p.institucion} · ${corregir.p.producto}` : ""} alCerrar={() => setCorregir(null)} ancho="max-w-sm">
        {corregir ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              guardarManual.mutate({ id: corregir.p.id, tasa: corregir.tasa.trim() ? Number(corregir.tasa) : null });
            }}
          >
            <p className="text-sm text-tenue">Si en su app ves otra tasa, escríbela aquí (solo la ves tú). Déjala vacía para volver a la automática.</p>
            <Campo etiqueta="Tasa anual (%)">
              <Entrada type="number" inputMode="decimal" min={0} max={100} step="0.01" value={corregir.tasa} onChange={(e) => setCorregir({ ...corregir, tasa: e.target.value })} autoFocus />
            </Campo>
            <Boton type="submit" variante="primario" cargando={guardarManual.isPending}>
              Guardar
            </Boton>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
