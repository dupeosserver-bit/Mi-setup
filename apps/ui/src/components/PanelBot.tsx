/**
 * Editor de un bot de Discord: encender/apagar/reiniciar y la configuración de todos sus módulos (bienvenida,
 * moderación, niveles, economía, tickets, roles con botones, comandos propios, registros y mensajes programados).
 * Lo usan tanto tú (con tu cuenta) como el dueño del bot (con su enlace): por eso recibe las funciones de guardar.
 */
import { CONFIG_BOT_INICIAL, type BotConfig } from "@mi-setup/shared";
import { useMutation } from "@tanstack/react-query";
import { Bot, ExternalLink, Plus, Power, RefreshCw, Save, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { abrirExterno } from "../lib/plataforma";
import { AreaTexto, Boton, Campo, Entrada, Insignia, Interruptor, Pestanas, Selector, Tarjeta, avisar, avisarError, cx } from "./ui";
import { localeActual } from "../lib/idioma";

export interface Servidor {
  id: string;
  nombre: string;
  miembros: number;
  canales: { id: string; nombre: string; tipo: "texto" | "categoria" | "voz" }[];
  roles: { id: string; nombre: string; color: string }[];
}
export interface BotDetalle {
  id: string;
  nombre: string;
  botNombre: string | null;
  estado: "apagado" | "conectando" | "encendido" | "error";
  deberiaEstarEncendido: boolean;
  vence: string | null;
  vencido: boolean;
  error: string | null;
  invitacion: string | null;
  config: BotConfig;
  servidores: Servidor[];
}
export interface ApiBot {
  guardar(config: BotConfig): Promise<unknown>;
  accion(a: "encender" | "apagar" | "reiniciar"): Promise<BotDetalle>;
  /** Para refrescar los datos del bot después de un cambio. */
  recargar(): void;
}

type Tab = "general" | "bienvenida" | "moderacion" | "niveles" | "economia" | "tickets" | "roles" | "comandos" | "registros" | "programados";
const TABS: { id: Tab; texto: string }[] = [
  { id: "general", texto: "General" },
  { id: "bienvenida", texto: "Bienvenida" },
  { id: "moderacion", texto: "Moderación" },
  { id: "niveles", texto: "Niveles" },
  { id: "economia", texto: "Economía" },
  { id: "tickets", texto: "Tickets" },
  { id: "roles", texto: "Roles" },
  { id: "comandos", texto: "Comandos" },
  { id: "registros", texto: "Registros" },
  { id: "programados", texto: "Programados" },
];
const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "item";
const lineas = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);

// ---------------------------------------------------------------- selectores con los canales y roles del servidor

interface Ctx {
  servidor: Servidor | null;
}
function CanalSel({ ctx, valor, alCambiar, tipo = "texto", vacio = "(ninguno)" }: { ctx: Ctx; valor: string; alCambiar: (v: string) => void; tipo?: "texto" | "categoria"; vacio?: string }) {
  const lista = ctx.servidor?.canales.filter((c) => c.tipo === tipo) ?? [];
  if (!ctx.servidor) return <Entrada value={valor} onChange={(e) => alCambiar(e.target.value.replace(/\D/g, ""))} placeholder="ID del canal" inputMode="numeric" />;
  return (
    <Selector value={valor} onChange={(e) => alCambiar(e.target.value)}>
      <option value="">{vacio}</option>
      {lista.map((c) => (
        <option key={c.id} value={c.id}>
          {tipo === "texto" ? "#" : ""}
          {c.nombre}
        </option>
      ))}
      {valor && !lista.some((c) => c.id === valor) ? <option value={valor}>{valor} (otro servidor)</option> : null}
    </Selector>
  );
}
function RolSel({ ctx, valor, alCambiar, vacio = "(ninguno)" }: { ctx: Ctx; valor: string; alCambiar: (v: string) => void; vacio?: string }) {
  if (!ctx.servidor) return <Entrada value={valor} onChange={(e) => alCambiar(e.target.value.replace(/\D/g, ""))} placeholder="ID del rol" inputMode="numeric" />;
  return (
    <Selector value={valor} onChange={(e) => alCambiar(e.target.value)}>
      <option value="">{vacio}</option>
      {ctx.servidor.roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.nombre}
        </option>
      ))}
      {valor && !ctx.servidor.roles.some((r) => r.id === valor) ? <option value={valor}>{valor}</option> : null}
    </Selector>
  );
}
function RolesMulti({ ctx, valor, alCambiar }: { ctx: Ctx; valor: string[]; alCambiar: (v: string[]) => void }) {
  if (!ctx.servidor) return <AreaTexto rows={2} value={valor.join("\n")} onChange={(e) => alCambiar(lineas(e.target.value).map((x) => x.replace(/\D/g, "")).filter(Boolean))} placeholder="Un ID de rol por línea" />;
  return (
    <div className="flex flex-wrap gap-1">
      {ctx.servidor.roles.map((r) => (
        <button key={r.id} type="button" onClick={() => alCambiar(valor.includes(r.id) ? valor.filter((x) => x !== r.id) : [...valor, r.id])} className={cx("rounded-full border px-2 py-0.5 text-xs", valor.includes(r.id) ? "border-acento bg-tarjeta" : "border-borde text-tenue")}>
          {r.nombre}
        </button>
      ))}
    </div>
  );
}
const Fila = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
const Num = ({ valor, alCambiar, min, max }: { valor: number; alCambiar: (n: number) => void; min?: number; max?: number }) => (
  <Entrada type="number" value={valor} min={min} max={max} onChange={(e) => alCambiar(Number(e.target.value) || 0)} />
);
const Variables = ({ texto }: { texto: string }) => <p className="text-[11px] text-tenue">Puedes usar: {texto}</p>;

