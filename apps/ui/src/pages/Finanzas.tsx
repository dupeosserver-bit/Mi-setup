/** Gastos e ingresos: barras mensuales, anillos por categoría y neto. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Barras, Dona } from "../components/graficas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Selector, Tarjeta, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtDinero, fmtFecha } from "../lib/formato";
import { localeActual } from "../lib/idioma";

interface Resumen {
  moneda: string;
  porMes: { mes: string; ingresos: number; gastos: number; neto: number }[];
  gastosPorCategoria: { nombre: string; valor: number }[];
  ingresosPorCategoria: { nombre: string; valor: number }[];
  totales: { ingresos: number; gastos: number; neto: number };
}

interface Movimiento {
  id: string;
  tipo: "ingreso" | "gasto";
  monto: number;
  moneda: string;
  categoria: string;
  descripcion: string;
  fecha: string;
}

const CATEGORIAS = { gasto: ["VPS", "Dominios", "Licencias", "Publicidad", "Software", "Otros"], ingreso: ["Hosting", "Donaciones", "Tienda", "Otros"] };
const mesCorto = (m: string) => new Intl.DateTimeFormat(localeActual(), { month: "short", year: "2-digit" }).format(new Date(`${m}-15T00:00:00Z`));

function Nuevo({ alTerminar }: { alTerminar: () => void }) {
  const [d, setD] = useState({ tipo: "gasto" as "gasto" | "ingreso", monto: "", moneda: "MXN", categoria: "VPS", descripcion: "", fecha: new Date().toISOString().slice(0, 10) });
  const crear = useMutation({
    mutationFn: () => api("/api/finanzas/movimientos", { cuerpo: { ...d, monto: Number(d.monto), fecha: new Date(`${d.fecha}T12:00:00`).toISOString() } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
      alTerminar();
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => (e.preventDefault(), crear.mutate())}>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Tipo">
          <Selector value={d.tipo} onChange={(e) => { const tipo = e.target.value as "gasto" | "ingreso"; setD({ ...d, tipo, categoria: CATEGORIAS[tipo][0] ?? "Otros" }); }}>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Fecha">
          <Entrada type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} required />
        </Campo>
        <Campo etiqueta="Monto">
          <Entrada type="number" step="0.01" min="0.01" value={d.monto} onChange={(e) => setD({ ...d, monto: e.target.value })} required />
        </Campo>
        <Campo etiqueta="Moneda">
          <Entrada value={d.moneda} onChange={(e) => setD({ ...d, moneda: e.target.value.toUpperCase() })} maxLength={3} />
        </Campo>
      </div>
      <Campo etiqueta="Categoría">
        <Entrada list="categorias" value={d.categoria} onChange={(e) => setD({ ...d, categoria: e.target.value })} required />
        <datalist id="categorias">
          {CATEGORIAS[d.tipo].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Campo>
      <Campo etiqueta="Descripción">
        <Entrada value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} />
      </Campo>
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" cargando={crear.isPending}>Guardar</Boton>
    </form>
  );
}

export default function Finanzas() {
  const puede = usePuede("finanzas", "escritura");
  const [nuevo, setNuevo] = useState(false);
  const [moneda, setMoneda] = useState("MXN");
  const resumen = useQuery({ queryKey: ["finanzas", "resumen", moneda], queryFn: () => api<Resumen>(`/api/finanzas/resumen?meses=12&moneda=${moneda}`) });
  const movimientos = useQuery({ queryKey: ["finanzas", "movimientos"], queryFn: () => api<Movimiento[]>("/api/finanzas/movimientos") });
  const r = resumen.data;
  const fmt = (v: number) => fmtDinero(v, moneda);

  return (
    <>
      <Encabezado
        titulo="Gastos e ingresos"
        descripcion="Últimos 12 meses."
        acciones={
          <>
            <Entrada value={moneda} onChange={(e) => setMoneda(e.target.value.toUpperCase().slice(0, 3))} className="w-20" aria-label="Moneda" />
            {puede ? <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>Movimiento</Boton> : null}
          </>
        }
      />
      <ErrorCaja error={resumen.error} />
      {resumen.isLoading ? <Cargando /> : null}
      {r ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { t: "Ingresos", v: r.totales.ingresos, i: TrendingUp, c: "text-ok" },
              { t: "Gastos", v: r.totales.gastos, i: TrendingDown, c: "text-peligro" },
              { t: "Neto", v: r.totales.neto, i: Wallet, c: r.totales.neto >= 0 ? "text-ok" : "text-peligro" },
            ].map((x) => (
              <Tarjeta key={x.t}>
                <p className="flex items-center gap-2 text-xs text-tenue">
                  <x.i className="h-4 w-4" /> {x.t}
                </p>
                <p className={cx("mt-1 text-2xl font-semibold", x.c)}>{fmt(x.v)}</p>
              </Tarjeta>
            ))}
          </div>
          <Tarjeta titulo="Por mes">
            <Barras
              datos={r.porMes.map((m) => ({ ...m, mes: mesCorto(m.mes) }))}
              clave="mes"
              series={[
                { clave: "ingresos", nombre: "Ingresos", color: "#30D158" },
                { clave: "gastos", nombre: "Gastos", color: "#FF453A" },
                { clave: "neto", nombre: "Neto", color: "#E5E5EA" },
              ]}
              formato={fmt}
            />
          </Tarjeta>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Tarjeta titulo="Gastos por categoría">
              <Dona datos={r.gastosPorCategoria} formato={fmt} />
            </Tarjeta>
            <Tarjeta titulo="Ingresos por categoría">
              <Dona datos={r.ingresosPorCategoria} formato={fmt} />
            </Tarjeta>
          </div>
        </div>
      ) : null}
      <Tarjeta titulo="Movimientos" className="mt-4">
        {movimientos.data?.length === 0 ? <Vacio icono={Wallet} texto="Registra tus gastos e ingresos." /> : null}
        <ul className="space-y-1">
          {movimientos.data?.slice(0, 200).map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-tarjeta">
              <span className="w-24 shrink-0 text-xs text-tenue">{fmtFecha(m.fecha)}</span>
              <span className="min-w-0 flex-1 truncate">
                {m.categoria}
                {m.descripcion ? <span className="text-tenue"> · {m.descripcion}</span> : null}
              </span>
              <span className={cx("shrink-0 font-medium", m.tipo === "ingreso" ? "text-ok" : "text-peligro")}>
                {m.tipo === "ingreso" ? "+" : "−"}
                {fmtDinero(m.monto, m.moneda)}
              </span>
              {puede ? (
                <Boton
                  tamano="icono"
                  variante="fantasma"
                  icono={Trash2}
                  aria-label="Borrar"
                  onClick={() => void api(`/api/finanzas/movimientos/${m.id}`, { metodo: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: ["finanzas"] }), avisarError)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Modal abierto={nuevo} titulo="Nuevo movimiento" alCerrar={() => setNuevo(false)}>
        <Nuevo alTerminar={() => setNuevo(false)} />
      </Modal>
    </>
  );
}
