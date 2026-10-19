/**
 * Motor de un bot de Discord (discord.js). Cada bot encendido en Mi Setup es una instancia: se conecta con su
 * token, registra sus comandos de barra según los módulos activos y atiende eventos (bienvenida, moderación,
 * niveles, economía, tickets, roles con botones, comandos propios, registros y mensajes programados).
 * El motor solo hace lo que la configuración activa; todo lo demás está apagado.
 */
import {
  ActionRowBuilder,
  ActivityType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Options,
  PermissionFlagsBits,
  Partials,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type PartialMessage,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type TextBasedChannel,
} from "discord.js";
import { botConfigSchema, rellenar, revisarSpam, sumarXp, xpParaSubir, enlaceNoPermitido, palabraProhibida, type BotConfig } from "@mi-setup/shared";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { botMembers, botTickets, botWarns } from "../../db/schema.js";

export type EstadoMotor = "apagado" | "conectando" | "encendido" | "error";

export interface DatosServidor {
  id: string;
  nombre: string;
  miembros: number;
  canales: { id: string; nombre: string; tipo: "texto" | "categoria" | "voz" }[];
  roles: { id: string; nombre: string; color: string }[];
}

export interface Motor {
  iniciar(): Promise<{ appId: string; nombre: string }>;
  detener(): Promise<void>;
  aplicarConfig(c: BotConfig): Promise<void>;
  estado(): EstadoMotor;
  servidores(): DatosServidor[];
}

export interface OpcionesMotor {
  botId: string;
  token: string;
  config: BotConfig;
  db: Database;
  ahora: () => Date;
  alError: (mensaje: string) => void;
}
export type FabricaMotor = (o: OpcionesMotor) => Motor;

const ACTIVIDADES = { jugando: ActivityType.Playing, viendo: ActivityType.Watching, escuchando: ActivityType.Listening, compitiendo: ActivityType.Competing, personalizado: ActivityType.Custom } as const;
const SOLO_YO = MessageFlags.Ephemeral;

/** Traduce los errores de conexión más comunes a algo que se entienda. */
export function explicarError(err: unknown): string {
  const t = err instanceof Error ? err.message : String(err);
  if (/disallowed intents|privileged intent/i.test(t)) return "Activa «Server Members Intent» y «Message Content Intent» en discord.com/developers → tu aplicación → Bot, y vuelve a encender.";
  if (/invalid token|an invalid token/i.test(t)) return "El token ya no es válido: genera uno nuevo en discord.com/developers y cámbialo aquí.";
  return t.slice(0, 250);
}

// ---------------------------------------------------------------- comandos de barra según la configuración

export function construirComandos(c: BotConfig): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const nuevo = (n: string, d: string) => new SlashCommandBuilder().setName(n).setDescription(d).setDMPermission(false);
  const lista: { toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody }[] = [];
  const usuarioOpcional = (b: SlashCommandBuilder) => b.addUserOption((o) => o.setName("usuario").setDescription("De quién (tú por defecto)"));

  if (c.utilidades.activo) {
    lista.push(nuevo("ping", "Mira si el bot responde"), nuevo("ayuda", "Lista de comandos"), usuarioOpcional(nuevo("avatar", "Foto de perfil")), nuevo("servidor", "Datos del servidor"), usuarioOpcional(nuevo("usuario", "Datos de un usuario")));
  }
  if (c.moderacion.activa) {
    lista.push(
      nuevo("ban", "Banear a un usuario").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption((o) => o.setName("usuario").setDescription("A quién").setRequired(true)).addStringOption((o) => o.setName("razon").setDescription("Motivo").setMaxLength(300)),
      nuevo("kick", "Expulsar a un usuario").setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption((o) => o.setName("usuario").setDescription("A quién").setRequired(true)).addStringOption((o) => o.setName("razon").setDescription("Motivo").setMaxLength(300)),
      nuevo("timeout", "Silenciar temporalmente").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption((o) => o.setName("usuario").setDescription("A quién").setRequired(true)).addIntegerOption((o) => o.setName("minutos").setDescription("Cuánto").setRequired(true).setMinValue(1).setMaxValue(40320)).addStringOption((o) => o.setName("razon").setDescription("Motivo").setMaxLength(300)),
      nuevo("quitar-timeout", "Quitar el silencio").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption((o) => o.setName("usuario").setDescription("A quién").setRequired(true)),
      nuevo("advertir", "Dar una advertencia").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption((o) => o.setName("usuario").setDescription("A quién").setRequired(true)).addStringOption((o) => o.setName("razon").setDescription("Motivo").setMaxLength(300)),
      nuevo("advertencias", "Ver las advertencias de alguien").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption((o) => o.setName("usuario").setDescription("De quién").setRequired(true)),
      nuevo("limpiar", "Borrar mensajes recientes").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption((o) => o.setName("cantidad").setDescription("Cuántos (1 a 100)").setRequired(true).setMinValue(1).setMaxValue(100)),
    );
  }
  if (c.niveles.activo) lista.push(usuarioOpcional(nuevo("rango", "Tu nivel y XP")), nuevo("top-niveles", "Los de más nivel"));
  if (c.economia.activa) {
    lista.push(
      usuarioOpcional(nuevo("balance", "Cuánto dinero tienes")),
      nuevo("diario", "Recompensa diaria"),
      nuevo("trabajar", "Trabaja para ganar dinero"),
      nuevo("pagar", "Pásale dinero a alguien").addUserOption((o) => o.setName("usuario").setDescription("A quién").setRequired(true)).addIntegerOption((o) => o.setName("monto").setDescription("Cuánto").setRequired(true).setMinValue(1)),
      nuevo("tienda", "Mira lo que se vende"),
      nuevo("top-monedas", "Los más ricos"),
      nuevo("dar-monedas", "Dar dinero (solo administradores)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption((o) => o.setName("usuario").setDescription("A quién").setRequired(true)).addIntegerOption((o) => o.setName("monto").setDescription("Cuánto").setRequired(true).setMinValue(1)),
    );
    if (c.economia.tienda.length) {
      lista.push(nuevo("comprar", "Compra algo de la tienda").addStringOption((o) => o.setName("articulo").setDescription("Qué").setRequired(true).addChoices(...c.economia.tienda.map((t) => ({ name: `${t.nombre} (${t.precio})`.slice(0, 100), value: t.id })))));
    }
  }
  if (c.tickets.activo) lista.push(nuevo("panel-tickets", "Publica el botón para abrir tickets").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), nuevo("cerrar-ticket", "Cierra este ticket"));
  if (c.roles.paneles.length) {
    lista.push(nuevo("panel-roles", "Publica un panel de roles con botones").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addStringOption((o) => o.setName("panel").setDescription("Cuál").setRequired(true).addChoices(...c.roles.paneles.map((p) => ({ name: p.titulo.slice(0, 100), value: p.id })))));
  }
  for (const k of c.comandos) lista.push(nuevo(k.nombre, k.descripcion));
  lista.push(nuevo("respaldo-servidor", "Archivo con los roles y canales del servidor").setDefaultMemberPermissions(PermissionFlagsBits.Administrator));
  return lista.map((x) => x.toJSON());
}

