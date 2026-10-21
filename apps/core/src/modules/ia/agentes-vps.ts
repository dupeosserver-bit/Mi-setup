/**
 * Agentes de terminal del VPS (Claude Code, Gemini CLI) como IA del asistente.
 * La conversación se manda por SSH al agente en modo «solo responder»: sin
 * herramientas de comandos ni de edición. Usa la cuenta con la que se inició
 * sesión en el VPS, así que no suma al tope mensual de Mi Setup.
 */
import { HttpError } from "../../http-error.js";
import type { Servidores } from "../vps/servidores.js";
import { citar, ejecutar } from "../vps/ssh.js";
import type { BloqueIa, ClienteIa } from "./servicio.js";

export type AgenteVps = "claude-code" | "gemini-cli";

const COMANDOS: Record<AgenteVps, { nombre: string; binario: string; correr: string }> = {
  "claude-code": {
    nombre: "Claude Code",
    binario: "claude",
    correr: "claude -p --output-format text --disallowedTools Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch",
  },
  "gemini-cli": {
    nombre: "Gemini CLI",
    binario: "gemini",
    correr: 'gemini --approval-mode default -p "Responde al último mensaje del usuario."',
  },
};

const aTexto = (b: BloqueIa): string => {
  if (b.type === "text") return b.text ?? "";
  if (b.type === "image" || b.type === "document") return "[archivo adjunto: este agente no lo recibe]";
  return "";
};

/** Arma la conversación como un solo texto (los agentes de terminal reciben un prompt). */
export function promptDeConversacion(sistema: string, mensajes: readonly { role: string; content: BloqueIa[] }[]): string {
  const partes = [`Instrucciones (de Mi Setup):\n${sistema}`, ...mensajes.map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}:\n${m.content.map(aTexto).filter(Boolean).join("\n")}`)];
  partes.push("Responde en español al último mensaje del usuario, como el asistente. No ejecutes comandos ni cambies archivos: si hace falta, explica los pasos.");
  // Lo más reciente es lo importante: si es muy largo se recorta por el principio.
  const texto = partes.join("\n\n");
  return texto.length > 80_000 ? texto.slice(-80_000) : texto;
}

export function clienteAgente(servidores: Servidores, agente: AgenteVps): ClienteIa {
  const c = COMANDOS[agente];
  return {
    async mensajes(p) {
      const [s] = await servidores.listar();
      if (!s) throw new HttpError(400, "Agrega primero tu VPS en VPS → Terminal", "ia_agente");
      const prompt = Buffer.from(promptDeConversacion(p.sistema, p.mensajes)).toString("base64");
      const comando = [
        'export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.local/bin:$HOME/.npm-global/bin"',
        `command -v ${c.binario} >/dev/null 2>&1 || { echo MISETUP_SIN_AGENTE; exit 3; }`,
        `cd ~ && echo ${citar(prompt)} | base64 -d | timeout 240 ${c.correr} 2>&1`,
      ].join("; ");
      const r = await servidores.usar(s.id, (cliente) => ejecutar(cliente, comando, { timeoutMs: 250_000, maxBytes: 256 * 1024 }));
      const salida = r.salida.trim();
      if (salida.includes("MISETUP_SIN_AGENTE")) throw new HttpError(400, `${c.nombre} no está instalado en ${s.name}: instálalo en VPS → Agentes.`, "ia_agente");
      if (r.codigo === 124) throw new HttpError(504, "El agente tardó más de 4 minutos en responder", "ia_agente");
      if (r.codigo !== 0 && /log ?in|auth|api key|credential|unauthori[sz]ed/i.test(salida)) {
        throw new HttpError(400, `${c.nombre} necesita iniciar sesión en el VPS: abre la Terminal y corre «${c.binario}» una vez.`, "ia_agente");
      }
      if (r.codigo !== 0 && !salida) throw new HttpError(502, `${c.nombre} terminó con error ${r.codigo ?? "?"}`, "ia_agente");
      return {
        model: `agente:${agente}`,
        stop_reason: "end_turn",
        content: [{ type: "text", text: salida || "(sin respuesta)" }],
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  };
}
