import { describe, expect, it } from "vitest";
import { revisarCabeceras, revisarCorreo } from "../src/modules/ciberseguridad.js";
import { comandosDeAccion, interpretarAuditoria } from "../src/modules/vps/seguridad.js";

const SALIDA = `##os
Ubuntu 24.04.1 LTS
##ufw
Status: inactive
##fail2ban
inactive
##sshd
port 2222
permitrootlogin yes
passwordauthentication yes
##upgrades
0
##pendientes
31
##reinicio
si
##puertos
tcp 0.0.0.0:2222
tcp 0.0.0.0:443
tcp 127.0.0.1:5432
udp 0.0.0.0:25565
tcp [::]:443
##tailscale
100.64.0.7
`;

describe("seguridad del servidor", () => {
  it("interpreta la revisión y califica", () => {
    const a = interpretarAuditoria(SALIDA, 22);
    expect(a.sistema).toBe("Ubuntu 24.04.1 LTS");
    expect(a.puertoSsh).toBe(2222);
    expect(a.firewall).toEqual({ instalado: true, activo: false, reglas: [] });
    expect(a.puntos.find((p) => p.id === "firewall")?.accion).toBe("firewall_activar");
    expect(a.puntos.find((p) => p.id === "pendientes")?.estado).toBe("mal");
    expect(a.puertos.map((p) => `${p.puerto}/${p.proto}/${p.publico}`)).toEqual(["443/tcp/true", "2222/tcp/true", "5432/tcp/false", "25565/udp/true"]);
    expect(a.tailscale).toBe("100.64.0.7");
    expect(a.calificacion).toBeLessThan(50);
  });

  it("al encender el firewall deja SSH abierto primero y nunca cierra el puerto de SSH", () => {
    const c = comandosDeAccion({ accion: "firewall_activar", confirmacion: "" }, false, 2222);
    expect(c[1]).toBe("sudo -n ufw allow 2222/tcp");
    expect(c[2]).toBe("sudo -n ufw --force enable");
    expect(() => comandosDeAccion({ accion: "puerto_cerrar", puerto: 2222, proto: "tcp", confirmacion: "" }, true, 2222)).toThrow(/SSH/);
    expect(comandosDeAccion({ accion: "puerto_abrir", puerto: 25565, proto: "udp", confirmacion: "" }, true, 22)).toEqual(["ufw allow 25565/udp"]);
  });
});

describe("ciberseguridad", () => {
  it("revisa cabeceras", () => {
    const r = revisarCabeceras(new Headers({ "strict-transport-security": "max-age=31536000", "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }));
    expect(r.find((x) => x.id === "strict-transport-security")?.estado).toBe("ok");
    expect(r.find((x) => x.id === "x-frame-options")?.estado).toBe("ok");
    expect(r.find((x) => x.id === "referrer-policy")?.estado).toBe("aviso");
  });

  it("revisa SPF y DMARC", () => {
    const r = revisarCorreo(["google-site-verification=abc", "v=spf1 include:_spf.google.com ~all"], ["v=DMARC1; p=none; rua=mailto:x@y.z"]);
    expect(r[0]?.estado).toBe("ok");
    expect(r[1]?.estado).toBe("aviso");
    expect(revisarCorreo([], [])[0]?.estado).toBe("aviso");
  });
});
