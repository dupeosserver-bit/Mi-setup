import type { CapacitorConfig } from "@capacitor/cli";

/**
 * La app de Android empaqueta la UI (apps/ui/dist, compilada con
 * `pnpm --filter @mi-setup/ui build:movil`) y habla con
 * https://setup.mexicanland.net (o MI_SETUP_API al compilar).
 */
const config: CapacitorConfig = {
  appId: "net.mexicanland.misetup",
  appName: "Mi Setup",
  webDir: "../ui/dist",
  server: { androidScheme: "https" },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    LocalNotifications: { iconColor: "#E5E5EA" },
  },
};

export default config;
