/**
 * Agentes de IA en tu VPS:
 * - Catálogo de agentes conocidos que se instalan con un botón (Docker o npm),
 *   cada uno con lo que hace, cuánta RAM pide y cómo se abre.
 * - Buscar más en GitHub (por páginas). Esos no se instalan solos: la IA lee el
 *   repositorio y te propone los comandos, que tú apruebas.
 * Instalar o quitar pide reautenticación fuerte y escribir el nombre del servidor.
 * Los paneles web quedan solo en 127.0.0.1 (ábrelos con un túnel o un subdominio).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "../common.js";
import type { Servidores } from "./servidores.js";
import { ejecutar } from "./ssh.js";

export interface Agente {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: "docker" | "npm" | "pipx" | "ollama";
  ramMb: number;
  /** Cómo se usa una vez instalado. */
  uso: string;
  web: string;
  /** Puerto local del panel (solo docker con interfaz). */
  puerto?: number;
  instalar: string[];
  quitar: string[];
  /** Comando que imprime algo si está instalado. */
  revisar: string;
}

const docker = (nombre: string, imagen: string, puertoLocal: number, puertoInterno: number, volumen: string, extra = "") =>
  `docker run -d --name ${nombre} --restart unless-stopped -p 127.0.0.1:${puertoLocal}:${puertoInterno} -v ${volumen} ${extra}${imagen}`.replace(/\s+/g, " ");

