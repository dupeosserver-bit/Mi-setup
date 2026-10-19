/**
 * Plantillas de proyecto para la pantalla Código. Cada una devuelve sus
 * archivos (ruta relativa → contenido) y el comando para compilar o correr.
 */

export interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string;
  /** Necesita Java + Gradle (se instalan con un botón). */
  necesitaJava: boolean;
  /** Comando que se escribe en la terminal al tocar Compilar/Ejecutar. */
  comando: string | null;
  archivos(nombre: string): Record<string, string>;
}

const paquete = (nombre: string) => `net.mexicanland.${nombre.toLowerCase().replace(/[^a-z0-9]/g, "") || "proyecto"}`;
const clase = (nombre: string) => (nombre.replace(/[^A-Za-z0-9]/g, "") || "Proyecto").replace(/^[0-9]+/, "").replace(/^./, (c) => c.toUpperCase()) || "Proyecto";
const modId = (nombre: string) => nombre.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "") || "mimod";

export const PLANTILLAS: Plantilla[] = [
  {
    id: "plugin-paper",
    nombre: "Plugin de Minecraft (Paper / Spigot)",
    descripcion: "Plugin para servidores Paper/Purpur 1.21. Crea el .jar en build/libs para meterlo en la carpeta plugins.",
    necesitaJava: true,
    comando: "gradle build",
    archivos: (n) => {
      const pkg = paquete(n);
      const cls = clase(n);
      return {
        "settings.gradle": `rootProject.name = '${n}'\n`,
        "build.gradle": `plugins {
    id 'java'
}

group = '${pkg}'
version = '1.0.0'

repositories {
    mavenCentral()
    maven { url = 'https://repo.papermc.io/repository/maven-public/' }
}

dependencies {
    compileOnly 'io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT'
}

java {
    toolchain.languageVersion = JavaLanguageVersion.of(21)
}

processResources {
    filesMatching('plugin.yml') { expand(version: project.version) }
}
`,
        "src/main/resources/plugin.yml": `name: ${cls}
version: '\${version}'
main: ${pkg}.${cls}
api-version: '1.21'
description: Plugin hecho con Mi Setup
commands:
  hola:
    description: Te saluda
    usage: /hola
`,
        [`src/main/java/${pkg.replace(/\./g, "/")}/${cls}.java`]: `package ${pkg};

import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

public final class ${cls} extends JavaPlugin implements Listener {

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("${cls} encendido");
    }

    @EventHandler
    public void alEntrar(PlayerJoinEvent evento) {
        evento.getPlayer().sendMessage("¡Bienvenido a MexicanLand, " + evento.getPlayer().getName() + "!");
    }

    @Override
    public boolean onCommand(CommandSender quien, Command comando, String etiqueta, String[] args) {
        if (comando.getName().equalsIgnoreCase("hola")) {
            quien.sendMessage("¡Hola! Este plugin lo hiciste tú.");
            return true;
        }
        return false;
    }
}
`,
        "LEEME.md": `# ${n}\n\n1. Toca **Compilar** (la primera vez baja lo necesario).\n2. Copia \`build/libs/${n}-1.0.0.jar\` a la carpeta \`plugins\` de tu servidor.\n3. Reinicia el servidor y escribe \`/hola\`.\n`,
      };
    },
  },
  {
    id: "mod-fabric",
    nombre: "Mod de Minecraft (Fabric)",
    descripcion: "Mod para Fabric 1.21.4. La primera compilación tarda varios minutos (baja Minecraft para compilar).",
    necesitaJava: true,
    comando: "gradle build",
    archivos: (n) => {
      const id = modId(n);
      const pkg = paquete(n);
      const cls = clase(n);
      return {
        "settings.gradle": `pluginManagement {
    repositories {
        maven { url = 'https://maven.fabricmc.net/' }
        mavenCentral()
        gradlePluginPortal()
    }
}
rootProject.name = '${n}'
`,
        "gradle.properties": `org.gradle.jvmargs=-Xmx2G
minecraft_version=1.21.4
yarn_mappings=1.21.4+build.8
loader_version=0.16.10
fabric_version=0.119.2+1.21.4
mod_version=1.0.0
`,
        "build.gradle": `plugins {
    id 'fabric-loom' version '1.9-SNAPSHOT'
}

version = project.mod_version
group = '${pkg}'

dependencies {
    minecraft "com.mojang:minecraft:\${project.minecraft_version}"
    mappings "net.fabricmc:yarn:\${project.yarn_mappings}:v2"
    modImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"
    modImplementation "net.fabricmc.fabric-api:fabric-api:\${project.fabric_version}"
}

processResources {
    inputs.property 'version', project.version
    filesMatching('fabric.mod.json') { expand 'version': project.version }
}

java {
    toolchain.languageVersion = JavaLanguageVersion.of(21)
}
`,
        "src/main/resources/fabric.mod.json": JSON.stringify(
          {
            schemaVersion: 1,
            id,
            version: "${version}",
            name: n,
            description: "Mod hecho con Mi Setup",
            authors: ["MexicanLand"],
            environment: "*",
            entrypoints: { main: [`${pkg}.${cls}`] },
            depends: { fabricloader: ">=0.16.0", minecraft: "~1.21.4", java: ">=21", "fabric-api": "*" },
          },
          null,
          2,
        ),
        [`src/main/java/${pkg.replace(/\./g, "/")}/${cls}.java`]: `package ${pkg};

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ${cls} implements ModInitializer {
    public static final Logger LOG = LoggerFactory.getLogger("${id}");

    @Override
    public void onInitialize() {
        LOG.info("${n} cargado");
        ServerLifecycleEvents.SERVER_STARTED.register(servidor -> LOG.info("¡El servidor arrancó con ${n}!"));
    }
}
`,
        "LEEME.md": `# ${n}\n\n1. Toca **Compilar** (la primera vez tarda: baja Minecraft y Fabric).\n2. Copia \`build/libs/${n}-1.0.0.jar\` a la carpeta \`mods\` (necesita Fabric API).\n`,
      };
    },
  },
  {
    id: "datapack",
    nombre: "Datapack de Minecraft",
    descripcion: "Funciones y recetas sin mods. Toca Comprimir y mete el .zip en la carpeta datapacks del mundo.",
    necesitaJava: false,
    comando: null,
    archivos: (n) => {
      const id = modId(n);
      return {
        "pack.mcmeta": JSON.stringify({ pack: { pack_format: 61, description: `${n} · hecho con Mi Setup` } }, null, 2),
        [`data/${id}/function/hola.mcfunction`]: `tellraw @a {"text":"¡${n} está activo!","color":"gold"}\n`,
        "data/minecraft/tags/function/load.json": JSON.stringify({ values: [`${id}:hola`] }, null, 2),
      };
    },
  },
  {
    id: "web",
    nombre: "Página web",
    descripcion: "HTML, CSS y JavaScript. Ábrela en el navegador o pégala en Herramientas → Vista previa.",
    necesitaJava: false,
    comando: "start index.html",
    archivos: (n) => ({
      "index.html": `<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <title>${n}</title>\n  <link rel="stylesheet" href="estilos.css">\n</head>\n<body>\n  <h1>${n}</h1>\n  <button id="boton">Tócame</button>\n  <script src="app.js"></script>\n</body>\n</html>\n`,
      "estilos.css": `body { font-family: system-ui, sans-serif; margin: 40px; background: #111; color: #eee; }\nbutton { padding: 10px 18px; border-radius: 10px; border: 0; }\n`,
      "app.js": `document.getElementById("boton").onclick = () => alert("¡Funciona!");\n`,
    }),
  },
  {
    id: "python",
    nombre: "Programa en Python",
    descripcion: "Un archivo main.py listo para correr (necesitas Python instalado).",
    necesitaJava: false,
    comando: "python main.py",
    archivos: (n) => ({ "main.py": `def saludar(nombre):\n    return f"¡Hola, {nombre}!"\n\n\nif __name__ == "__main__":\n    print(saludar("${n}"))\n` }),
  },
  {
    id: "node",
    nombre: "Programa en Node.js / bot de Discord",
    descripcion: "index.js con package.json (necesitas Node.js instalado).",
    necesitaJava: false,
    comando: "node index.js",
    archivos: (n) => ({
      "package.json": JSON.stringify({ name: n.toLowerCase(), version: "1.0.0", type: "module", main: "index.js", scripts: { start: "node index.js" } }, null, 2),
      "index.js": `console.log("¡Hola desde ${n}!");\n`,
    }),
  },
];