// ---------------------------------------------------------------- el panel

export function PanelBot({ bot, api, cliente = false }: { bot: BotDetalle; api: ApiBot; cliente?: boolean }) {
  const [config, setConfig] = useState<BotConfig>(bot.config);
  const [sucio, setSucio] = useState(false);
  const [tab, setTab] = useState<Tab>("general");
  const [guildId, setGuildId] = useState<string>("");
  useEffect(() => {
    // Los cambios del servidor no pisan lo que estás editando.
    if (!sucio) setConfig(bot.config);
  }, [bot.config, sucio]);
  const servidor = bot.servidores.find((s) => s.id === guildId) ?? bot.servidores[0] ?? null;
  const ctx: Ctx = useMemo(() => ({ servidor }), [servidor]);

  const cambiar = (f: (c: BotConfig) => BotConfig) => {
    setConfig((c) => f(c));
    setSucio(true);
  };
  const guardar = useMutation({
    mutationFn: () => api.guardar(config),
    onSuccess: () => {
      setSucio(false);
      avisar(bot.estado === "encendido" ? "Guardado y aplicado en Discord" : "Guardado (se aplica al encender el bot)");
      api.recargar();
    },
    onError: avisarError,
  });
  const accion = useMutation({
    mutationFn: (a: "encender" | "apagar" | "reiniciar") => api.accion(a),
    onSuccess: () => api.recargar(),
    onError: (e) => {
      avisarError(e);
      api.recargar();
    },
  });
  const c = config;
  const encendido = bot.estado === "encendido";

  return (
    <div className="space-y-4">
      <Tarjeta
        titulo={bot.nombre}
        icono={Bot}
        acciones={
          <Insignia tono={encendido ? "ok" : bot.estado === "error" ? "peligro" : bot.estado === "conectando" ? "aviso" : "neutro"}>{encendido ? "Encendido" : bot.estado === "conectando" ? "Conectando…" : bot.estado === "error" ? "Con error" : "Apagado"}</Insignia>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {!encendido ? (
            <Boton variante="primario" icono={Power} cargando={accion.isPending && accion.variables === "encender"} disabled={bot.vencido} onClick={() => accion.mutate("encender")}>
              Encender
            </Boton>
          ) : (
            <>
              <Boton icono={RefreshCw} cargando={accion.isPending && accion.variables === "reiniciar"} onClick={() => accion.mutate("reiniciar")}>
                Reiniciar
              </Boton>
              <Boton icono={Square} cargando={accion.isPending && accion.variables === "apagar"} onClick={() => accion.mutate("apagar")}>
                Apagar
              </Boton>
            </>
          )}
          {bot.invitacion ? (
            <Boton variante="fantasma" icono={ExternalLink} onClick={() => abrirExterno(bot.invitacion!)}>
              Invitar a mi servidor
            </Boton>
          ) : null}
          {bot.botNombre ? <span className="text-xs text-tenue">Bot: {bot.botNombre}</span> : null}
        </div>
        {bot.vence ? (
          <p className={cx("mt-2 text-xs", bot.vencido ? "text-peligro" : "text-tenue")}>
            {bot.vencido ? "El servicio venció: el bot está apagado." : `El servicio vence el ${new Date(bot.vence).toLocaleDateString(localeActual(), { day: "numeric", month: "long", year: "numeric" })}.`}
          </p>
        ) : null}
        {bot.error ? <p className="mt-2 rounded-xl bg-peligro/10 p-2 text-xs text-peligro">{bot.error}</p> : null}
        {encendido && bot.servidores.length === 0 ? <p className="mt-2 text-xs text-tenue">El bot todavía no está en ningún servidor: usa «Invitar a mi servidor».</p> : null}
        {bot.servidores.length > 1 ? (
          <div className="mt-3 max-w-xs">
            <Campo etiqueta="Servidor (para elegir canales y roles)">
              <Selector value={servidor?.id ?? ""} onChange={(e) => setGuildId(e.target.value)}>
                {bot.servidores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>
        ) : null}
        {!servidor ? <p className="mt-2 text-xs text-tenue">Con el bot encendido y dentro de tu servidor, los canales y roles se eligen de una lista; si no, escribe su ID (en Discord: Ajustes → Avanzado → Modo desarrollador, y clic derecho → Copiar ID).</p> : null}
      </Tarjeta>

      <Pestanas valor={tab} alCambiar={setTab} opciones={TABS} />

      <Tarjeta titulo={TABS.find((t) => t.id === tab)!.texto}>
        {tab === "general" ? (
          <div className="space-y-4">
            <Fila>
              <Campo etiqueta="Estado">
                <Selector value={c.general.estado} onChange={(e) => cambiar((x) => ({ ...x, general: { ...x.general, estado: e.target.value as BotConfig["general"]["estado"] } }))}>
                  <option value="online">En línea</option>
                  <option value="idle">Ausente</option>
                  <option value="dnd">No molestar</option>
                  <option value="invisible">Invisible</option>
                </Selector>
              </Campo>
              <Campo etiqueta="Color de los mensajes con marco">
                <input type="color" value={c.general.colorEmbeds} onChange={(e) => cambiar((x) => ({ ...x, general: { ...x.general, colorEmbeds: e.target.value } }))} className="h-10 w-full cursor-pointer rounded border border-borde bg-transparent" />
              </Campo>
              <Campo etiqueta="Actividad">
                <Selector value={c.general.actividad.tipo} onChange={(e) => cambiar((x) => ({ ...x, general: { ...x.general, actividad: { ...x.general.actividad, tipo: e.target.value as BotConfig["general"]["actividad"]["tipo"] } } }))}>
                  <option value="jugando">Jugando a</option>
                  <option value="viendo">Viendo</option>
                  <option value="escuchando">Escuchando</option>
                  <option value="compitiendo">Compitiendo en</option>
                  <option value="personalizado">Estado personalizado</option>
                </Selector>
              </Campo>
              <Campo etiqueta="Texto de la actividad">
                <Entrada value={c.general.actividad.texto} maxLength={100} onChange={(e) => cambiar((x) => ({ ...x, general: { ...x.general, actividad: { ...x.general.actividad, texto: e.target.value } } }))} placeholder="Mi servidor" />
              </Campo>
            </Fila>
            <Interruptor activo={c.utilidades.activo} alCambiar={(v) => cambiar((x) => ({ ...x, utilidades: { activo: v } }))} etiqueta="Comandos básicos: /ping, /ayuda, /avatar, /servidor, /usuario" />
            <p className="text-xs text-tenue">Cada módulo está apagado hasta que lo actives en su pestaña. Los comandos de barra aparecen en Discord al guardar.</p>
          </div>
        ) : null}

        {tab === "bienvenida" ? (
          <div className="space-y-3">
            <Interruptor activo={c.bienvenida.activa} alCambiar={(v) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, activa: v } }))} etiqueta="Dar la bienvenida a los nuevos miembros" />
            <Fila>
              <Campo etiqueta="Canal de bienvenida">
                <CanalSel ctx={ctx} valor={c.bienvenida.canalId} alCambiar={(v) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, canalId: v } }))} />
              </Campo>
              <Campo etiqueta="Imagen (https://…, opcional)">
                <Entrada value={c.bienvenida.imagen} onChange={(e) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, imagen: e.target.value } }))} placeholder="https://…/banner.png" />
              </Campo>
            </Fila>
            <Campo etiqueta="Mensaje">
              <AreaTexto rows={3} value={c.bienvenida.mensaje} maxLength={1000} onChange={(e) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, mensaje: e.target.value } }))} />
              <Variables texto="{usuario} {servidor} {miembros}" />
            </Campo>
            <Interruptor activo={c.bienvenida.conEmbed} alCambiar={(v) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, conEmbed: v } }))} etiqueta="Con marco de color y foto del miembro" />
            <Campo etiqueta="Roles que se le dan al entrar">
              <RolesMulti ctx={ctx} valor={c.bienvenida.rolesAlEntrar} alCambiar={(v) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, rolesAlEntrar: v } }))} />
            </Campo>
            <Interruptor activo={c.bienvenida.md.activo} alCambiar={(v) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, md: { ...x.bienvenida.md, activo: v } } }))} etiqueta="Mandarle también un mensaje privado" />
            {c.bienvenida.md.activo ? <AreaTexto rows={2} value={c.bienvenida.md.mensaje} onChange={(e) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, md: { ...x.bienvenida.md, mensaje: e.target.value } } }))} /> : null}
            <div className="border-t border-borde pt-3">
              <Interruptor activo={c.bienvenida.despedida.activa} alCambiar={(v) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, despedida: { ...x.bienvenida.despedida, activa: v } } }))} etiqueta="Despedir a los que se van" />
              {c.bienvenida.despedida.activa ? (
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Canal">
                    <CanalSel ctx={ctx} valor={c.bienvenida.despedida.canalId} alCambiar={(v) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, despedida: { ...x.bienvenida.despedida, canalId: v } } }))} />
                  </Campo>
                  <Campo etiqueta="Mensaje">
                    <Entrada value={c.bienvenida.despedida.mensaje} onChange={(e) => cambiar((x) => ({ ...x, bienvenida: { ...x.bienvenida, despedida: { ...x.bienvenida.despedida, mensaje: e.target.value } } }))} />
                  </Campo>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "moderacion" ? (
          <div className="space-y-4">
            <Interruptor activo={c.moderacion.activa} alCambiar={(v) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, activa: v } }))} etiqueta="Activar moderación: /ban /kick /timeout /advertir /advertencias /limpiar y filtros" />
            <Fila>
              <Campo etiqueta="Canal donde se avisan las sanciones">
                <CanalSel ctx={ctx} valor={c.moderacion.canalLogs} alCambiar={(v) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, canalLogs: v } }))} />
              </Campo>
              <Campo etiqueta="Roles que los filtros no tocan">
                <RolesMulti ctx={ctx} valor={c.moderacion.inmunes} alCambiar={(v) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, inmunes: v } }))} />
              </Campo>
            </Fila>
            {(
              [
                ["antispam", "Anti-spam (muchos mensajes seguidos)"],
                ["antienlaces", "Bloquear enlaces"],
                ["palabras", "Palabras prohibidas"],
                ["menciones", "Menciones masivas"],
              ] as const
            ).map(([k, titulo]) => (
              <div key={k} className="rounded-xl border border-borde p-3">
                <Interruptor activo={c.moderacion[k].activo} alCambiar={(v) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, [k]: { ...x.moderacion[k], activo: v } } }))} etiqueta={titulo} />
                {c.moderacion[k].activo ? (
                  <div className="mt-3 space-y-3">
                    {k === "antispam" ? (
                      <Fila>
                        <Campo etiqueta="Más de… mensajes">
                          <Num valor={c.moderacion.antispam.mensajes} min={3} max={30} alCambiar={(n) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, antispam: { ...x.moderacion.antispam, mensajes: n } } }))} />
                        </Campo>
                        <Campo etiqueta="…en cuántos segundos">
                          <Num valor={c.moderacion.antispam.segundos} min={2} max={60} alCambiar={(n) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, antispam: { ...x.moderacion.antispam, segundos: n } } }))} />
                        </Campo>
                      </Fila>
                    ) : null}
                    {k === "antienlaces" ? (
                      <Campo etiqueta="Dominios permitidos (uno por línea)">
                        <AreaTexto rows={3} value={c.moderacion.antienlaces.permitidos.join("\n")} onChange={(e) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, antienlaces: { ...x.moderacion.antienlaces, permitidos: lineas(e.target.value) } } }))} placeholder={"youtube.com\ntwitch.tv"} />
                      </Campo>
                    ) : null}
                    {k === "palabras" ? (
                      <Campo etiqueta="Palabras (una por línea)">
                        <AreaTexto rows={4} value={c.moderacion.palabras.lista.join("\n")} onChange={(e) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, palabras: { ...x.moderacion.palabras, lista: lineas(e.target.value) } } }))} />
                      </Campo>
                    ) : null}
                    {k === "menciones" ? (
                      <Campo etiqueta="Máximo de menciones por mensaje">
                        <Num valor={c.moderacion.menciones.maximo} min={2} max={50} alCambiar={(n) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, menciones: { ...x.moderacion.menciones, maximo: n } } }))} />
                      </Campo>
                    ) : null}
                    <Fila>
                      <Campo etiqueta="Qué hacer">
                        <Selector value={c.moderacion[k].accion} onChange={(e) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, [k]: { ...x.moderacion[k], accion: e.target.value } } }))}>
                          <option value="borrar">Borrar el mensaje</option>
                          <option value="advertir">Borrar y advertir</option>
                          <option value="timeout">Borrar y silenciar</option>
                        </Selector>
                      </Campo>
                      {k === "antispam" && c.moderacion.antispam.accion === "timeout" ? (
                        <Campo etiqueta="Minutos de silencio">
                          <Num valor={c.moderacion.antispam.timeoutMin} min={1} max={10080} alCambiar={(n) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, antispam: { ...x.moderacion.antispam, timeoutMin: n } } }))} />
                        </Campo>
                      ) : null}
                    </Fila>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="rounded-xl border border-borde p-3">
              <Interruptor activo={c.moderacion.advertencias.activo} alCambiar={(v) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, advertencias: { ...x.moderacion.advertencias, activo: v } } }))} etiqueta="Sanción automática al juntar advertencias" />
              {c.moderacion.advertencias.activo ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Campo etiqueta="Advertencias">
                    <Num valor={c.moderacion.advertencias.cantidad} min={2} max={20} alCambiar={(n) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, advertencias: { ...x.moderacion.advertencias, cantidad: n } } }))} />
                  </Campo>
                  <Campo etiqueta="Entonces">
                    <Selector value={c.moderacion.advertencias.accion} onChange={(e) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, advertencias: { ...x.moderacion.advertencias, accion: e.target.value as "timeout" | "kick" | "ban" } } }))}>
                      <option value="timeout">Silenciar</option>
                      <option value="kick">Expulsar</option>
                      <option value="ban">Banear</option>
                    </Selector>
                  </Campo>
                  {c.moderacion.advertencias.accion === "timeout" ? (
                    <Campo etiqueta="Minutos">
                      <Num valor={c.moderacion.advertencias.timeoutMin} min={1} max={10080} alCambiar={(n) => cambiar((x) => ({ ...x, moderacion: { ...x.moderacion, advertencias: { ...x.moderacion.advertencias, timeoutMin: n } } }))} />
                    </Campo>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "niveles" ? (
          <div className="space-y-3">
            <Interruptor activo={c.niveles.activo} alCambiar={(v) => cambiar((x) => ({ ...x, niveles: { ...x.niveles, activo: v } }))} etiqueta="Activar niveles y XP por mensaje: /rango /top-niveles" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Campo etiqueta="XP mínima por mensaje">
                <Num valor={c.niveles.xpMin} min={1} max={100} alCambiar={(n) => cambiar((x) => ({ ...x, niveles: { ...x.niveles, xpMin: n } }))} />
              </Campo>
              <Campo etiqueta="XP máxima">
                <Num valor={c.niveles.xpMax} min={1} max={200} alCambiar={(n) => cambiar((x) => ({ ...x, niveles: { ...x.niveles, xpMax: n } }))} />
              </Campo>
              <Campo etiqueta="Segundos entre XP">
                <Num valor={c.niveles.enfriamiento} min={5} max={600} alCambiar={(n) => cambiar((x) => ({ ...x, niveles: { ...x.niveles, enfriamiento: n } }))} />
              </Campo>
            </div>
            <Fila>
              <Campo etiqueta="Dónde avisar que subió de nivel">
                <CanalSel ctx={ctx} valor={c.niveles.canalAviso} vacio="En el mismo canal" alCambiar={(v) => cambiar((x) => ({ ...x, niveles: { ...x.niveles, canalAviso: v } }))} />
              </Campo>
              <Campo etiqueta="Mensaje al subir">
                <Entrada value={c.niveles.mensaje} onChange={(e) => cambiar((x) => ({ ...x, niveles: { ...x.niveles, mensaje: e.target.value } }))} />
                <Variables texto="{usuario} {nivel} {servidor}" />
              </Campo>
            </Fila>
            <Campo etiqueta="Roles de recompensa">
              <div className="space-y-2">
                {c.niveles.recompensas.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-tenue">Nivel</span>
                    <div className="w-20">
                      <Num valor={r.nivel} min={1} max={500} alCambiar={(n) => cambiar((x) => ({ ...x, niveles: { ...x.niveles, recompensas: x.niveles.recompensas.map((y, j) => (j === i ? { ...y, nivel: n } : y)) } }))} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <RolSel ctx={ctx} valor={r.rolId} alCambiar={(v) => cambiar((x) => ({ ...x, niveles: { ...x.niveles, recompensas: x.niveles.recompensas.map((y, j) => (j === i ? { ...y, rolId: v } : y)) } }))} />
                    </div>
                    <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar" onClick={() => cambiar((x) => ({ ...x, niveles: { ...x.niveles, recompensas: x.niveles.recompensas.filter((_, j) => j !== i) } }))} />
                  </div>
                ))}
                <Boton tamano="sm" icono={Plus} onClick={() => cambiar((x) => ({ ...x, niveles: { ...x.niveles, recompensas: [...x.niveles.recompensas, { nivel: 5, rolId: servidor?.roles[0]?.id ?? "" }] } }))}>
                  Agregar recompensa
                </Boton>
              </div>
            </Campo>
          </div>
        ) : null}

        {tab === "economia" ? (
          <div className="space-y-3">
            <Interruptor activo={c.economia.activa} alCambiar={(v) => cambiar((x) => ({ ...x, economia: { ...x.economia, activa: v } }))} etiqueta="Activar economía: /balance /diario /trabajar /pagar /tienda /comprar /top-monedas" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo etiqueta="Nombre de la moneda">
                <Entrada value={c.economia.moneda.nombre} onChange={(e) => cambiar((x) => ({ ...x, economia: { ...x.economia, moneda: { ...x.economia.moneda, nombre: e.target.value } } }))} />
              </Campo>
              <Campo etiqueta="Símbolo">
                <Entrada value={c.economia.moneda.simbolo} onChange={(e) => cambiar((x) => ({ ...x, economia: { ...x.economia, moneda: { ...x.economia.moneda, simbolo: e.target.value } } }))} />
              </Campo>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Campo etiqueta="Diario: mínimo">
                <Num valor={c.economia.diario.min} min={1} alCambiar={(n) => cambiar((x) => ({ ...x, economia: { ...x.economia, diario: { ...x.economia.diario, min: n } } }))} />
              </Campo>
              <Campo etiqueta="máximo">
                <Num valor={c.economia.diario.max} min={1} alCambiar={(n) => cambiar((x) => ({ ...x, economia: { ...x.economia, diario: { ...x.economia.diario, max: n } } }))} />
              </Campo>
              <Campo etiqueta="cada (horas)">
                <Num valor={c.economia.diario.horas} min={1} max={168} alCambiar={(n) => cambiar((x) => ({ ...x, economia: { ...x.economia, diario: { ...x.economia.diario, horas: n } } }))} />
              </Campo>
              <Campo etiqueta="Trabajo: mínimo">
                <Num valor={c.economia.trabajo.min} min={1} alCambiar={(n) => cambiar((x) => ({ ...x, economia: { ...x.economia, trabajo: { ...x.economia.trabajo, min: n } } }))} />
              </Campo>
              <Campo etiqueta="máximo">
                <Num valor={c.economia.trabajo.max} min={1} alCambiar={(n) => cambiar((x) => ({ ...x, economia: { ...x.economia, trabajo: { ...x.economia.trabajo, max: n } } }))} />
              </Campo>
              <Campo etiqueta="cada (minutos)">
                <Num valor={c.economia.trabajo.minutos} min={1} max={1440} alCambiar={(n) => cambiar((x) => ({ ...x, economia: { ...x.economia, trabajo: { ...x.economia.trabajo, minutos: n } } }))} />
              </Campo>
            </div>
            <Campo etiqueta="Tienda">
              <div className="space-y-2">
                {c.economia.tienda.map((t, i) => (
                  <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-borde p-2 sm:grid-cols-[1fr_100px_1fr_auto]">
                    <Entrada value={t.nombre} placeholder="Nombre" onChange={(e) => cambiar((x) => ({ ...x, economia: { ...x.economia, tienda: x.economia.tienda.map((y, j) => (j === i ? { ...y, nombre: e.target.value, id: slug(e.target.value) } : y)) } }))} />
                    <Num valor={t.precio} min={1} alCambiar={(n) => cambiar((x) => ({ ...x, economia: { ...x.economia, tienda: x.economia.tienda.map((y, j) => (j === i ? { ...y, precio: n } : y)) } }))} />
                    <RolSel ctx={ctx} valor={t.rolId} vacio="(sin rol)" alCambiar={(v) => cambiar((x) => ({ ...x, economia: { ...x.economia, tienda: x.economia.tienda.map((y, j) => (j === i ? { ...y, rolId: v } : y)) } }))} />
                    <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar" onClick={() => cambiar((x) => ({ ...x, economia: { ...x.economia, tienda: x.economia.tienda.filter((_, j) => j !== i) } }))} />
                  </div>
                ))}
                <Boton tamano="sm" icono={Plus} onClick={() => cambiar((x) => ({ ...x, economia: { ...x.economia, tienda: [...x.economia.tienda, { id: `articulo-${x.economia.tienda.length + 1}`, nombre: `Artículo ${x.economia.tienda.length + 1}`, precio: 500, descripcion: "", rolId: "" }] } }))}>
                  Agregar artículo
                </Boton>
              </div>
            </Campo>
          </div>
        ) : null}

        {tab === "tickets" ? (
          <div className="space-y-3">
            <Interruptor activo={c.tickets.activo} alCambiar={(v) => cambiar((x) => ({ ...x, tickets: { ...x.tickets, activo: v } }))} etiqueta="Activar tickets de soporte" />
            <p className="text-xs text-tenue">Guarda, y en el canal donde quieras el botón escribe /panel-tickets (solo administradores).</p>
            <Fila>
              <Campo etiqueta="Categoría donde se crean los tickets">
                <CanalSel ctx={ctx} tipo="categoria" valor={c.tickets.categoriaId} vacio="(sin categoría)" alCambiar={(v) => cambiar((x) => ({ ...x, tickets: { ...x.tickets, categoriaId: v } }))} />
              </Campo>
              <Campo etiqueta="Canal de registros (guarda la conversación)">
                <CanalSel ctx={ctx} valor={c.tickets.canalLogs} alCambiar={(v) => cambiar((x) => ({ ...x, tickets: { ...x.tickets, canalLogs: v } }))} />
              </Campo>
            </Fila>
            <Campo etiqueta="Roles que atienden los tickets">
              <RolesMulti ctx={ctx} valor={c.tickets.soporteIds} alCambiar={(v) => cambiar((x) => ({ ...x, tickets: { ...x.tickets, soporteIds: v } }))} />
            </Campo>
            <Fila>
              <Campo etiqueta="Título del panel">
                <Entrada value={c.tickets.panel.titulo} onChange={(e) => cambiar((x) => ({ ...x, tickets: { ...x.tickets, panel: { ...x.tickets.panel, titulo: e.target.value } } }))} />
              </Campo>
              <Campo etiqueta="Texto del botón">
                <Entrada value={c.tickets.panel.boton} onChange={(e) => cambiar((x) => ({ ...x, tickets: { ...x.tickets, panel: { ...x.tickets.panel, boton: e.target.value } } }))} />
              </Campo>
            </Fila>
            <Campo etiqueta="Texto del panel">
              <AreaTexto rows={2} value={c.tickets.panel.texto} onChange={(e) => cambiar((x) => ({ ...x, tickets: { ...x.tickets, panel: { ...x.tickets.panel, texto: e.target.value } } }))} />
            </Campo>
            <Campo etiqueta="Mensaje dentro del ticket">
              <AreaTexto rows={2} value={c.tickets.bienvenida} onChange={(e) => cambiar((x) => ({ ...x, tickets: { ...x.tickets, bienvenida: e.target.value } }))} />
            </Campo>
            <Campo etiqueta="Tickets abiertos a la vez por persona">
              <div className="w-24">
                <Num valor={c.tickets.maximo} min={1} max={5} alCambiar={(n) => cambiar((x) => ({ ...x, tickets: { ...x.tickets, maximo: n } }))} />
              </div>
            </Campo>
          </div>
        ) : null}

        {tab === "roles" ? (
          <div className="space-y-3">
            <p className="text-xs text-tenue">Crea paneles con botones para que cada quien se ponga o quite roles. Guarda, y en el canal donde lo quieras escribe /panel-roles. El rol del bot debe estar por encima de esos roles.</p>
            {c.roles.paneles.map((p, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-borde p-3">
                <div className="flex gap-2">
                  <Entrada value={p.titulo} onChange={(e) => cambiar((x) => ({ ...x, roles: { paneles: x.roles.paneles.map((y, j) => (j === i ? { ...y, titulo: e.target.value, id: slug(e.target.value) } : y)) } }))} />
                  <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar panel" onClick={() => cambiar((x) => ({ ...x, roles: { paneles: x.roles.paneles.filter((_, j) => j !== i) } }))} />
                </div>
                <AreaTexto rows={2} value={p.texto} onChange={(e) => cambiar((x) => ({ ...x, roles: { paneles: x.roles.paneles.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)) } }))} />
                {p.roles.map((r, k) => (
                  <div key={k} className="grid grid-cols-[60px_1fr_1fr_auto] items-center gap-2">
                    <Entrada value={r.emoji} placeholder="😀" maxLength={8} onChange={(e) => cambiar((x) => ({ ...x, roles: { paneles: x.roles.paneles.map((y, j) => (j === i ? { ...y, roles: y.roles.map((z, m) => (m === k ? { ...z, emoji: e.target.value } : z)) } : y)) } }))} />
                    <Entrada value={r.etiqueta} placeholder="Texto del botón" onChange={(e) => cambiar((x) => ({ ...x, roles: { paneles: x.roles.paneles.map((y, j) => (j === i ? { ...y, roles: y.roles.map((z, m) => (m === k ? { ...z, etiqueta: e.target.value } : z)) } : y)) } }))} />
                    <RolSel ctx={ctx} valor={r.rolId} alCambiar={(v) => cambiar((x) => ({ ...x, roles: { paneles: x.roles.paneles.map((y, j) => (j === i ? { ...y, roles: y.roles.map((z, m) => (m === k ? { ...z, rolId: v } : z)) } : y)) } }))} />
                    <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar botón" disabled={p.roles.length <= 1} onClick={() => cambiar((x) => ({ ...x, roles: { paneles: x.roles.paneles.map((y, j) => (j === i ? { ...y, roles: y.roles.filter((_, m) => m !== k) } : y)) } }))} />
                  </div>
                ))}
                <Boton tamano="sm" icono={Plus} disabled={p.roles.length >= 25} onClick={() => cambiar((x) => ({ ...x, roles: { paneles: x.roles.paneles.map((y, j) => (j === i ? { ...y, roles: [...y.roles, { rolId: servidor?.roles[0]?.id ?? "", etiqueta: "Nuevo rol", emoji: "" }] } : y)) } }))}>
                  Agregar botón
                </Boton>
              </div>
            ))}
            <Boton icono={Plus} disabled={c.roles.paneles.length >= 5} onClick={() => cambiar((x) => ({ ...x, roles: { paneles: [...x.roles.paneles, { id: `panel-${x.roles.paneles.length + 1}`, titulo: `Panel ${x.roles.paneles.length + 1}`, texto: "Toca un botón para ponerte o quitarte el rol.", roles: [{ rolId: servidor?.roles[0]?.id ?? "", etiqueta: "Mi rol", emoji: "" }] }] } }))}>
              Nuevo panel de roles
            </Boton>
          </div>
        ) : null}

        {tab === "comandos" ? (
          <div className="space-y-3">
            <p className="text-xs text-tenue">Tus propios comandos de barra: el bot responde lo que escribas. Útil para reglas, redes, IP del servidor, etc.</p>
            {c.comandos.map((k, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-borde p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr_auto]">
                  <Entrada value={k.nombre} placeholder="nombre" onChange={(e) => cambiar((x) => ({ ...x, comandos: x.comandos.map((y, j) => (j === i ? { ...y, nombre: slug(e.target.value).replace(/-+$/, "") } : y)) }))} />
                  <Entrada value={k.descripcion} placeholder="Qué hace (lo ven al escribir /)" maxLength={100} onChange={(e) => cambiar((x) => ({ ...x, comandos: x.comandos.map((y, j) => (j === i ? { ...y, descripcion: e.target.value } : y)) }))} />
                  <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar comando" onClick={() => cambiar((x) => ({ ...x, comandos: x.comandos.filter((_, j) => j !== i) }))} />
                </div>
                <AreaTexto rows={2} value={k.respuesta} placeholder="Respuesta" maxLength={2000} onChange={(e) => cambiar((x) => ({ ...x, comandos: x.comandos.map((y, j) => (j === i ? { ...y, respuesta: e.target.value } : y)) }))} />
                <div className="flex flex-wrap gap-4">
                  <Interruptor activo={k.conEmbed} alCambiar={(v) => cambiar((x) => ({ ...x, comandos: x.comandos.map((y, j) => (j === i ? { ...y, conEmbed: v } : y)) }))} etiqueta="Con marco" />
                  <Interruptor activo={k.privado} alCambiar={(v) => cambiar((x) => ({ ...x, comandos: x.comandos.map((y, j) => (j === i ? { ...y, privado: v } : y)) }))} etiqueta="Solo lo ve quien lo usa" />
                </div>
              </div>
            ))}
            <Boton icono={Plus} disabled={c.comandos.length >= 25} onClick={() => cambiar((x) => ({ ...x, comandos: [...x.comandos, { nombre: `comando${x.comandos.length + 1}`, descripcion: "Mi comando", respuesta: "¡Hola {usuario}!", conEmbed: false, privado: false }] }))}>
              Nuevo comando
            </Boton>
          </div>
        ) : null}

        {tab === "registros" ? (
          <div className="space-y-3">
            <Campo etiqueta="Canal de registros (solo para el equipo)">
              <CanalSel ctx={ctx} valor={c.registros.canalId} alCambiar={(v) => cambiar((x) => ({ ...x, registros: { ...x.registros, canalId: v } }))} />
            </Campo>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ["borrados", "Mensajes borrados"],
                  ["editados", "Mensajes editados"],
                  ["entradas", "Miembros que entran"],
                  ["salidas", "Miembros que salen"],
                  ["sanciones", "Sanciones"],
                ] as const
              ).map(([k, t]) => (
                <Interruptor key={k} activo={c.registros[k]} alCambiar={(v) => cambiar((x) => ({ ...x, registros: { ...x.registros, [k]: v } }))} etiqueta={t} />
              ))}
            </div>
            <p className="text-xs text-tenue">Con el comando /respaldo-servidor (solo administradores) el bot te manda un archivo con los roles y canales de tu servidor.</p>
          </div>
        ) : null}

        {tab === "programados" ? (
          <div className="space-y-3">
            <p className="text-xs text-tenue">Mensajes que el bot manda solo cada cierto tiempo (anuncios, recordatorios, reglas…). Mínimo cada 5 minutos.</p>
            {c.programados.map((p, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-borde p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px_auto]">
                  <CanalSel ctx={ctx} valor={p.canalId} alCambiar={(v) => cambiar((x) => ({ ...x, programados: x.programados.map((y, j) => (j === i ? { ...y, canalId: v } : y)) }))} />
                  <div className="flex items-center gap-2 text-xs">
                    cada
                    <Num valor={p.cadaMinutos} min={5} max={10080} alCambiar={(n) => cambiar((x) => ({ ...x, programados: x.programados.map((y, j) => (j === i ? { ...y, cadaMinutos: n } : y)) }))} />
                    min
                  </div>
                  <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar" onClick={() => cambiar((x) => ({ ...x, programados: x.programados.filter((_, j) => j !== i) }))} />
                </div>
                <AreaTexto rows={2} value={p.texto} maxLength={2000} onChange={(e) => cambiar((x) => ({ ...x, programados: x.programados.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)) }))} />
              </div>
            ))}
            <Boton icono={Plus} disabled={c.programados.length >= 10} onClick={() => cambiar((x) => ({ ...x, programados: [...x.programados, { id: `mensaje-${x.programados.length + 1}`, canalId: servidor?.canales.find((k) => k.tipo === "texto")?.id ?? "", texto: "¡Recuerden leer las reglas!", cadaMinutos: 60 }] }))}>
              Nuevo mensaje programado
            </Boton>
          </div>
        ) : null}
      </Tarjeta>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-tarjeta border border-borde bg-superficie p-3 shadow-lg">
        <Boton variante="primario" icono={Save} cargando={guardar.isPending} disabled={!sucio} onClick={() => guardar.mutate()}>
          Guardar cambios
        </Boton>
        {sucio ? (
          <Boton
            variante="fantasma"
            onClick={() => {
              setConfig(bot.config);
              setSucio(false);
            }}
          >
            Descartar
          </Boton>
        ) : null}
        <span className="text-xs text-tenue">{sucio ? "Tienes cambios sin guardar." : cliente ? "Los cambios se aplican en Discord al guardar." : "Todo guardado."}</span>
        <Boton variante="fantasma" className="ml-auto" onClick={() => cambiar(() => CONFIG_BOT_INICIAL)}>
          Restablecer todo
        </Boton>
      </div>
    </div>
  );
}