export const CATALOGO: readonly Agente[] = [
  {
    id: "claude-code",
    nombre: "Claude Code",
    descripcion: "El agente de programación de Anthropic en la terminal: lee tu código, edita archivos y corre comandos con tu permiso.",
    tipo: "npm",
    ramMb: 512,
    uso: "En la Terminal del VPS escribe «claude» dentro de la carpeta de tu proyecto (necesita tu clave o cuenta de Claude).",
    web: "https://docs.anthropic.com/en/docs/claude-code",
    instalar: ["command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs)", "npm install -g @anthropic-ai/claude-code"],
    quitar: ["npm uninstall -g @anthropic-ai/claude-code"],
    revisar: "command -v claude",
  },
  {
    id: "gemini-cli",
    nombre: "Gemini CLI",
    descripcion: "Agente de Google para la terminal; tiene un nivel gratis con tu cuenta de Google.",
    tipo: "npm",
    ramMb: 512,
    uso: "En la Terminal escribe «gemini».",
    web: "https://github.com/google-gemini/gemini-cli",
    instalar: ["command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs)", "npm install -g @google/gemini-cli"],
    quitar: ["npm uninstall -g @google/gemini-cli"],
    revisar: "command -v gemini",
  },
  {
    id: "aider",
    nombre: "Aider",
    descripcion: "Programa en pareja con IA desde la terminal; funciona con Claude, GPT o modelos locales de Ollama.",
    tipo: "pipx",
    ramMb: 512,
    uso: "En la Terminal, dentro de tu proyecto con git: «aider».",
    web: "https://aider.chat",
    instalar: ["command -v pipx >/dev/null || (apt-get update -q && apt-get install -y -q pipx)", "pipx install aider-chat", "pipx ensurepath"],
    quitar: ["pipx uninstall aider-chat"],
    revisar: "command -v aider || ls ~/.local/bin/aider 2>/dev/null",
  },
  {
    id: "llama-ligero",
    nombre: "Llama 3.2 (3B) en Ollama",
    descripcion: "Modelo gratis que corre en tu VPS con el Ollama de Mi Setup. Ligero: unos 3 GB de RAM.",
    tipo: "ollama",
    ramMb: 3000,
    uso: "Elígelo en IA asistente como «Llama local» (OLLAMA_MODEL=llama3.2:3b).",
    web: "https://ollama.com/library/llama3.2",
    instalar: ["docker exec misetup-ollama ollama pull llama3.2:3b"],
    quitar: ["docker exec misetup-ollama ollama rm llama3.2:3b"],
    revisar: "docker exec misetup-ollama ollama list 2>/dev/null | grep -q 'llama3.2:3b' && echo si",
  },
  {
    id: "qwen-codigo",
    nombre: "Qwen 2.5 Coder (7B) en Ollama",
    descripcion: "Modelo local bueno para código. Pide unos 6 GB de RAM.",
    tipo: "ollama",
    ramMb: 6000,
    uso: "Ponlo en OLLAMA_MODEL=qwen2.5-coder:7b o úsalo desde Aider u Open WebUI.",
    web: "https://ollama.com/library/qwen2.5-coder",
    instalar: ["docker exec misetup-ollama ollama pull qwen2.5-coder:7b"],
    quitar: ["docker exec misetup-ollama ollama rm qwen2.5-coder:7b"],
    revisar: "docker exec misetup-ollama ollama list 2>/dev/null | grep -q 'qwen2.5-coder:7b' && echo si",
  },
  {
    id: "open-webui",
    nombre: "Open WebUI",
    descripcion: "Chat tipo ChatGPT para tus modelos de Ollama y APIs, con historial y documentos.",
    tipo: "docker",
    ramMb: 1024,
    puerto: 3010,
    uso: "Queda en 127.0.0.1:3010. Ábrelo con un túnel SSH (ssh -L 3010:127.0.0.1:3010 root@TU_IP) o con un subdominio.",
    web: "https://github.com/open-webui/open-webui",
    // Se une a la red del Ollama de Mi Setup (si está) para usar tus modelos locales.
    instalar: [
      `N=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' misetup-ollama 2>/dev/null | awk '{print $1}'); ${docker("open-webui", "ghcr.io/open-webui/open-webui:main", 3010, 8080, "open-webui:/app/backend/data", '${N:+--network "$N"} -e OLLAMA_BASE_URL=http://misetup-ollama:11434 ')}`,
    ],
    quitar: ["docker rm -f open-webui"],
    revisar: "docker ps -a --format '{{.Names}}' | grep -x open-webui",
  },
  {
    id: "n8n",
    nombre: "n8n",
    descripcion: "Automatizaciones y agentes con bloques (como Zapier), con nodos de IA.",
    tipo: "docker",
    ramMb: 512,
    puerto: 5678,
    uso: "Queda en 127.0.0.1:5678 (túnel SSH o subdominio).",
    web: "https://n8n.io",
    instalar: [docker("n8n", "docker.n8n.io/n8nio/n8n", 5678, 5678, "n8n_data:/home/node/.n8n")],
    quitar: ["docker rm -f n8n"],
    revisar: "docker ps -a --format '{{.Names}}' | grep -x n8n",
  },
  {
    id: "flowise",
    nombre: "Flowise",
    descripcion: "Arma agentes y chatbots arrastrando bloques (LangChain).",
    tipo: "docker",
    ramMb: 768,
    puerto: 3011,
    uso: "Queda en 127.0.0.1:3011 (túnel SSH o subdominio).",
    web: "https://flowiseai.com",
    instalar: [docker("flowise", "flowiseai/flowise", 3011, 3000, "flowise:/root/.flowise")],
    quitar: ["docker rm -f flowise"],
    revisar: "docker ps -a --format '{{.Names}}' | grep -x flowise",
  },
  {
    id: "anythingllm",
    nombre: "AnythingLLM",
    descripcion: "Chatea con tus documentos usando modelos locales o de la nube.",
    tipo: "docker",
    ramMb: 1024,
    puerto: 3012,
    uso: "Queda en 127.0.0.1:3012 (túnel SSH o subdominio).",
    web: "https://anythingllm.com",
    instalar: [docker("anythingllm", "mintplexlabs/anythingllm", 3012, 3001, "anythingllm:/app/server/storage", "--cap-add SYS_ADMIN -e STORAGE_DIR=/app/server/storage ")],
    quitar: ["docker rm -f anythingllm"],
    revisar: "docker ps -a --format '{{.Names}}' | grep -x anythingllm",
  },
  {
    id: "langflow",
    nombre: "Langflow",
    descripcion: "Editor visual para crear agentes y flujos de IA.",
    tipo: "docker",
    ramMb: 1024,
    puerto: 3013,
    uso: "Queda en 127.0.0.1:3013 (túnel SSH o subdominio).",
    web: "https://www.langflow.org",
    instalar: [docker("langflow", "langflowai/langflow:latest", 3013, 7860, "langflow:/app/langflow")],
    quitar: ["docker rm -f langflow"],
    revisar: "docker ps -a --format '{{.Names}}' | grep -x langflow",
  },
];

const POR_ID = new Map(CATALOGO.map((a) => [a.id, a]));

