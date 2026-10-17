/**
 * pnpm branding — genera todos los íconos a partir de assets/branding/icon.png
 * (logo de MexicanLand, PNG 1024×1024 que coloca el usuario):
 *   - Web: favicon, apple-touch-icon y logo del encabezado (apps/ui/public/branding)
 *   - Windows: icon.ico e icon.png para Electron (apps/desktop/build)
 *   - Android: mipmaps e ícono adaptable (si existe apps/mobile/android)
 * Si no hay icon.png, avisa y termina sin error (la app muestra el nombre en texto).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "assets", "branding", "icon.png");
const log = (texto) => process.stdout.write(`${texto}\n`);

if (!existsSync(origen)) {
  log("No existe assets/branding/icon.png.");
  log("Coloca ahí el logo de MexicanLand (PNG 1024×1024) y vuelve a ejecutar: pnpm branding");
  log("Mientras tanto la app muestra el nombre \"MexicanLand\" en texto.");
  process.exit(0);
}

const sharp = (await import("sharp")).default;
const pngToIco = (await import("png-to-ico")).default;

const meta = await sharp(origen).metadata();
if (meta.width !== meta.height) log(`Aviso: icon.png no es cuadrado (${meta.width}×${meta.height}); se ajusta sin recortar.`);

const transparente = { r: 0, g: 0, b: 0, alpha: 0 };
const fondoApp = { r: 18, g: 18, b: 18, alpha: 1 };

const png = (lado, fondo = transparente) =>
  sharp(origen).resize(lado, lado, { fit: "contain", background: fondo }).flatten(fondo.alpha === 1 ? { background: fondo } : false).png().toBuffer();

/** Ícono centrado al 66 % sobre transparente (zona segura del ícono adaptable de Android). */
async function primerPlano(lado) {
  const interior = Math.round(lado * 0.66);
  const icono = await sharp(origen).resize(interior, interior, { fit: "contain", background: transparente }).png().toBuffer();
  return sharp({ create: { width: lado, height: lado, channels: 4, background: transparente } })
    .composite([{ input: icono, gravity: "center" }])
    .png()
    .toBuffer();
}

function escribir(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, datos);
  log(`  ✓ ${ruta.replace(raiz, "").replace(/^[\\/]/, "")}`);
}

log("Generando íconos de MexicanLand…");

// Web
const web = join(raiz, "apps", "ui", "public", "branding");
escribir(join(web, "favicon.png"), await png(64));
escribir(join(web, "apple-touch-icon.png"), await png(180, fondoApp));
escribir(join(web, "logo.png"), await png(256));
escribir(join(web, "icon-512.png"), await png(512));

// Windows (Electron)
const escritorio = join(raiz, "apps", "desktop", "build");
escribir(join(escritorio, "icon.png"), await png(512));
escribir(join(escritorio, "icon.ico"), await pngToIco(await Promise.all([16, 24, 32, 48, 64, 128, 256].map((l) => png(l)))));

// Android (Capacitor)
const res = join(raiz, "apps", "mobile", "android", "app", "src", "main", "res");
if (existsSync(res)) {
  const densidades = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
  for (const [d, [legado, adaptable]] of Object.entries(densidades)) {
    escribir(join(res, `mipmap-${d}`, "ic_launcher.png"), await png(legado, fondoApp));
    escribir(join(res, `mipmap-${d}`, "ic_launcher_round.png"), await png(legado, fondoApp));
    escribir(join(res, `mipmap-${d}`, "ic_launcher_foreground.png"), await primerPlano(adaptable));
  }
  const adaptableXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  escribir(join(res, "mipmap-anydpi-v26", "ic_launcher.xml"), adaptableXml);
  escribir(join(res, "mipmap-anydpi-v26", "ic_launcher_round.xml"), adaptableXml);
  escribir(
    join(res, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#121212</color>\n</resources>\n`,
  );
} else {
  log("  (Android: aún no existe apps/mobile/android; ejecuta este comando de nuevo después de crearlo)");
}

log("Listo.");
