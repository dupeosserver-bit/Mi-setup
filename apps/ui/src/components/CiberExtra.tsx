/**
 * - Entradas recientes del servidor (en VPS → Seguridad del servidor).
 * - Correos de Google: hasta 10 cuentas, filtraciones, bandeja revisada (qué abrir y qué no) y enviar revisando antes.
 */
import { Paginas, usePaginado } from "./Paginas";
import { temas } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Mail, MailPlus, Plus, RefreshCw, Send, ShieldAlert, Sparkles, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, useMe, usePuede } from "../lib/consultas";
import { fmtFechaHora } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";
import { useTema } from "../lib/tiempo-real";
import { AreaTexto, Boton, Campo, Cargando, Entrada, ErrorCaja, Insignia, Modal, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "./ui";

// ---------------------------------------------------------------- entradas

interface Inicio {
  fecha: string;
  tipo: string;
  ip: string | null;
  detalle: { dispositivo?: string | null; motivo?: string; servidor?: string; usuario?: string };
  navegador: string;
  usuario?: string | null;
}

const TEXTO_INICIO: Record<string, { texto: string; tono: "ok" | "aviso" | "peligro" | "neutro" }> = {
  login: { texto: "Entraste", tono: "ok" },
  login_fallido: { texto: "Intento fallido", tono: "aviso" },
  login_nuevo_lugar: { texto: "Desde un lugar nuevo", tono: "peligro" },
  login_bloqueado: { texto: "Bloqueado por intentos", tono: "peligro" },
  sesion_cerrada_remota: { texto: "Cerraste una sesión", tono: "neutro" },
  entrada_ssh: { texto: "Entraron por SSH", tono: "aviso" },
};

export function EntradasRecientes() {
  const [pagina, setPagina] = useState(1);
  const q = useQuery({
    queryKey: ["vps", "entradas", pagina],
    queryFn: () => api<{ total: number; pagina: number; porPagina: number; entradas: Inicio[] }>(`/api/vps/seguridad/entradas?pagina=${pagina}`),
    placeholderData: (previo) => previo,
  });
  const entradas = q.data?.entradas ?? [];
  const nuevos = entradas.filter((i) => i.tipo === "login_nuevo_lugar" || i.tipo === "login_bloqueado").length;
  const paginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.porPagina)) : 1;
  return (
    <Tarjeta titulo="Entradas recientes y alertas" icono={ShieldAlert}>
      {nuevos ? (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-peligro/10 p-3 text-sm">
          <ShieldAlert className="h-4 w-4 shrink-0 text-peligro" /> Hay {nuevos} entrada(s) desde lugares nuevos o bloqueadas. Si no las reconoces, cierra esas sesiones y cambia la contraseña.
        </p>
      ) : null}
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data && entradas.length === 0 ? <p className="text-sm text-tenue">Sin movimientos.</p> : null}
      <ul className="divide-y divide-borde">
        {entradas.map((i, n) => {
          const t = TEXTO_INICIO[i.tipo] ?? { texto: i.tipo, tono: "neutro" as const };
          return (
            <li key={`${i.fecha}-${n}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <Insignia tono={t.tono}>{t.texto}</Insignia>
              <span className="min-w-0 flex-1 truncate text-xs text-tenue" title={i.navegador}>
                {i.usuario ? `${i.usuario} · ` : ""}
                {i.tipo === "entrada_ssh" ? `${i.detalle.servidor ?? ""} · usuario ${i.detalle.usuario ?? "?"} · ` : ""}
                {i.ip ?? ""} {i.detalle.dispositivo ? `· ${i.detalle.dispositivo}` : ""}
              </span>
              <span className="text-xs text-tenue">{fmtFechaHora(i.fecha)}</span>
            </li>
          );
        })}
      </ul>
      <Paginas pagina={pagina} total={paginas} alCambiar={setPagina} />
      <p className="mt-2 text-xs text-tenue">Te llega aviso al celular cuando alguien entra desde un lugar nuevo. Para avisos de SSH, activa «Alertas de entrada» en la revisión de arriba.</p>
    </Tarjeta>
  );
}

export function SeMudo({ texto, ruta }: { texto: string; ruta: string }) {
  return (
    <Link to={ruta} className="flex items-center gap-2 rounded-xl border border-borde px-3 py-2 text-sm text-tenue hover:text-texto">
      <ArrowRight className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{texto}</span>
    </Link>
  );
}

// ---------------------------------------------------------------- correos de Google

interface CuentaGoogle {
  id: string;
  email: string;
  conectada: string;
  enviar: boolean;
}
interface CorreoRevisado {
  id: string;
  de: string;
  asunto: string;
  fragmento: string;
  fecha: string | null;
  adjuntos: string[];
  enlaces: number;
  riesgo: "seguro" | "cuidado" | "peligroso";
  razones: string[];
  recomendacion: string;
}
const RIESGO = {
  seguro: { texto: "Seguro", tono: "ok" as const, icono: CheckCircle2 },
  cuidado: { texto: "Con cuidado", tono: "aviso" as const, icono: AlertTriangle },
  peligroso: { texto: "No lo abras", tono: "peligro" as const, icono: XCircle },
};

function Redactar({ cuenta, alCerrar }: { cuenta: CuentaGoogle; alCerrar: () => void }) {
  const [f, setF] = useState({ para: "", asunto: "", cuerpo: "" });
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const revisar = useMutation({
    mutationFn: () => api<{ avisos: string[] }>("/api/google/correo/revisar-envio", { cuerpo: f }),
    onSuccess: (r) => setAvisos(r.avisos),
    onError: avisarError,
  });
  const enviar = useMutation({
    mutationFn: () => api(`/api/google/correo/cuentas/${cuenta.id}/enviar`, { cuerpo: { ...f, confirmo: true } }),
    onSuccess: () => {
      avisar("Correo enviado");
      alCerrar();
    },
    onError: avisarError,
  });
  return (
    <Modal abierto titulo={`Nuevo correo desde ${cuenta.email}`} alCerrar={alCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Para (separa con comas)">
          <Entrada value={f.para} onChange={(e) => (setF({ ...f, para: e.target.value }), setAvisos(null))} placeholder="alguien@correo.com" />
        </Campo>
        <Campo etiqueta="Asunto">
          <Entrada value={f.asunto} onChange={(e) => (setF({ ...f, asunto: e.target.value }), setAvisos(null))} maxLength={300} />
        </Campo>
        <Campo etiqueta="Mensaje">
          <AreaTexto rows={8} value={f.cuerpo} onChange={(e) => (setF({ ...f, cuerpo: e.target.value }), setAvisos(null))} />
        </Campo>
        {avisos ? (
          avisos.length ? (
            <ul className="space-y-1 rounded-xl bg-aviso/10 p-3 text-xs">
              {avisos.map((a) => (
                <li key={a} className="flex gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-aviso" /> {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-ok/10 p-3 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> No vi nada delicado ni direcciones raras.
            </p>
          )
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Boton icono={ShieldAlert} cargando={revisar.isPending} onClick={() => revisar.mutate()} disabled={!f.para.trim()}>
            Revisar antes de enviar
          </Boton>
          <Boton
            variante="primario"
            icono={Send}
            cargando={enviar.isPending}
            disabled={avisos === null || !f.para.trim()}
            onClick={async () => {
              if (await confirmar({ titulo: "Enviar correo", mensaje: `Se enviará desde ${cuenta.email} a ${f.para}.`, boton: "Enviar" })) enviar.mutate();
            }}
          >
            Enviar
          </Boton>
        </div>
        {!cuenta.enviar ? <p className="text-xs text-aviso">Esta cuenta se conectó sin permiso de enviar: vuelve a conectarla.</p> : null}
      </div>
    </Modal>
  );
}

function Bandeja({ cuenta }: { cuenta: CuentaGoogle }) {
  const [activa, setActiva] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "riesgo">("riesgo");
  const [ia, setIa] = useState<Record<string, { riesgo: string; explicacion: string; consejo: string }>>({});
  const q = useQuery({ queryKey: ["correo-google", cuenta.id, "revisar"], queryFn: () => api<{ correos: CorreoRevisado[] }>(`/api/google/correo/cuentas/${cuenta.id}/revisar?max=30`), enabled: activa });
  const analizar = useMutation({
    mutationFn: (id: string) => api<{ riesgo: string; explicacion: string; consejo: string }>(`/api/google/correo/cuentas/${cuenta.id}/analizar/${id}`, { metodo: "POST" }),
    onSuccess: (r, id) => setIa((x) => ({ ...x, [id]: r })),
    onError: avisarError,
  });
  if (!activa) {
    return (
      <Boton icono={ShieldAlert} onClick={() => setActiva(true)}>
        Revisar bandeja
      </Boton>
    );
  }
  const lista = (q.data?.correos ?? []).filter((c) => filtro === "todos" || c.riesgo !== "seguro");
  const peligrosos = (q.data?.correos ?? []).filter((c) => c.riesgo === "peligroso").length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Selector value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className="h-8 w-48 text-xs">
          <option value="riesgo">Solo los que dan desconfianza</option>
          <option value="todos">Todos</option>
        </Selector>
        <Boton tamano="sm" variante="fantasma" icono={RefreshCw} onClick={() => void q.refetch()}>
          Revisar otra vez
        </Boton>
        {q.data ? <span className="text-xs text-tenue">{peligrosos ? `${peligrosos} peligroso(s) de ${q.data.correos.length}` : `${q.data.correos.length} revisados`}</span> : null}
      </div>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando texto="Revisando tus correos…" /> : null}
      {q.data && !lista.length ? <p className="text-sm text-tenue">Ningún correo sospechoso en los últimos {q.data.correos.length}.</p> : null}
      {lista.map((c) => {
        const r = RIESGO[c.riesgo];
        const extra = ia[c.id];
        return (
          <div key={c.id} className={cx("rounded-xl border p-3", c.riesgo === "peligroso" ? "border-peligro/50" : "border-borde")}>
            <div className="flex flex-wrap items-center gap-2">
              <r.icono className={cx("h-4 w-4", c.riesgo === "peligroso" ? "text-peligro" : c.riesgo === "cuidado" ? "text-aviso" : "text-ok")} />
              <Insignia tono={r.tono}>{r.texto}</Insignia>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{c.asunto || "(sin asunto)"}</p>
              {c.fecha ? <span className="text-xs text-tenue">{fmtFechaHora(c.fecha)}</span> : null}
            </div>
            <p className="truncate text-xs text-tenue">{c.de}</p>
            <p className="mt-1 line-clamp-2 text-xs">{c.fragmento}</p>
            {c.razones.length ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-tenue">
                {c.razones.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1 text-xs font-medium">{c.recomendacion}</p>
            {extra ? (
              <p className="mt-2 rounded-lg bg-fondo p-2 text-xs">
                <b>IA:</b> {extra.explicacion} {extra.consejo}
              </p>
            ) : (
              <Boton className="mt-2" tamano="sm" variante="fantasma" icono={Sparkles} cargando={analizar.isPending && analizar.variables === c.id} onClick={() => analizar.mutate(c.id)}>
                Analizar con IA
              </Boton>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CorreosGoogle() {
  const puede = usePuede("ciberseguridad", "escritura");
  const { data: me } = useMe();
  const cuentas = useQuery({ queryKey: ["correo-google", "cuentas"], queryFn: () => api<{ configurado: boolean; limite?: number; cuentas: CuentaGoogle[] }>("/api/google/correo/cuentas") });
  const filtraciones = useQuery({ queryKey: ["correo-google", "filtraciones"], queryFn: () => api<{ email: string; fuentes: string[]; revisado: boolean }[]>("/api/ciberseguridad/filtraciones"), staleTime: 10 * 60_000 });
  const [redactar, setRedactar] = useState<CuentaGoogle | null>(null);
  useTema<{ recurso?: string }>(me ? temas.usuario(me.usuario.id) : null, (m) => {
    if (m.recurso === "correo-google") void queryClient.invalidateQueries({ queryKey: ["correo-google"] });
  });
  const conectar = useMutation({
    mutationFn: () => api<{ url: string }>("/api/google/correo/conectar", { metodo: "POST" }),
    onSuccess: (r) => abrirExterno(r.url),
    onError: avisarError,
  });
  const quitar = useMutation({
    mutationFn: (id: string) => api(`/api/google/correo/cuentas/${id}`, { metodo: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["correo-google"] }),
    onError: avisarError,
  });
  const pgFil = usePaginado(filtraciones.data, 12);
  const limite = cuentas.data?.limite ?? 10;
  const usadas = cuentas.data?.cuentas.length ?? 0;
  const lleno = usadas >= limite;
  return (
    <div className="space-y-4">
      <Tarjeta titulo="¿Tus correos salieron en una filtración?" icono={ShieldAlert}>
        <ErrorCaja error={filtraciones.error} />
        {filtraciones.isLoading ? <Cargando texto="Revisando…" /> : null}
        <ul className="space-y-2">
          {pgFil.visibles.map((f) => (
            <li key={f.email} className="rounded-xl bg-fondo p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {f.email}
                {!f.revisado ? <Insignia>No se pudo revisar ahora</Insignia> : f.fuentes.length ? <Insignia tono="peligro">En {f.fuentes.length} filtración(es)</Insignia> : <Insignia tono="ok">Sin filtraciones conocidas</Insignia>}
              </p>
              {f.fuentes.length ? (
                <>
                  <p className="mt-1 text-xs text-tenue">Sitios: {f.fuentes.slice(0, 30).join(", ")}</p>
                  <p className="mt-1 text-xs">Cambia la contraseña de esos sitios (y de donde uses la misma). En Gestor de contraseñas → Revisar te dice cuáles y te genera nuevas.</p>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {pgFil.paginas}
        <p className="mt-2 text-xs text-tenue">Datos de XposedOrNot (gratis). Solo se revisan tu correo de Mi Setup y las cuentas que conectes.</p>
      </Tarjeta>

      <Tarjeta
        titulo="Cuentas de Google"
        icono={Mail}
        acciones={
          <>
            {cuentas.data ? <Insignia tono={lleno ? "aviso" : "neutro"}>{usadas} de {limite}</Insignia> : null}
            {puede && cuentas.data?.configurado ? (
              <Boton tamano="sm" variante="primario" icono={Plus} cargando={conectar.isPending} disabled={lleno} title={lleno ? `Máximo ${limite} cuentas: quita una para agregar otra` : undefined} onClick={() => conectar.mutate()}>
                Conectar cuenta
              </Boton>
            ) : null}
          </>
        }
      >
        <ErrorCaja error={cuentas.error} />
        {cuentas.data && !cuentas.data.configurado ? (
          <p className="text-sm text-tenue">Falta configurar: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (Ajustes → Servicios y claves → Google; activa también la Gmail API y agrega la dirección de retorno /api/google/correo/callback).</p>
        ) : null}
        {cuentas.data?.configurado && !cuentas.data.cuentas.length ? <Vacio icono={Mail} texto={`Conecta hasta ${limite} cuentas de Gmail iniciando sesión para revisar correos peligrosos.`} /> : null}
        <div className="space-y-4">
          {cuentas.data?.cuentas.map((c) => (
            <div key={c.id} className="space-y-2 rounded-xl border border-borde p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{c.email}</p>
                {puede ? (
                  <>
                    <Boton tamano="sm" icono={MailPlus} onClick={() => setRedactar(c)}>
                      Escribir
                    </Boton>
                    <Boton
                      tamano="icono"
                      variante="fantasma"
                      icono={Trash2}
                      aria-label={`Quitar ${c.email}`}
                      onClick={async () => {
                        if (await confirmar({ titulo: "Quitar cuenta", mensaje: `${c.email} se desconecta y se revoca el permiso en Google.`, boton: "Quitar" })) quitar.mutate(c.id);
                      }}
                    />
                  </>
                ) : null}
              </div>
              <Bandeja cuenta={c} />
            </div>
          ))}
        </div>
      </Tarjeta>
      {redactar ? <Redactar cuenta={redactar} alCerrar={() => setRedactar(null)} /> : null}
    </div>
  );
}
