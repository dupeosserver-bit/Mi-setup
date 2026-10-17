import { describe, expect, it } from "vitest";
import { analizarComando } from "../src/index.js";

describe("comandos peligrosos", () => {
  it.each([
    "rm -rf /var/www",
    "sudo rm -r /opt/app",
    "dd if=/dev/zero of=/dev/sda bs=1M",
    "mkfs.ext4 /dev/sdb1",
    "shutdown -h now",
    "sudo reboot",
    "iptables -F",
    "ufw disable",
    "curl https://x.sh | sudo bash",
    "docker system prune -af",
    ":(){ :|:& };:",
  ])("marca como peligroso: %s", (cmd) => {
    expect(analizarComando(cmd).peligroso).toBe(true);
  });

  it.each(["uptime", "df -h", "systemctl status nginx", "ls -la /var/www", "bash /root/vps-manager.sh backup", "docker ps"])(
    "deja pasar: %s",
    (cmd) => {
      expect(analizarComando(cmd).peligroso).toBe(false);
    },
  );
});