export function agentesRoutes(deps: ModuleDeps, servidores: Servidores) {
  const leer = { config: { acceso: { modulo: "vps_agentes" as const, nivel: "lectura" as const } } };
  const fuerte = { config: { acceso: { modulo: "vps_agentes" as const, nivel: "administrar" as const, reauth: "fuerte" as const } } };

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vps/agentes/catalogo", leer, async () =>
      CATALOGO.map((a) => ({ id: a.id, nombre: a.nombre, descripcion: a.descripcion, tipo: a.tipo, ramMb: a.ramMb, uso: a.uso, web: a.web, puerto: a.puerto ?? null })),
    );

    /** Más agentes en GitHub (por estrellas, de 12 en 12). */
    app.get("/api/vps/agentes/buscar", leer, async (request) => {
      const d = z.object({ q: z.string().trim().max(80).default(""), pagina: z.coerce.number().int().min(1).max(50).default(1) }).parse(request.query);
      const consulta = d.q ? `${d.q} agent in:name,description,topics` : "topic:ai-agents";
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(`${consulta} stars:>200 archived:false`)}&sort=stars&order=desc&per_page=12&page=${d.pagina}`;
      const r = await fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "MiSetup" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!r) throw new HttpError(502, "GitHub no respondió");
      if (r.status === 403 || r.status === 429) throw new HttpError(429, "GitHub limita las búsquedas sin cuenta: espera un minuto.");
      if (!r.ok) throw new HttpError(502, `GitHub respondió ${r.status}`);
      const j = (await r.json()) as {
        total_count: number;
        items: { full_name: string; html_url: string; description: string | null; stargazers_count: number; language: string | null; license: { spdx_id: string } | null; pushed_at: string; topics?: string[] }[];
      };
      return {
        total: Math.min(j.total_count, 600),
        pagina: d.pagina,
        resultados: j.items.map((x) => ({
          nombre: x.full_name,
          url: x.html_url,
          descripcion: (x.description ?? "").slice(0, 300),
          estrellas: x.stargazers_count,
          lenguaje: x.language,
          licencia: x.license?.spdx_id ?? null,
          actualizado: x.pushed_at,
          temas: (x.topics ?? []).slice(0, 6),
        })),
      };
    });

    /** Qué agentes del catálogo ya están en este servidor. */
    app.get("/api/vps/servidores/:id/agentes", leer, async (request) => {
      const { id } = idParams.parse(request.params);
      return servidores.usar(id, async (c) => {
        const comando = CATALOGO.map((a) => `( ${a.revisar} ) >/dev/null 2>&1 && echo ${a.id}`).join("; ");
        const r = await ejecutar(c, `${comando}; echo "##ram"; free -m | awk '/^Mem:/{print $2" "$7}'`, { timeoutMs: 60_000 });
        const [lista = "", ram = ""] = r.salida.split("##ram");
        const [total = 0, libre = 0] = ram.trim().split(/\s+/).map(Number);
        return { instalados: lista.split("\n").map((x) => x.trim()).filter((x) => POR_ID.has(x)), ram: { totalMb: total, libreMb: libre } };
      });
    });

    app.post("/api/vps/servidores/:id/agentes/:agente", fuerte, async (request) => {
      const { id, agente } = z.object({ id: z.string().uuid(), agente: z.string().max(40) }).parse(request.params);
      const d = z.object({ accion: z.enum(["instalar", "quitar"]), confirmacion: z.string().max(200) }).parse(request.body);
      const a = POR_ID.get(agente);
      if (!a) throw new HttpError(404, "Ese agente no está en el catálogo");
      const servidor = await servidores.obtener(id);
      if (d.confirmacion !== servidor.name) throw new HttpError(400, `Escribe "${servidor.name}" para confirmar`, "doble_confirmacion");
      const user = currentUser(request);
      return servidores.usar(id, async (c) => {
        const sudo = servidor.username === "root" ? "" : "sudo -n ";
        const pasos = (d.accion === "instalar" ? a.instalar : a.quitar).map((p) => (a.tipo === "docker" || a.tipo === "ollama" || p.startsWith("command -v") ? p : `${sudo}${p}`));
        const r = await ejecutar(c, pasos.join(" && "), { timeoutMs: 20 * 60_000, maxBytes: 2 * 1024 * 1024 });
        await deps.audit.record({
          actorType: "usuario",
          actorUserId: user.id,
          action: d.accion === "instalar" ? "agente_instalado" : "agente_quitado",
          module: "vps_agentes",
          target: `${servidor.name}: ${a.nombre}`,
          outcome: r.codigo === 0 ? "ok" : "error",
          details: { codigo: r.codigo },
          ...clientInfo(request),
        });
        return { ok: r.codigo === 0, salida: `${r.salida}\n${r.error}`.trim().slice(-4000), uso: a.uso };
      });
    });
  };
}