// ---------------------------------------------------------------- el motor

export class MotorDiscord implements Motor {
  private cliente: Client | null = null;
  private config: BotConfig;
  private estadoActual: EstadoMotor = "apagado";
  private temporizadores: ReturnType<typeof setInterval>[] = [];
  private spam = new Map<string, number[]>();
  private ultimoXp = new Map<string, number>();

  constructor(private readonly o: OpcionesMotor) {
    this.config = o.config;
  }

  estado(): EstadoMotor {
    return this.estadoActual;
  }

  async iniciar(): Promise<{ appId: string; nombre: string }> {
    this.estadoActual = "conectando";
    const cliente = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
      partials: [Partials.Message, Partials.Channel],
      makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 50, PresenceManager: 0, ReactionManager: 0, GuildMemberManager: 300, ThreadManager: 0 }),
    });
    this.cliente = cliente;
    cliente.on(Events.Error, (e) => this.o.alError(explicarError(e)));
    cliente.on(Events.Invalidated, () => {
      this.estadoActual = "error";
      this.o.alError("Discord cerró la sesión del bot (¿token reiniciado?)");
    });
    this.eventos(cliente);
    const listo = new Promise<void>((ok, mal) => {
      const limite = setTimeout(() => mal(new Error("Discord no respondió a tiempo")), 45_000);
      cliente.once(Events.ClientReady, () => {
        clearTimeout(limite);
        ok();
      });
    });
    try {
      await cliente.login(this.o.token);
      await listo;
    } catch (err) {
      this.estadoActual = "error";
      await cliente.destroy().catch(() => undefined);
      this.cliente = null;
      throw new Error(explicarError(err));
    }
    this.estadoActual = "encendido";
    await this.presencia();
    await this.registrarComandos();
    this.programar();
    return { appId: cliente.application!.id, nombre: cliente.user!.username };
  }

  async detener(): Promise<void> {
    this.temporizadores.forEach(clearInterval);
    this.temporizadores = [];
    this.estadoActual = "apagado";
    await this.cliente?.destroy().catch(() => undefined);
    this.cliente = null;
  }

  async aplicarConfig(c: BotConfig): Promise<void> {
    this.config = botConfigSchema.parse(c);
    if (this.estadoActual !== "encendido") return;
    await this.presencia();
    await this.registrarComandos();
    this.programar();
  }

  servidores(): DatosServidor[] {
    if (!this.cliente) return [];
    return [...this.cliente.guilds.cache.values()].map((g) => ({
      id: g.id,
      nombre: g.name,
      miembros: g.memberCount,
      canales: [...g.channels.cache.values()]
        .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory, ChannelType.GuildVoice].includes(c.type))
        .map((c) => ({ id: c.id, nombre: c.name, tipo: (c.type === ChannelType.GuildCategory ? "categoria" : c.type === ChannelType.GuildVoice ? "voz" : "texto") as "texto" | "categoria" | "voz" })),
      roles: [...g.roles.cache.values()].filter((r) => r.id !== g.id && !r.managed).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, nombre: r.name, color: r.hexColor })),
    }));
  }

  // ---- presencia, comandos y mensajes programados
  private async presencia(): Promise<void> {
    const { estado, actividad } = this.config.general;
    this.cliente?.user?.setPresence({
      status: estado,
      activities: actividad.texto ? [actividad.tipo === "personalizado" ? { name: "Estado", type: ActivityType.Custom, state: actividad.texto } : { name: actividad.texto, type: ACTIVIDADES[actividad.tipo] }] : [],
    });
  }

  private async registrarComandos(): Promise<void> {
    const cliente = this.cliente;
    if (!cliente?.application) return;
    const defs = construirComandos(this.config);
    for (const g of cliente.guilds.cache.values()) {
      await cliente.application.commands.set(defs, g.id).catch((err: unknown) => this.o.alError(`No pude registrar los comandos en ${g.name}: ${explicarError(err)}`));
    }
  }

  private programar(): void {
    this.temporizadores.forEach(clearInterval);
    this.temporizadores = this.config.programados.map((p) =>
      setInterval(() => {
        const canal = this.cliente?.channels.cache.get(p.canalId);
        if (canal?.isTextBased() && "send" in canal) void canal.send({ content: p.texto, allowedMentions: { parse: [] } }).catch(() => undefined);
      }, p.cadaMinutos * 60_000),
    );
  }

  // ---- utilidades de envío
  private color(): number {
    return parseInt(this.config.general.colorEmbeds.slice(1), 16);
  }
  private async canalDe(guild: Guild, id: string): Promise<TextBasedChannel | null> {
    if (!id) return null;
    const c = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
    return c && c.isTextBased() && "send" in c ? (c as TextBasedChannel) : null;
  }
  /** Manda un mensaje a un canal si de verdad se puede escribir en él. */
  private async decir(canal: unknown, mensaje: unknown): Promise<void> {
    const c = canal as { send?: (m: unknown) => Promise<unknown> } | null;
    if (c && typeof c.send === "function") await c.send(mensaje).catch(() => undefined);
  }
  private async log(guild: Guild, canalId: string, embed: EmbedBuilder): Promise<void> {
    const canal = await this.canalDe(guild, canalId);
    if (canal && "send" in canal) await canal.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
  }
  private logRegistro(guild: Guild, titulo: string, texto: string, ok: boolean): Promise<void> {
    return this.log(guild, this.config.registros.canalId, new EmbedBuilder().setTitle(titulo).setDescription(texto.slice(0, 3500)).setColor(ok ? 0x57f287 : 0xed4245).setTimestamp());
  }
  private inmune(m: GuildMember | null): boolean {
    return !m || m.permissions.has(PermissionFlagsBits.Administrator) || this.config.moderacion.inmunes.some((r) => m.roles.cache.has(r));
  }

  // ---- base de datos de miembros
  private async miembroDb(guildId: string, userId: string) {
    await this.o.db.insert(botMembers).values({ botId: this.o.botId, guildId, userId }).onConflictDoNothing();
    const [m] = await this.o.db.select().from(botMembers).where(and(eq(botMembers.botId, this.o.botId), eq(botMembers.guildId, guildId), eq(botMembers.userId, userId)));
    return m!;
  }
  private actualizarMiembro(guildId: string, userId: string, cambios: Partial<typeof botMembers.$inferInsert>) {
    return this.o.db.update(botMembers).set(cambios).where(and(eq(botMembers.botId, this.o.botId), eq(botMembers.guildId, guildId), eq(botMembers.userId, userId)));
  }

  // ---------------------------------------------------------------- eventos
  private eventos(cliente: Client): void {
    cliente.on(Events.GuildCreate, async (g) => {
      if (this.estadoActual !== "encendido") return;
      await cliente.application?.commands.set(construirComandos(this.config), g.id).catch(() => undefined);
    });

    cliente.on(Events.GuildMemberAdd, async (m) => {
      const b = this.config.bienvenida;
      const vars = { usuario: `<@${m.id}>`, servidor: m.guild.name, miembros: m.guild.memberCount };
      if (b.activa) {
        if (b.rolesAlEntrar.length) await m.roles.add(b.rolesAlEntrar).catch(() => undefined);
        const canal = await this.canalDe(m.guild, b.canalId);
        if (canal && "send" in canal) {
          const texto = rellenar(b.mensaje, vars);
          const embed = b.conEmbed ? new EmbedBuilder().setDescription(texto).setColor(this.color()).setThumbnail(m.user.displayAvatarURL()).setTimestamp() : null;
          if (embed && b.imagen) embed.setImage(b.imagen);
          await canal.send({ ...(embed ? { embeds: [embed] } : { content: texto }), allowedMentions: { users: [m.id] } }).catch(() => undefined);
        }
        if (b.md.activo) await m.send({ content: rellenar(b.md.mensaje, { ...vars, usuario: m.displayName }) }).catch(() => undefined);
      }
      if (this.config.registros.entradas) await this.logRegistro(m.guild, "Entró un miembro", `${m.user.tag} (${m.id})\nCuenta creada <t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`, true);
    });

    cliente.on(Events.GuildMemberRemove, async (m) => {
      const d = this.config.bienvenida.despedida;
      if (this.config.bienvenida.activa && d.activa) {
        const canal = await this.canalDe(m.guild, d.canalId);
        if (canal && "send" in canal) await canal.send({ content: rellenar(d.mensaje, { usuario: m.user?.tag ?? "Alguien", servidor: m.guild.name, miembros: m.guild.memberCount }), allowedMentions: { parse: [] } }).catch(() => undefined);
      }
      if (this.config.registros.salidas) await this.logRegistro(m.guild, "Salió un miembro", `${m.user?.tag ?? m.id} (${m.id})`, false);
    });

    cliente.on(Events.MessageDelete, async (msg: Message | PartialMessage) => {
      if (!msg.guild || msg.author?.bot || !this.config.registros.borrados) return;
      await this.logRegistro(msg.guild, "Mensaje borrado", `**${msg.author?.tag ?? "Alguien"}** en <#${msg.channelId}>:\n${msg.content ?? "(no guardado)"}`, false);
    });
    cliente.on(Events.MessageUpdate, async (a, b) => {
      if (!b.guild || b.author?.bot || !this.config.registros.editados || a.content === b.content) return;
      await this.logRegistro(b.guild, "Mensaje editado", `**${b.author?.tag ?? "Alguien"}** en <#${b.channelId}>:\nAntes: ${a.content ?? "(no guardado)"}\nDespués: ${b.content ?? ""}`, true);
    });

    cliente.on(Events.MessageCreate, (msg) => void this.alMensaje(msg).catch((e: unknown) => this.o.alError(explicarError(e))));
    cliente.on(Events.InteractionCreate, (i) => {
      const tarea = i.isChatInputCommand() ? this.alComando(i) : i.isButton() ? this.alBoton(i) : null;
      void tarea?.catch(async (e: unknown) => {
        this.o.alError(explicarError(e));
        if (i.isRepliable()) {
          const r = { content: "Algo salió mal con ese comando. Avisa a quien administra el bot.", flags: SOLO_YO } as const;
          if (i.replied || i.deferred) await i.followUp(r).catch(() => undefined);
          else await i.reply(r).catch(() => undefined);
        }
      });
    });
  }

  // ---------------------------------------------------------------- mensajes: moderación y niveles
  private async sancionar(msg: Message, motivo: string, accion: "borrar" | "advertir" | "timeout", timeoutMin = 5): Promise<void> {
    const guild = msg.guild!;
    await msg.delete().catch(() => undefined);
    if (accion === "advertir") {
      await this.advertencia(guild, msg.author.id, this.cliente!.user!.id, motivo);
      const canal = msg.channel as { send?: (m: unknown) => Promise<Message> };
      const aviso = typeof canal.send === "function" ? await canal.send({ content: `${msg.author}, ${motivo}`, allowedMentions: { users: [msg.author.id] } }).catch(() => null) : null;
      if (aviso) setTimeout(() => void aviso.delete().catch(() => undefined), 7000);
    } else if (accion === "timeout") {
      await msg.member?.timeout(timeoutMin * 60_000, motivo).catch(() => undefined);
    }
    if (this.config.registros.sanciones || this.config.moderacion.canalLogs) {
      await this.log(guild, this.config.moderacion.canalLogs || this.config.registros.canalId, new EmbedBuilder().setTitle("Moderación automática").setDescription(`${msg.author.tag}: ${motivo}\nAcción: ${accion}`).setColor(0xfee75c).setTimestamp());
    }
  }

  /** Anota una advertencia y aplica la sanción si ya se juntaron las que dice la configuración. */
  private async advertencia(guild: Guild, userId: string, modId: string, razon: string): Promise<number> {
    await this.o.db.insert(botWarns).values({ botId: this.o.botId, guildId: guild.id, userId, modId, reason: razon });
    const [{ n } = { n: 0 }] = await this.o.db.select({ n: count() }).from(botWarns).where(and(eq(botWarns.botId, this.o.botId), eq(botWarns.guildId, guild.id), eq(botWarns.userId, userId)));
    const a = this.config.moderacion.advertencias;
    if (a.activo && n >= a.cantidad) {
      const miembro = await guild.members.fetch(userId).catch(() => null);
      if (miembro) {
        const motivo = `${n} advertencias`;
        if (a.accion === "ban") await miembro.ban({ reason: motivo }).catch(() => undefined);
        else if (a.accion === "kick") await miembro.kick(motivo).catch(() => undefined);
        else await miembro.timeout(a.timeoutMin * 60_000, motivo).catch(() => undefined);
      }
    }
    return n;
  }

  private async alMensaje(msg: Message): Promise<void> {
    if (!msg.guild || msg.author.bot || !msg.member) return;
    const mod = this.config.moderacion;
    if (mod.activa && !this.inmune(msg.member)) {
      const texto = msg.content;
      const palabra = mod.palabras.activo ? palabraProhibida(texto, mod.palabras.lista) : null;
      if (palabra) return this.sancionar(msg, "ese mensaje usa una palabra que no está permitida aquí.", mod.palabras.accion, 10);
      const enlace = mod.antienlaces.activo ? enlaceNoPermitido(texto, mod.antienlaces.permitidos) : null;
      if (enlace) return this.sancionar(msg, "aquí no se pueden mandar enlaces.", mod.antienlaces.accion, 10);
      if (mod.menciones.activo && msg.mentions.users.size + msg.mentions.roles.size > mod.menciones.maximo) return this.sancionar(msg, "demasiadas menciones en un mensaje.", mod.menciones.accion, 10);
      if (mod.antispam.activo) {
        const clave = `${msg.guild.id}:${msg.author.id}`;
        const r = revisarSpam(this.spam.get(clave) ?? [], Date.now(), mod.antispam.mensajes, mod.antispam.segundos);
        this.spam.set(clave, r.excede ? [] : r.marcas);
        if (r.excede) return this.sancionar(msg, "calma, estás mandando mensajes muy rápido.", mod.antispam.accion, mod.antispam.timeoutMin);
      }
    }
    const n = this.config.niveles;
    if (n.activo && !n.ignorados.includes(msg.channelId) && msg.content.length >= 3) {
      const clave = `${msg.guild.id}:${msg.author.id}`;
      const ahora = Date.now();
      if (ahora - (this.ultimoXp.get(clave) ?? 0) < n.enfriamiento * 1000) return;
      this.ultimoXp.set(clave, ahora);
      const m = await this.miembroDb(msg.guild.id, msg.author.id);
      const ganada = n.xpMin + Math.floor(Math.random() * (Math.max(n.xpMax, n.xpMin) - n.xpMin + 1));
      const r = sumarXp(m.level, m.xp, ganada);
      await this.actualizarMiembro(msg.guild.id, msg.author.id, { xp: r.xp, level: r.nivel, messages: m.messages + 1, lastXpAt: this.o.ahora() });
      if (r.subio) {
        const canal = (await this.canalDe(msg.guild, n.canalAviso)) ?? msg.channel;
        await this.decir(canal, { content: rellenar(n.mensaje, { usuario: `<@${msg.author.id}>`, nivel: r.nivel, servidor: msg.guild.name }), allowedMentions: { users: [msg.author.id] } });
        const roles = n.recompensas.filter((x) => x.nivel <= r.nivel).map((x) => x.rolId).filter((id) => !msg.member!.roles.cache.has(id));
        if (roles.length) await msg.member.roles.add(roles).catch(() => undefined);
      }
    }
  }

  // ---------------------------------------------------------------- comandos de barra
  private async alComando(i: ChatInputCommandInteraction): Promise<void> {
    const guild = i.guild;
    if (!guild) return void (await i.reply({ content: "Solo funciona dentro de un servidor.", flags: SOLO_YO }));
    const c = this.config;
    const nombre = i.commandName;
    const solo = (contenido: string) => i.reply({ content: contenido, flags: SOLO_YO, allowedMentions: { parse: [] } });
    const moneda = c.economia.moneda;
    const dinero = (n: number) => `${moneda.simbolo} ${n.toLocaleString("es-MX")} ${moneda.nombre}`;
    const objetivo = () => i.options.getUser("usuario") ?? i.user;

    // Comandos propios
    const propio = c.comandos.find((k) => k.nombre === nombre);
    if (propio) {
      const texto = rellenar(propio.respuesta, { usuario: `<@${i.user.id}>`, servidor: guild.name, miembros: guild.memberCount });
      return void (await i.reply({ ...(propio.conEmbed ? { embeds: [new EmbedBuilder().setDescription(texto).setColor(this.color())] } : { content: texto }), ...(propio.privado ? { flags: SOLO_YO } : {}), allowedMentions: { users: [i.user.id] } }));
    }

    switch (nombre) {
      case "ping":
        return void (await solo(`🏓 Pong · ${this.cliente?.ws.ping ?? "?"} ms`));
      case "ayuda": {
        const nombres = construirComandos(c).map((x) => `/${x.name} — ${x.description}`);
        return void (await i.reply({ embeds: [new EmbedBuilder().setTitle("Comandos").setDescription(nombres.join("\n").slice(0, 4000)).setColor(this.color())], flags: SOLO_YO }));
      }
      case "avatar": {
        const u = objetivo();
        return void (await i.reply({ embeds: [new EmbedBuilder().setTitle(u.displayName).setImage(u.displayAvatarURL({ size: 1024 })).setColor(this.color())] }));
      }
      case "servidor":
        return void (await i.reply({ embeds: [new EmbedBuilder().setTitle(guild.name).setThumbnail(guild.iconURL()).addFields({ name: "Miembros", value: String(guild.memberCount), inline: true }, { name: "Creado", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }).setColor(this.color())] }));
      case "usuario": {
        const u = objetivo();
        const m = await guild.members.fetch(u.id).catch(() => null);
        return void (await i.reply({ embeds: [new EmbedBuilder().setTitle(u.tag).setThumbnail(u.displayAvatarURL()).addFields({ name: "Cuenta creada", value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`, inline: true }, { name: "Entró al servidor", value: m?.joinedTimestamp ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:R>` : "—", inline: true }).setColor(this.color())] }));
      }
      case "ban":
      case "kick":
      case "timeout":
      case "quitar-timeout":
      case "advertir":
      case "advertencias":
      case "limpiar":
        return this.moderar(i, nombre);
      case "rango": {
        const u = objetivo();
        const m = await this.miembroDb(guild.id, u.id);
        const falta = xpParaSubir(m.level);
        return void (await i.reply({ embeds: [new EmbedBuilder().setTitle(`Nivel de ${u.displayName}`).setDescription(`**Nivel ${m.level}**\nXP: ${m.xp} / ${falta}\nMensajes contados: ${m.messages}`).setColor(this.color())] }));
      }
      case "top-niveles": {
        const filas = await this.o.db.select().from(botMembers).where(and(eq(botMembers.botId, this.o.botId), eq(botMembers.guildId, guild.id))).orderBy(desc(botMembers.level), desc(botMembers.xp)).limit(10);
        return void (await i.reply({ embeds: [new EmbedBuilder().setTitle("Top de niveles").setDescription(filas.map((f, n) => `**${n + 1}.** <@${f.userId}> — nivel ${f.level} (${f.xp} XP)`).join("\n") || "Todavía nadie tiene XP.").setColor(this.color())], allowedMentions: { parse: [] } }));
      }
      case "balance": {
        const u = objetivo();
        const m = await this.miembroDb(guild.id, u.id);
        return void (await i.reply({ embeds: [new EmbedBuilder().setTitle(`Cartera de ${u.displayName}`).setDescription(dinero(m.coins)).setColor(this.color())] }));
      }
      case "diario":
      case "trabajar":
        return this.cobrar(i, nombre, dinero);
      case "pagar": {
        const u = i.options.getUser("usuario", true);
        const monto = i.options.getInteger("monto", true);
        if (u.bot || u.id === i.user.id) return void (await solo("Elige a otra persona."));
        const yo = await this.miembroDb(guild.id, i.user.id);
        if (yo.coins < monto) return void (await solo(`No te alcanza: tienes ${dinero(yo.coins)}.`));
        await this.miembroDb(guild.id, u.id);
        await this.o.db.update(botMembers).set({ coins: sql`${botMembers.coins} - ${monto}` }).where(and(eq(botMembers.botId, this.o.botId), eq(botMembers.guildId, guild.id), eq(botMembers.userId, i.user.id)));
        await this.o.db.update(botMembers).set({ coins: sql`${botMembers.coins} + ${monto}` }).where(and(eq(botMembers.botId, this.o.botId), eq(botMembers.guildId, guild.id), eq(botMembers.userId, u.id)));
        return void (await i.reply({ content: `💸 ${i.user} le pagó ${dinero(monto)} a ${u}.`, allowedMentions: { users: [u.id] } }));
      }
      case "tienda":
        return void (await i.reply({ embeds: [new EmbedBuilder().setTitle("Tienda").setDescription(c.economia.tienda.map((t) => `**${t.nombre}** — ${dinero(t.precio)}${t.descripcion ? `\n${t.descripcion}` : ""}${t.rolId ? `\nDa el rol <@&${t.rolId}>` : ""}`).join("\n\n") || "La tienda está vacía.").setColor(this.color())], flags: SOLO_YO, allowedMentions: { parse: [] } }));
      case "comprar": {
        const item = c.economia.tienda.find((t) => t.id === i.options.getString("articulo", true));
        if (!item) return void (await solo("Ese artículo ya no existe."));
        const m = await this.miembroDb(guild.id, i.user.id);
        if (m.coins < item.precio) return void (await solo(`Te faltan ${dinero(item.precio - m.coins)}.`));
        if (item.rolId) {
          const miembro = await guild.members.fetch(i.user.id);
          if (miembro.roles.cache.has(item.rolId)) return void (await solo("Ya tienes ese rol."));
          await miembro.roles.add(item.rolId).catch(() => {
            throw new Error("No pude darte el rol (el rol del bot debe estar por encima).");
          });
        }
        await this.o.db.update(botMembers).set({ coins: sql`${botMembers.coins} - ${item.precio}` }).where(and(eq(botMembers.botId, this.o.botId), eq(botMembers.guildId, guild.id), eq(botMembers.userId, i.user.id)));
        return void (await solo(`✅ Compraste **${item.nombre}** por ${dinero(item.precio)}.`));
      }
      case "top-monedas": {
        const filas = await this.o.db.select().from(botMembers).where(and(eq(botMembers.botId, this.o.botId), eq(botMembers.guildId, guild.id))).orderBy(desc(botMembers.coins)).limit(10);
        return void (await i.reply({ embeds: [new EmbedBuilder().setTitle("Los más ricos").setDescription(filas.filter((f) => f.coins > 0).map((f, n) => `**${n + 1}.** <@${f.userId}> — ${dinero(f.coins)}`).join("\n") || "Todavía nadie tiene dinero.").setColor(this.color())], allowedMentions: { parse: [] } }));
      }
      case "dar-monedas": {
        const u = i.options.getUser("usuario", true);
        const monto = i.options.getInteger("monto", true);
        await this.miembroDb(guild.id, u.id);
        await this.o.db.update(botMembers).set({ coins: sql`${botMembers.coins} + ${monto}` }).where(and(eq(botMembers.botId, this.o.botId), eq(botMembers.guildId, guild.id), eq(botMembers.userId, u.id)));
        return void (await i.reply({ content: `🪙 Le diste ${dinero(monto)} a ${u}.`, allowedMentions: { users: [u.id] } }));
      }
      case "panel-tickets": {
        if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return void (await solo("Necesitas el permiso Gestionar servidor."));
        const t = c.tickets;
        const canal = i.channel;
        if (!canal || !("send" in canal)) return void (await solo("Usa este comando en un canal de texto."));
        await canal.send({ embeds: [new EmbedBuilder().setTitle(t.panel.titulo).setDescription(t.panel.texto).setColor(this.color())], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("tk:abrir").setLabel(t.panel.boton).setEmoji("🎫").setStyle(ButtonStyle.Primary))] });
        return void (await solo("Panel publicado."));
      }
      case "cerrar-ticket":
        return this.cerrarTicket(i);
      case "panel-roles": {
        if (!i.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) return void (await solo("Necesitas el permiso Gestionar roles."));
        const p = c.roles.paneles.find((x) => x.id === i.options.getString("panel", true));
        const canal = i.channel;
        if (!p || !canal || !("send" in canal)) return void (await solo("No encontré ese panel."));
        const filas: ActionRowBuilder<ButtonBuilder>[] = [];
        for (let k = 0; k < p.roles.length; k += 5) {
          filas.push(new ActionRowBuilder<ButtonBuilder>().addComponents(p.roles.slice(k, k + 5).map((r) => new ButtonBuilder().setCustomId(`rb:${r.rolId}`).setLabel(r.etiqueta).setStyle(ButtonStyle.Secondary).setEmoji(r.emoji || "🔹"))));
        }
        await canal.send({ embeds: [new EmbedBuilder().setTitle(p.titulo).setDescription(p.texto).setColor(this.color())], components: filas });
        return void (await solo("Panel publicado."));
      }
      case "respaldo-servidor":
        return this.respaldo(i);
      default:
        return void (await solo("Ese comando ya no está activo."));
    }
  }

  private async moderar(i: ChatInputCommandInteraction, cmd: string): Promise<void> {
    const guild = i.guild!;
    const respuesta = (t: string) => i.reply({ content: t, flags: SOLO_YO, allowedMentions: { parse: [] } });
    const permisos: Record<string, bigint> = { ban: PermissionFlagsBits.BanMembers, kick: PermissionFlagsBits.KickMembers, timeout: PermissionFlagsBits.ModerateMembers, "quitar-timeout": PermissionFlagsBits.ModerateMembers, advertir: PermissionFlagsBits.ModerateMembers, advertencias: PermissionFlagsBits.ModerateMembers, limpiar: PermissionFlagsBits.ManageMessages };
    if (!i.memberPermissions?.has(permisos[cmd]!)) return void (await respuesta("No tienes permiso para eso."));
    if (cmd === "limpiar") {
      const canal = i.channel;
      if (!canal || !("bulkDelete" in canal)) return void (await respuesta("Usa este comando en un canal de texto."));
      const borrados = await canal.bulkDelete(i.options.getInteger("cantidad", true), true);
      return void (await respuesta(`🧹 Borré ${borrados.size} mensaje(s) (Discord no deja borrar los de más de 14 días).`));
    }
    const usuario = i.options.getUser("usuario", true);
    const razon = i.options.getString("razon") ?? "Sin motivo";
    if (cmd === "advertencias") {
      const filas = await this.o.db.select().from(botWarns).where(and(eq(botWarns.botId, this.o.botId), eq(botWarns.guildId, guild.id), eq(botWarns.userId, usuario.id))).orderBy(desc(botWarns.createdAt)).limit(15);
      return void (await i.reply({ embeds: [new EmbedBuilder().setTitle(`Advertencias de ${usuario.displayName}`).setDescription(filas.map((f, n) => `**${n + 1}.** ${f.reason} — <t:${Math.floor(f.createdAt.getTime() / 1000)}:R>`).join("\n") || "Sin advertencias.").setColor(this.color())], flags: SOLO_YO }));
    }
    const miembro = await guild.members.fetch(usuario.id).catch(() => null);
    if (!miembro) return void (await respuesta("Ese usuario no está en el servidor."));
    if (miembro.id === i.user.id || miembro.id === guild.ownerId) return void (await respuesta("No puedes hacerlo con esa persona."));
    if (cmd === "ban") {
      if (!miembro.bannable) return void (await respuesta("No puedo banear a esa persona (su rol está por encima del mío)."));
      await miembro.ban({ reason: `${razon} (por ${i.user.tag})` });
    } else if (cmd === "kick") {
      if (!miembro.kickable) return void (await respuesta("No puedo expulsar a esa persona (su rol está por encima del mío)."));
      await miembro.kick(`${razon} (por ${i.user.tag})`);
    } else if (cmd === "timeout") {
      if (!miembro.moderatable) return void (await respuesta("No puedo silenciar a esa persona."));
      await miembro.timeout(i.options.getInteger("minutos", true) * 60_000, `${razon} (por ${i.user.tag})`);
    } else if (cmd === "quitar-timeout") {
      await miembro.timeout(null).catch(() => undefined);
    } else {
      const n = await this.advertencia(guild, usuario.id, i.user.id, razon);
      await usuario.send(`Recibiste una advertencia en **${guild.name}**: ${razon}`).catch(() => undefined);
      await this.registroSancion(guild, i, cmd, usuario.tag, `${razon} (advertencia #${n})`);
      return void (await i.reply({ content: `⚠️ ${usuario} ahora tiene ${n} advertencia(s). Motivo: ${razon}`, allowedMentions: { users: [usuario.id] } }));
    }
    await this.registroSancion(guild, i, cmd, usuario.tag, razon);
    await i.reply({ content: `✅ ${cmd === "quitar-timeout" ? "Quité el silencio a" : cmd === "ban" ? "Baneé a" : cmd === "kick" ? "Expulsé a" : "Silencié a"} **${usuario.tag}**. Motivo: ${razon}`, allowedMentions: { parse: [] } });
  }

  private async registroSancion(guild: Guild, i: ChatInputCommandInteraction, accion: string, quien: string, razon: string): Promise<void> {
    if (!this.config.registros.sanciones && !this.config.moderacion.canalLogs) return;
    await this.log(guild, this.config.moderacion.canalLogs || this.config.registros.canalId, new EmbedBuilder().setTitle(`Sanción: ${accion}`).setDescription(`**Para:** ${quien}\n**Por:** ${i.user.tag}\n**Motivo:** ${razon}`).setColor(0xed4245).setTimestamp());
  }

  /** /diario y /trabajar con su tiempo de espera. */
  private async cobrar(i: ChatInputCommandInteraction, cmd: "diario" | "trabajar", dinero: (n: number) => string): Promise<void> {
    const guild = i.guild!;
    const e = this.config.economia;
    const cfg = cmd === "diario" ? { ...e.diario, espera: e.diario.horas * 3_600_000 } : { ...e.trabajo, espera: e.trabajo.minutos * 60_000 };
    const m = await this.miembroDb(guild.id, i.user.id);
    const ultima = (cmd === "diario" ? m.dailyAt : m.workAt)?.getTime() ?? 0;
    const falta = ultima + cfg.espera - Date.now();
    if (falta > 0) return void (await i.reply({ content: `⏳ Todavía no. Vuelve <t:${Math.floor((Date.now() + falta) / 1000)}:R>.`, flags: SOLO_YO }));
    const ganado = cfg.min + Math.floor(Math.random() * (Math.max(cfg.max, cfg.min) - cfg.min + 1));
    await this.actualizarMiembro(guild.id, i.user.id, { coins: m.coins + ganado, ...(cmd === "diario" ? { dailyAt: this.o.ahora() } : { workAt: this.o.ahora() }) });
    await i.reply({ content: cmd === "diario" ? `🎁 Tu recompensa diaria: ${dinero(ganado)}.` : `💼 Trabajaste y ganaste ${dinero(ganado)}.` });
  }

  // ---------------------------------------------------------------- tickets y roles con botones
  private async alBoton(i: ButtonInteraction): Promise<void> {
    const guild = i.guild;
    if (!guild) return;
    if (i.customId === "tk:abrir") return this.abrirTicket(i, guild);
    if (i.customId === "tk:cerrar") return this.cerrarTicket(i);
    if (i.customId.startsWith("rb:")) {
      const rolId = i.customId.slice(3);
      const miembro = await guild.members.fetch(i.user.id);
      const tiene = miembro.roles.cache.has(rolId);
      try {
        if (tiene) await miembro.roles.remove(rolId);
        else await miembro.roles.add(rolId);
      } catch {
        return void (await i.reply({ content: "No pude cambiar tu rol: el rol del bot debe estar por encima de ese rol.", flags: SOLO_YO }));
      }
      await i.reply({ content: tiene ? `Te quité el rol <@&${rolId}>.` : `Ahora tienes el rol <@&${rolId}>.`, flags: SOLO_YO, allowedMentions: { parse: [] } });
    }
  }

  private async abrirTicket(i: ButtonInteraction, guild: Guild): Promise<void> {
    const t = this.config.tickets;
    if (!t.activo) return void (await i.reply({ content: "Los tickets están apagados.", flags: SOLO_YO }));
    const abiertos = await this.o.db.select({ n: count() }).from(botTickets).where(and(eq(botTickets.botId, this.o.botId), eq(botTickets.guildId, guild.id), eq(botTickets.userId, i.user.id), eq(botTickets.status, "abierto")));
    if ((abiertos[0]?.n ?? 0) >= t.maximo) return void (await i.reply({ content: `Ya tienes ${t.maximo} ticket(s) abierto(s).`, flags: SOLO_YO }));
    const [{ max } = { max: 0 }] = await this.o.db.select({ max: sql<number>`coalesce(max(${botTickets.number}), 0)::int` }).from(botTickets).where(and(eq(botTickets.botId, this.o.botId), eq(botTickets.guildId, guild.id)));
    const numero = max + 1;
    const canal = await guild.channels.create({
      name: `ticket-${String(numero).padStart(4, "0")}`,
      type: ChannelType.GuildText,
      ...(t.categoriaId ? { parent: t.categoriaId } : {}),
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: this.cliente!.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
        ...t.soporteIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
      ],
    });
    await this.o.db.insert(botTickets).values({ botId: this.o.botId, guildId: guild.id, channelId: canal.id, userId: i.user.id, number: numero });
    await canal.send({
      content: `${i.user}${t.soporteIds.length ? ` ${t.soporteIds.map((r) => `<@&${r}>`).join(" ")}` : ""}`,
      embeds: [new EmbedBuilder().setDescription(rellenar(t.bienvenida, { usuario: `<@${i.user.id}>`, servidor: guild.name })).setColor(this.color())],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("tk:cerrar").setLabel("Cerrar ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger))],
      allowedMentions: { users: [i.user.id], roles: t.soporteIds },
    });
    await i.reply({ content: `Tu ticket está listo: ${canal}`, flags: SOLO_YO });
  }

  private async cerrarTicket(i: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
    const guild = i.guild!;
    const [ticket] = await this.o.db.select().from(botTickets).where(and(eq(botTickets.botId, this.o.botId), eq(botTickets.channelId, i.channelId ?? ""), eq(botTickets.status, "abierto")));
    if (!ticket) return void (await i.reply({ content: "Este canal no es un ticket abierto.", flags: SOLO_YO }));
    const miembro = await guild.members.fetch(i.user.id);
    const puede = ticket.userId === i.user.id || miembro.permissions.has(PermissionFlagsBits.ManageChannels) || this.config.tickets.soporteIds.some((r) => miembro.roles.cache.has(r));
    if (!puede) return void (await i.reply({ content: "Solo quien abrió el ticket o el equipo puede cerrarlo.", flags: SOLO_YO }));
    await i.reply({ content: "🔒 Cerrando el ticket en 5 segundos…" });
    await this.o.db.update(botTickets).set({ status: "cerrado", closedAt: this.o.ahora() }).where(eq(botTickets.id, ticket.id));
    const canal = i.channel;
    if (canal && "messages" in canal) {
      const mensajes = await canal.messages.fetch({ limit: 100 }).catch(() => null);
      const logs = await this.canalDe(guild, this.config.tickets.canalLogs);
      if (mensajes && logs && "send" in logs) {
        const texto = [...mensajes.values()].reverse().map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join("\n");
        await logs.send({ content: `Ticket #${ticket.number} cerrado por ${i.user.tag} (abierto por <@${ticket.userId}>)`, files: [new AttachmentBuilder(Buffer.from(texto || "(vacío)"), { name: `ticket-${ticket.number}.txt` })], allowedMentions: { parse: [] } }).catch(() => undefined);
      }
    }
    setTimeout(() => void i.channel?.delete().catch(() => undefined), 5000);
  }

  /** Archivo con la estructura del servidor (roles y canales) como respaldo estilo Xenon. */
  private async respaldo(i: ChatInputCommandInteraction): Promise<void> {
    const guild = i.guild!;
    if (!i.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void (await i.reply({ content: "Solo los administradores.", flags: SOLO_YO }));
    await i.deferReply({ flags: SOLO_YO });
    const roles = await guild.roles.fetch();
    const canales = await guild.channels.fetch();
    const nombreRol = (id: string) => roles.get(id)?.name ?? id;
    const datos = {
      servidor: guild.name,
      fecha: this.o.ahora().toISOString(),
      roles: [...roles.values()].filter((r) => r.id !== guild.id && !r.managed).sort((a, b) => b.position - a.position).map((r) => ({ nombre: r.name, color: r.hexColor, permisos: r.permissions.bitfield.toString(), separado: r.hoist, mencionable: r.mentionable })),
      canales: [...canales.values()]
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .sort((a, b) => ("rawPosition" in a && "rawPosition" in b ? a.rawPosition - b.rawPosition : 0))
        .map((c) => ({
          nombre: c.name,
          tipo: ChannelType[c.type],
          categoria: c.parent?.name ?? null,
          tema: "topic" in c ? c.topic : null,
          permisos: "permissionOverwrites" in c ? c.permissionOverwrites.cache.map((p) => ({ para: p.type === 0 ? nombreRol(p.id) : p.id, permite: p.allow.bitfield.toString(), niega: p.deny.bitfield.toString() })) : [],
        })),
    };
    await i.editReply({ content: "Aquí está la estructura de tu servidor (roles y canales). Guárdala: sirve de referencia para reconstruirlo.", files: [new AttachmentBuilder(Buffer.from(JSON.stringify(datos, null, 2)), { name: `respaldo-${guild.name.replace(/[^\w-]+/g, "_")}.json` })] });
  }
}
